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
