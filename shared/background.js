const api = typeof browser !== "undefined" ? browser : chrome;

const DEFAULT_SETTINGS = {
  applyOnAllPages: true,
  preloadColor: "#0b0d10",
  transitionDurationMs: 1800,
  initialHoldMs: 220,
  tabSwitchTransitionEnabled: true,
  tabSwitchTransitionDurationMs: 1800,
  tabSwitchInitialHoldMs: 220,
  brightnessThreshold: 185,
  darkenBrightBackgroundsEnabled: false,
  darkBackgroundColor: "#121417",
  backgroundBrightnessThreshold: 210,
  siteListMode: "blacklist",
  siteListHosts: "",
  uiLanguage: "auto",
  excludedHosts: ""
};
const LEGACY_TRANSITION_DEFAULTS = {
  transitionDurationMs: 900,
  initialHoldMs: 120
};
const OPEN_OPTIONS_MENU_ID = "open-options";
const menuApi = api.menus || api.contextMenus;
const TAB_STATE_STORAGE_KEY = "darkAntiFlashTabState";
const MESSAGE_DOCUMENT_INIT = "dark-anti-flash:document-init";
const MESSAGE_BRIGHTNESS_REPORT = "dark-anti-flash:brightness-report";
const MESSAGE_SET_TAB_GUARD = "dark-anti-flash:set-tab-guard";
const MESSAGE_TAB_ACTIVATED = "dark-anti-flash:tab-activated";

let tabStates = {};
let windowStates = {};
const windowActivationSequences = {};

function normalizeBrightness(value) {
  return value === "bright" || value === "dark" ? value : null;
}

function sessionStorageArea() {
  return api.storage && api.storage.session ? api.storage.session : null;
}

async function restoreTabState() {
  const area = sessionStorageArea();
  if (!area) {
    return;
  }

  try {
    const stored = await area.get(TAB_STATE_STORAGE_KEY);
    const state = stored && stored[TAB_STATE_STORAGE_KEY];
    if (state && typeof state === "object") {
      tabStates = state.tabs && typeof state.tabs === "object" ? state.tabs : {};
      windowStates =
        state.windows && typeof state.windows === "object" ? state.windows : {};
    }
  } catch (error) {
    // In-memory coordination still works when session storage is unavailable.
  }
}

async function persistTabState() {
  const area = sessionStorageArea();
  if (!area) {
    return;
  }

  try {
    await area.set({
      [TAB_STATE_STORAGE_KEY]: {
        tabs: tabStates,
        windows: windowStates
      }
    });
  } catch (error) {
    // Treat persistence as a resilience enhancement, not a hard dependency.
  }
}

const tabStateReady = restoreTabState();

async function sendTabMessage(tabId, message) {
  try {
    await api.tabs.sendMessage(tabId, message);
  } catch (error) {
    // Restricted pages and tabs without a content script cannot receive it.
  }
}

async function syncWindowGuards(windowId) {
  if (!api.tabs || typeof api.tabs.query !== "function") {
    return;
  }

  const windowState = windowStates[windowId] || {};
  const activeBrightness = normalizeBrightness(windowState.brightness);
  let tabs;

  try {
    tabs = await api.tabs.query({ windowId });
  } catch (error) {
    return;
  }

  await Promise.all(
    tabs.map((tab) => {
      const tabState = tabStates[tab.id] || {};
      const armed =
        !tab.active &&
        normalizeBrightness(tabState.brightness) === "bright" &&
        activeBrightness !== "bright";

      return sendTabMessage(tab.id, {
        type: MESSAGE_SET_TAB_GUARD,
        armed
      });
    })
  );
}

function documentKeyForSender(sender) {
  // documentId is opaque. Do not persist page URLs as part of tab state.
  return sender.documentId || null;
}

async function handleStateMessage(message, sender) {
  await tabStateReady;

  if (!sender.tab || !Number.isInteger(sender.tab.id)) {
    return null;
  }

  const tabId = sender.tab.id;
  const windowId = sender.tab.windowId;
  const tabKey = String(tabId);
  const windowKey = String(windowId);

  if (message.type === MESSAGE_DOCUMENT_INIT) {
    const previousTabState = tabStates[tabKey] || {};
    const currentWindowState = windowStates[windowKey] || {};
    const previousBrightness =
      normalizeBrightness(previousTabState.brightness) ||
      normalizeBrightness(previousTabState.activationSourceBrightness);
    const ambientBrightness = normalizeBrightness(currentWindowState.brightness);

    tabStates[tabKey] = {
      brightness: null,
      documentKey: documentKeyForSender(sender),
      windowId
    };

    if (sender.tab.active) {
      windowStates[windowKey] = {
        activeTabId: tabId,
        // Keep the outgoing document brightness until the new one reports.
        brightness: previousBrightness || ambientBrightness
      };
    }

    await persistTabState();
    return { previousBrightness, ambientBrightness };
  }

  if (message.type === MESSAGE_BRIGHTNESS_REPORT) {
    const brightness = normalizeBrightness(message.brightness);
    if (!brightness) {
      return null;
    }

    const existing = tabStates[tabKey] || {};
    const incomingDocumentKey = documentKeyForSender(sender);
    if (
      existing.documentKey &&
      incomingDocumentKey &&
      existing.documentKey !== incomingDocumentKey
    ) {
      return null;
    }

    tabStates[tabKey] = {
      ...existing,
      brightness,
      activationSourceBrightness: null,
      documentKey: incomingDocumentKey,
      windowId
    };

    const currentWindowState = windowStates[windowKey] || {};
    if (sender.tab.active || currentWindowState.activeTabId === tabId) {
      windowStates[windowKey] = {
        activeTabId: tabId,
        brightness
      };
    }

    await persistTabState();
    await syncWindowGuards(windowId);
    return { brightness };
  }

  return null;
}

function openOptionsPage() {
  const result = api.runtime.openOptionsPage();
  if (result && typeof result.catch === "function") {
    result.catch(() => {});
  }
}

function installActionMenu() {
  if (!menuApi) {
    return;
  }

  const createMenu = () => {
    menuApi.create({
      id: OPEN_OPTIONS_MENU_ID,
      title: "Open options",
      contexts: ["action"]
    });
  };

  try {
    const result = menuApi.removeAll();
    if (result && typeof result.then === "function") {
      result.then(createMenu, createMenu);
      return;
    }
  } catch (error) {
    createMenu();
    return;
  }

  createMenu();
}

function storageGet(defaults) {
  try {
    const result = api.storage.sync.get(defaults);
    if (result && typeof result.then === "function") {
      return result;
    }
  } catch (error) {
    // Fall back to callback style.
  }

  return new Promise((resolve) => {
    api.storage.sync.get(defaults, (value) => resolve(value));
  });
}

function storageSet(value) {
  try {
    const result = api.storage.sync.set(value);
    if (result && typeof result.then === "function") {
      return result;
    }
  } catch (error) {
    // Fall back to callback style.
  }

  return new Promise((resolve) => {
    api.storage.sync.set(value, () => resolve());
  });
}

function shouldReplaceLegacyValue(existingValue, legacyValue) {
  return existingValue === undefined || Number(existingValue) === legacyValue;
}

api.runtime.onInstalled.addListener(async () => {
  const existing = await storageGet({});
  const merged = { ...DEFAULT_SETTINGS, ...existing };

  // Older installs used a shorter fade. Keep intentional user changes, but
  // move unset or untouched installs to the softer defaults.
  if (
    shouldReplaceLegacyValue(
      existing.transitionDurationMs,
      LEGACY_TRANSITION_DEFAULTS.transitionDurationMs
    )
  ) {
    merged.transitionDurationMs = DEFAULT_SETTINGS.transitionDurationMs;
  }

  if (
    shouldReplaceLegacyValue(
      existing.initialHoldMs,
      LEGACY_TRANSITION_DEFAULTS.initialHoldMs
    )
  ) {
    merged.initialHoldMs = DEFAULT_SETTINGS.initialHoldMs;
  }

  if (existing.tabSwitchTransitionEnabled === undefined) {
    merged.tabSwitchTransitionEnabled = DEFAULT_SETTINGS.tabSwitchTransitionEnabled;
  }

  if (existing.tabSwitchTransitionDurationMs === undefined) {
    merged.tabSwitchTransitionDurationMs = DEFAULT_SETTINGS.tabSwitchTransitionDurationMs;
  }

  if (existing.tabSwitchInitialHoldMs === undefined) {
    merged.tabSwitchInitialHoldMs = DEFAULT_SETTINGS.tabSwitchInitialHoldMs;
  }

  if (existing.siteListMode === undefined) {
    merged.siteListMode = DEFAULT_SETTINGS.siteListMode;
  }

  if (existing.siteListHosts === undefined) {
    merged.siteListHosts = existing.excludedHosts || DEFAULT_SETTINGS.siteListHosts;
  }

  await storageSet(merged);
});

if (api.action && api.action.onClicked) {
  api.action.onClicked.addListener(openOptionsPage);
}

if (menuApi && menuApi.onClicked) {
  menuApi.onClicked.addListener((info) => {
    if (info.menuItemId === OPEN_OPTIONS_MENU_ID) {
      openOptionsPage();
    }
  });

  installActionMenu();
}

if (api.runtime && api.runtime.onMessage) {
  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (
      !message ||
      (message.type !== MESSAGE_DOCUMENT_INIT &&
        message.type !== MESSAGE_BRIGHTNESS_REPORT)
    ) {
      return false;
    }

    handleStateMessage(message, sender).then(
      (response) => sendResponse(response),
      () => sendResponse(null)
    );
    return true;
  });
}

if (api.tabs && api.tabs.onActivated) {
  api.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
    await tabStateReady;

    const windowKey = String(windowId);
    const tabKey = String(tabId);
    const activationSequence =
      (windowActivationSequences[windowKey] || 0) + 1;
    windowActivationSequences[windowKey] = activationSequence;
    const previousBrightness = normalizeBrightness(
      windowStates[windowKey] && windowStates[windowKey].brightness
    );
    const nextBrightness = normalizeBrightness(
      tabStates[tabKey] && tabStates[tabKey].brightness
    );

    tabStates[tabKey] = {
      ...(tabStates[tabKey] || {}),
      activationSourceBrightness: previousBrightness,
      windowId
    };

    windowStates[windowKey] = {
      activeTabId: tabId,
      brightness: nextBrightness
    };
    await persistTabState();

    if (windowActivationSequences[windowKey] !== activationSequence) {
      return;
    }

    await sendTabMessage(tabId, {
      type: MESSAGE_TAB_ACTIVATED,
      previousBrightness
    });
    await syncWindowGuards(windowId);
  });
}

if (api.tabs && api.tabs.onRemoved) {
  api.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
    await tabStateReady;
    delete tabStates[String(tabId)];

    const windowKey = String(removeInfo.windowId);
    if (
      windowStates[windowKey] &&
      windowStates[windowKey].activeTabId === tabId
    ) {
      delete windowStates[windowKey];
    }

    await persistTabState();
  });
}

if (api.windows && api.windows.onRemoved) {
  api.windows.onRemoved.addListener(async (windowId) => {
    await tabStateReady;
    const windowKey = String(windowId);
    delete windowStates[windowKey];
    delete windowActivationSequences[windowKey];
    await persistTabState();
  });
}
