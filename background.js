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
  excludedHosts: ""
};
const LEGACY_TRANSITION_DEFAULTS = {
  transitionDurationMs: 900,
  initialHoldMs: 120
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

  await storageSet(merged);
});
