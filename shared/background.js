// Chrome runs this as a service worker (shared modules come in through
// importScripts); Firefox loads them first via background.scripts.
if (typeof importScripts === "function") {
  importScripts("transition-policy.js", "settings.js", "color.js");
}

const api = typeof browser !== "undefined" ? browser : chrome;
const {
  DEFAULT_SETTINGS,
  MESSAGES,
  PAGE_BRIGHTNESS_STORAGE_KEY,
  PAGE_BRIGHTNESS,
  clamp,
  compileSettings,
  isLocationListed,
  isWithinSchedule,
  nextScheduleChange,
  setLocationListed,
  siteRulesToMatchPatterns
} = globalThis.DarkAntiFlashSettings;
const { normalizeBrightness, planGuardMessages } = globalThis.DarkAntiFlashPolicy;
const { brightnessOf, rgbToHex } = globalThis.DarkAntiFlashColor;

const LEGACY_TRANSITION_DEFAULTS = {
  transitionDurationMs: 900,
  initialHoldMs: 120
};
const OPEN_OPTIONS_MENU_ID = "open-options";
const EARLY_GUARD_SCRIPT_ID = "dark-anti-flash-early-guard";
const SCHEDULE_ALARM = "dark-anti-flash-schedule";
const menuApi = api.menus || api.contextMenus;
const TAB_STATE_STORAGE_KEY = "darkAntiFlashTabState";
const CAPTURE_MIN_INTERVAL_MS = 1500;

let tabStates = {};
let windowStates = {};
const windowActivationSequences = {};
const lastCaptureAt = {};

// ---- Settings cache ----

let settingsPromise = null;

function loadSettings() {
  if (!settingsPromise) {
    settingsPromise = api.storage.sync.get(null).then(compileSettings);
  }
  return settingsPromise;
}

// ---- Per-tab brightness state (kept in session storage so it survives the
// service worker or event page being suspended) ----

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

let persistTimer = null;

// Debounced: brightness reports and activations can arrive in bursts.
function persistTabState() {
  const area = sessionStorageArea();
  if (!area || persistTimer !== null) {
    return;
  }
  persistTimer = setTimeout(async () => {
    persistTimer = null;
    try {
      await area.set({
        [TAB_STATE_STORAGE_KEY]: { tabs: tabStates, windows: windowStates }
      });
    } catch (error) {
      // Treat persistence as a resilience enhancement, not a hard dependency.
    }
  }, 150);
}

const tabStateReady = restoreTabState();

async function sendTabMessage(tabId, message) {
  try {
    await api.tabs.sendMessage(tabId, message);
  } catch (error) {
    // Restricted pages and tabs without a content script cannot receive it.
  }
}

// Pre-paints a guard in background tabs that would flash when switched to,
// messaging only tabs whose guard state changed since the last message.
async function syncWindowGuards(windowId) {
  const windowState = windowStates[windowId] || {};
  let tabs;
  try {
    tabs = await api.tabs.query({ windowId });
  } catch (error) {
    return;
  }

  const tabBrightness = {};
  const lastSent = {};
  for (const tab of tabs) {
    const state = tabStates[tab.id] || {};
    tabBrightness[tab.id] = state.brightness;
    lastSent[tab.id] = state.guardArmed;
  }

  const messages = planGuardMessages(tabs, tabBrightness, windowState.brightness, lastSent);
  for (const { tabId, armed } of messages) {
    tabStates[tabId] = { ...(tabStates[tabId] || {}), guardArmed: armed };
  }
  if (messages.length > 0) {
    persistTabState();
  }
  await Promise.all(
    messages.map(({ tabId, armed }) =>
      sendTabMessage(tabId, {
        type: MESSAGES.SET_TAB_GUARD,
        armed,
        activeColor: windowState.color || null
      })
    )
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

  if (message.type === MESSAGES.DOCUMENT_INIT) {
    const previousTabState = tabStates[tabKey] || {};
    const currentWindowState = windowStates[windowKey] || {};
    const previousBrightness =
      normalizeBrightness(previousTabState.brightness) ||
      normalizeBrightness(previousTabState.activationSourceBrightness);
    const previousColor = previousTabState.brightness
      ? previousTabState.color
      : previousTabState.activationSourceColor;
    const ambientBrightness = normalizeBrightness(currentWindowState.brightness);

    // A new document starts without any guard, so guardArmed resets too.
    tabStates[tabKey] = {
      brightness: null,
      color: null,
      documentKey: documentKeyForSender(sender),
      windowId
    };

    if (sender.tab.active) {
      windowStates[windowKey] = {
        activeTabId: tabId,
        // Keep the outgoing document brightness until the new one reports.
        brightness: previousBrightness || ambientBrightness,
        color: previousColor || currentWindowState.color || null
      };
    }

    persistTabState();
    return {
      previousBrightness,
      previousColor: previousColor || null,
      ambientBrightness,
      ambientColor: currentWindowState.color || null
    };
  }

  if (message.type === MESSAGES.BRIGHTNESS_REPORT) {
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

    const color = typeof message.color === "string" ? message.color : null;
    tabStates[tabKey] = {
      ...existing,
      brightness,
      color,
      activationSourceBrightness: null,
      activationSourceColor: null,
      documentKey: incomingDocumentKey,
      windowId
    };

    const currentWindowState = windowStates[windowKey] || {};
    const isActive = sender.tab.active || currentWindowState.activeTabId === tabId;
    if (isActive) {
      windowStates[windowKey] = { activeTabId: tabId, brightness, color };
    }

    persistTabState();
    await syncWindowGuards(windowId);

    if (isActive && sender.tab.active && !message.overlayVisible) {
      void refineWithScreenshot(tabId, windowId, incomingDocumentKey);
    }
    return { brightness };
  }

  return null;
}

// ---- Pixel-accurate detection (opt-in) ----
// Measures the real rendered pixels of the visible tab, which catches bright
// images and canvases that CSS colors miss. The screenshot is downscaled and
// averaged in memory here, then discarded; it never leaves the device.

async function averageScreenshotColor(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const width = 32;
  const height = 18;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const { data } = context.getImageData(0, 0, width, height);
  let r = 0;
  let g = 0;
  let b = 0;
  for (let index = 0; index < data.length; index += 4) {
    r += data[index];
    g += data[index + 1];
    b += data[index + 2];
  }
  const pixels = data.length / 4;
  return { r: r / pixels, g: g / pixels, b: b / pixels, a: 1 };
}

async function refineWithScreenshot(tabId, windowId, documentKey) {
  const settings = await loadSettings();
  if (!settings.accurateDetection || typeof OffscreenCanvas === "undefined") {
    return;
  }
  const now = Date.now();
  if (now - (lastCaptureAt[tabId] || 0) < CAPTURE_MIN_INTERVAL_MS) {
    return;
  }
  lastCaptureAt[tabId] = now;

  let average;
  try {
    const dataUrl = await api.tabs.captureVisibleTab(windowId, {
      format: "jpeg",
      quality: 40
    });
    average = await averageScreenshotColor(dataUrl);
  } catch (error) {
    // Not capturable (restricted page, minimized window, rate limit).
    return;
  }

  const state = tabStates[String(tabId)];
  if (!state || (documentKey && state.documentKey !== documentKey)) {
    return;
  }
  const brightness = brightnessOf(average) >= settings.brightnessThreshold ? "bright" : "dark";
  const color = rgbToHex(average);
  tabStates[String(tabId)] = { ...state, brightness, color };
  const windowState = windowStates[String(windowId)];
  if (windowState && windowState.activeTabId === tabId) {
    windowStates[String(windowId)] = { ...windowState, brightness, color };
  }
  persistTabState();
  await syncWindowGuards(windowId);
}

// ---- Early guard registration ----
// The guard must paint before the page's first frame, which only a
// document_start content script can do. Registering it dynamically lets the
// browser skip it on excluded sites, when the guard is off, and outside the
// schedule, instead of painting and then removing it (a dark flash).

let registrationChain = Promise.resolve();

function syncEarlyGuardRegistration() {
  registrationChain = registrationChain.then(doSyncEarlyGuardRegistration, doSyncEarlyGuardRegistration);
  return registrationChain;
}

function sameRegistration(existing, wanted) {
  const list = (value) => JSON.stringify([...(value || [])].sort());
  return (
    list(existing.js) === list(wanted.js) &&
    list(existing.matches) === list(wanted.matches) &&
    list(existing.excludeMatches) === list(wanted.excludeMatches)
  );
}

async function doSyncEarlyGuardRegistration() {
  if (!api.scripting || typeof api.scripting.registerContentScripts !== "function") {
    return;
  }
  const settings = await loadSettings();
  const now = new Date();
  let registration = null;

  // osDark is checked by the script itself (the background can't read the
  // system color scheme in a service worker); night is handled here.
  const scheduleAllows =
    settings.scheduleMode !== "night" || isWithinSchedule(settings, now, false);

  if (settings.applyOnAllPages && scheduleAllows) {
    const patterns = siteRulesToMatchPatterns(settings.siteListRules);
    const js = [
      "settings.js",
      ...(settings.scheduleMode === "osDark" ? ["content/early-guard-os-dark.js"] : []),
      "content/early-guard.js"
    ];
    const base = {
      id: EARLY_GUARD_SCRIPT_ID,
      js,
      runAt: "document_start",
      allFrames: false,
      persistAcrossSessions: true
    };
    if (settings.siteListMode === "whitelist") {
      registration = patterns.length > 0 ? { ...base, matches: patterns } : null;
    } else {
      registration = { ...base, matches: ["<all_urls>"] };
      if (patterns.length > 0) {
        registration.excludeMatches = patterns;
      }
    }
  }

  try {
    const existing = await api.scripting.getRegisteredContentScripts({
      ids: [EARLY_GUARD_SCRIPT_ID]
    });
    // The background wakes often; leave a matching registration untouched
    // so page loads never hit a moment without it.
    if (existing.length > 0 && registration && sameRegistration(existing[0], registration)) {
      await scheduleNextScheduleAlarm(settings, now);
      return;
    }
    if (existing.length > 0) {
      await api.scripting.unregisterContentScripts({ ids: [EARLY_GUARD_SCRIPT_ID] });
    }
    if (registration) {
      try {
        await api.scripting.registerContentScripts([registration]);
      } catch (error) {
        // A pattern the browser rejects shouldn't cost the whole guard.
        if (registration.excludeMatches) {
          delete registration.excludeMatches;
          await api.scripting.registerContentScripts([registration]);
        } else {
          throw error;
        }
      }
    }
  } catch (error) {
    console.warn("Dark Background Anti-Flash: early guard registration failed", error);
  }

  await scheduleNextScheduleAlarm(settings, now);
}

async function scheduleNextScheduleAlarm(settings, now) {
  if (!api.alarms) {
    return;
  }
  await api.alarms.clear(SCHEDULE_ALARM);
  const next = nextScheduleChange(settings, now);
  if (next) {
    // A second of slack so the boundary has definitely passed when it fires.
    api.alarms.create(SCHEDULE_ALARM, { when: next.getTime() + 1000 });
  }
}

// ---- Toolbar badge ----

async function updateBadge() {
  const settings = await loadSettings();
  try {
    await api.action.setBadgeBackgroundColor({ color: "#3f4b59" });
    await api.action.setBadgeText({ text: settings.applyOnAllPages ? "" : "off" });
  } catch (error) {
    // Badge support is cosmetic.
  }
}

async function flashBadge(tabId, text) {
  try {
    await api.action.setBadgeText({ tabId, text });
    setTimeout(() => {
      // Clearing the per-tab text falls back to the global badge.
      Promise.resolve(api.action.setBadgeText({ tabId, text: null })).catch(() => {});
    }, 1500);
  } catch (error) {
    // Cosmetic.
  }
}

// ---- Keyboard shortcuts ----

async function activeTab() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function tabLocation(tab) {
  try {
    const url = new URL(tab.url);
    return url.hostname ? { hostname: url.hostname, pathname: url.pathname } : null;
  } catch (error) {
    return null;
  }
}

async function stepPageBrightness(hostname, direction) {
  const stored = await api.storage.local.get({ [PAGE_BRIGHTNESS_STORAGE_KEY]: {} });
  const map = { ...(stored[PAGE_BRIGHTNESS_STORAGE_KEY] || {}) };
  const current = clamp(map[hostname], PAGE_BRIGHTNESS.min, PAGE_BRIGHTNESS.max, PAGE_BRIGHTNESS.default);
  const next = clamp(
    current + direction * PAGE_BRIGHTNESS.step * 2,
    PAGE_BRIGHTNESS.min,
    PAGE_BRIGHTNESS.max,
    PAGE_BRIGHTNESS.default
  );
  if (next === PAGE_BRIGHTNESS.default) {
    delete map[hostname];
  } else {
    map[hostname] = next;
  }
  await api.storage.local.set({ [PAGE_BRIGHTNESS_STORAGE_KEY]: map });
  return next;
}

async function handleCommand(command) {
  const tab = await activeTab();
  const location = tab && tabLocation(tab);

  if (command === "toggle-guard") {
    const settings = await loadSettings();
    await api.storage.sync.set({ applyOnAllPages: !settings.applyOnAllPages });
    return;
  }

  if (!location) {
    return;
  }

  if (command === "toggle-site") {
    const settings = await loadSettings();
    const listed = isLocationListed(settings.siteListRules, location.hostname, location.pathname);
    await api.storage.sync.set({
      siteListHosts: setLocationListed(
        settings.siteListHosts,
        location.hostname,
        location.pathname,
        !listed
      )
    });
    const activeNow = settings.siteListMode === "whitelist" ? !listed : listed;
    void flashBadge(tab.id, activeNow ? "on" : "off");
    return;
  }

  if (command === "brightness-up" || command === "brightness-down") {
    const value = await stepPageBrightness(location.hostname, command === "brightness-up" ? 1 : -1);
    void flashBadge(tab.id, String(value));
  }
}

// ---- Install, options menu, listeners ----

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
      title: api.i18n.getMessage("menuOpenOptions") || "Open options",
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

function shouldReplaceLegacyValue(existingValue, legacyValue) {
  return existingValue === undefined || Number(existingValue) === legacyValue;
}

api.runtime.onInstalled.addListener(async () => {
  const existing = await api.storage.sync.get(null);
  const merged = { ...DEFAULT_SETTINGS, ...existing };

  // Older installs used a shorter fade. Keep intentional user changes, but
  // move unset or untouched installs to the softer defaults.
  if (shouldReplaceLegacyValue(existing.transitionDurationMs, LEGACY_TRANSITION_DEFAULTS.transitionDurationMs)) {
    merged.transitionDurationMs = DEFAULT_SETTINGS.transitionDurationMs;
  }
  if (shouldReplaceLegacyValue(existing.initialHoldMs, LEGACY_TRANSITION_DEFAULTS.initialHoldMs)) {
    merged.initialHoldMs = DEFAULT_SETTINGS.initialHoldMs;
  }
  if (existing.siteListHosts === undefined) {
    merged.siteListHosts = existing.excludedHosts || DEFAULT_SETTINGS.siteListHosts;
  }

  await api.storage.sync.set(merged);
  await syncEarlyGuardRegistration();
  await updateBadge();
});

if (api.runtime.onStartup) {
  api.runtime.onStartup.addListener(() => {
    void syncEarlyGuardRegistration();
    void updateBadge();
  });
}

api.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") {
    return;
  }
  settingsPromise = null;
  const affectsRegistration = [
    "applyOnAllPages",
    "siteListMode",
    "siteListHosts",
    "excludedHosts",
    "scheduleMode",
    "scheduleStart",
    "scheduleEnd"
  ].some((key) => Object.prototype.hasOwnProperty.call(changes, key));
  if (affectsRegistration) {
    void syncEarlyGuardRegistration();
  }
  if (Object.prototype.hasOwnProperty.call(changes, "applyOnAllPages")) {
    void updateBadge();
  }
});

if (api.alarms) {
  api.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SCHEDULE_ALARM) {
      void syncEarlyGuardRegistration();
    }
  });
}

if (api.commands && api.commands.onCommand) {
  api.commands.onCommand.addListener((command) => {
    void handleCommand(command);
  });
}

if (menuApi && menuApi.onClicked) {
  menuApi.onClicked.addListener((info) => {
    if (info.menuItemId === OPEN_OPTIONS_MENU_ID) {
      openOptionsPage();
    }
  });

  installActionMenu();
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    !message ||
    (message.type !== MESSAGES.DOCUMENT_INIT && message.type !== MESSAGES.BRIGHTNESS_REPORT)
  ) {
    return false;
  }

  handleStateMessage(message, sender).then(
    (response) => sendResponse(response),
    () => sendResponse(null)
  );
  return true;
});

api.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  await tabStateReady;

  const windowKey = String(windowId);
  const tabKey = String(tabId);
  const activationSequence = (windowActivationSequences[windowKey] || 0) + 1;
  windowActivationSequences[windowKey] = activationSequence;
  const previousWindowState = windowStates[windowKey] || {};
  const previousBrightness = normalizeBrightness(previousWindowState.brightness);
  const previousColor = previousWindowState.color || null;
  const tabState = tabStates[tabKey] || {};

  // The activated tab's guard is resolved by the activation message itself.
  tabStates[tabKey] = {
    ...tabState,
    activationSourceBrightness: previousBrightness,
    activationSourceColor: previousColor,
    guardArmed: false,
    windowId
  };
  windowStates[windowKey] = {
    activeTabId: tabId,
    brightness: normalizeBrightness(tabState.brightness),
    color: tabState.color || null
  };
  persistTabState();

  if (windowActivationSequences[windowKey] !== activationSequence) {
    return;
  }

  await sendTabMessage(tabId, {
    type: MESSAGES.TAB_ACTIVATED,
    previousBrightness,
    previousColor
  });
  await syncWindowGuards(windowId);
});

api.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  await tabStateReady;
  delete tabStates[String(tabId)];
  delete lastCaptureAt[tabId];

  const windowKey = String(removeInfo.windowId);
  if (windowStates[windowKey] && windowStates[windowKey].activeTabId === tabId) {
    delete windowStates[windowKey];
  }
  persistTabState();
});

if (api.windows && api.windows.onRemoved) {
  api.windows.onRemoved.addListener(async (windowId) => {
    await tabStateReady;
    const windowKey = String(windowId);
    delete windowStates[windowKey];
    delete windowActivationSequences[windowKey];
    persistTabState();
  });
}

// Firefox event pages and Chrome service workers restart often; make sure
// the registration and schedule alarm match the current settings each time.
void syncEarlyGuardRegistration();
