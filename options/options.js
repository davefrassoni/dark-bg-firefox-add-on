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

const form = document.getElementById("settings-form");
const status = document.getElementById("status");

const fields = {
  applyOnAllPages: document.getElementById("applyOnAllPages"),
  preloadColor: document.getElementById("preloadColor"),
  preloadColorText: document.getElementById("preloadColorText"),
  transitionDurationMs: document.getElementById("transitionDurationMs"),
  initialHoldMs: document.getElementById("initialHoldMs"),
  tabSwitchTransitionEnabled: document.getElementById("tabSwitchTransitionEnabled"),
  tabSwitchTransitionDurationMs: document.getElementById("tabSwitchTransitionDurationMs"),
  tabSwitchInitialHoldMs: document.getElementById("tabSwitchInitialHoldMs"),
  brightnessThreshold: document.getElementById("brightnessThreshold"),
  excludedHosts: document.getElementById("excludedHosts"),
  resetDefaults: document.getElementById("resetDefaults")
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

function clamp(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, num));
}

function normalizeHexColor(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  const hexPattern = /^#([0-9a-f]{3}|[0-9a-f]{6})$/;
  if (!hexPattern.test(normalized)) {
    return fallback;
  }
  if (normalized.length === 4) {
    return (
      "#" +
      normalized[1] +
      normalized[1] +
      normalized[2] +
      normalized[2] +
      normalized[3] +
      normalized[3]
    );
  }
  return normalized;
}

function syncColorInputs(colorInput, textInput) {
  colorInput.addEventListener("input", () => {
    textInput.value = colorInput.value;
  });

  textInput.addEventListener("input", () => {
    const normalized = normalizeHexColor(textInput.value, colorInput.value);
    if (normalized !== colorInput.value) {
      colorInput.value = normalized;
    }
  });
}

function populateForm(settings) {
  fields.applyOnAllPages.checked = settings.applyOnAllPages;
  fields.preloadColor.value = settings.preloadColor;
  fields.preloadColorText.value = settings.preloadColor;
  fields.transitionDurationMs.value = settings.transitionDurationMs;
  fields.initialHoldMs.value = settings.initialHoldMs;
  fields.tabSwitchTransitionEnabled.checked = settings.tabSwitchTransitionEnabled;
  fields.tabSwitchTransitionDurationMs.value = settings.tabSwitchTransitionDurationMs;
  fields.tabSwitchInitialHoldMs.value = settings.tabSwitchInitialHoldMs;
  fields.brightnessThreshold.value = settings.brightnessThreshold;
  fields.excludedHosts.value = settings.excludedHosts || "";
}

function readForm() {
  return {
    applyOnAllPages: fields.applyOnAllPages.checked,
    preloadColor: normalizeHexColor(fields.preloadColorText.value, DEFAULT_SETTINGS.preloadColor),
    transitionDurationMs: clamp(
      fields.transitionDurationMs.value,
      0,
      10000,
      DEFAULT_SETTINGS.transitionDurationMs
    ),
    initialHoldMs: clamp(fields.initialHoldMs.value, 0, 5000, DEFAULT_SETTINGS.initialHoldMs),
    tabSwitchTransitionEnabled: fields.tabSwitchTransitionEnabled.checked,
    tabSwitchTransitionDurationMs: clamp(
      fields.tabSwitchTransitionDurationMs.value,
      0,
      10000,
      DEFAULT_SETTINGS.tabSwitchTransitionDurationMs
    ),
    tabSwitchInitialHoldMs: clamp(
      fields.tabSwitchInitialHoldMs.value,
      0,
      5000,
      DEFAULT_SETTINGS.tabSwitchInitialHoldMs
    ),
    brightnessThreshold: clamp(
      fields.brightnessThreshold.value,
      0,
      255,
      DEFAULT_SETTINGS.brightnessThreshold
    ),
    excludedHosts: fields.excludedHosts.value
  };
}

function showStatus(message) {
  status.textContent = message;
  setTimeout(() => {
    if (status.textContent === message) {
      status.textContent = "";
    }
  }, 1800);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = readForm();
  await storageSet(values);
  populateForm(values);
  showStatus("Saved.");
});

fields.resetDefaults.addEventListener("click", async () => {
  await storageSet(DEFAULT_SETTINGS);
  populateForm(DEFAULT_SETTINGS);
  showStatus("Defaults restored.");
});

syncColorInputs(fields.preloadColor, fields.preloadColorText);

(async () => {
  const stored = await storageGet(DEFAULT_SETTINGS);
  const settings = { ...DEFAULT_SETTINGS, ...stored };
  populateForm(settings);
})();
