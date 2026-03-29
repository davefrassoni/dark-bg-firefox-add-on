const api = typeof browser !== "undefined" ? browser : chrome;

const DEFAULT_SETTINGS = {
  applyOnAllPages: true,
  preloadColor: "#0b0d10",
  transitionDurationMs: 900,
  initialHoldMs: 120,
  forceColorOnBrightSites: false,
  brightSiteColor: "#14191f",
  brightnessThreshold: 185,
  excludedHosts: "",
  alwaysForceColorHosts: ""
};

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

api.runtime.onInstalled.addListener(async () => {
  const existing = await storageGet(DEFAULT_SETTINGS);
  const merged = { ...DEFAULT_SETTINGS, ...existing };
  await storageSet(merged);
});
