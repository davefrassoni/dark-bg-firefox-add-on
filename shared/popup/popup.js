const api = typeof browser !== "undefined" ? browser : chrome;
const $ = (selector) => document.querySelector(selector);

const MESSAGE_SET_PAGE_BRIGHTNESS = "dark-anti-flash:set-page-brightness";
const PAGE_BRIGHTNESS_STORAGE_KEY = "darkAntiFlashPageBrightness";
const BRIGHTNESS_MIN = 30;
const BRIGHTNESS_MAX = 150;
const BRIGHTNESS_DEFAULT = 100;

const hostLabel = $("#host-label");
const fadeToggle = $("#fade-toggle");
const slider = $("#brightness-slider");
const sliderValue = $("#brightness-value");
const resetButton = $("#brightness-reset");
const statusNode = $("#status");

let activeTabId = null;
let activeHostname = null;
let persistTimer = null;

function status(text, isError = false) {
  statusNode.textContent = text;
  statusNode.className = isError ? "error" : "";
}

function clamp(value, min, max, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.min(max, Math.max(min, num)) : fallback;
}

function storageGet(area, defaults) {
  try {
    const result = api.storage[area].get(defaults);
    if (result && typeof result.then === "function") {
      return result;
    }
  } catch (error) {
    // Fall back to callback style.
  }
  return new Promise((resolve) => {
    api.storage[area].get(defaults, (value) => resolve(value));
  });
}

function storageSet(area, value) {
  try {
    const result = api.storage[area].set(value);
    if (result && typeof result.then === "function") {
      return result;
    }
  } catch (error) {
    // Fall back to callback style.
  }
  return new Promise((resolve) => {
    api.storage[area].set(value, () => resolve());
  });
}

function setFadeToggleState(enabled) {
  fadeToggle.dataset.state = enabled ? "on" : "off";
  fadeToggle.textContent = enabled ? "ON" : "OFF";
}

async function loadFadeState() {
  const stored = await storageGet("sync", { applyOnAllPages: true });
  setFadeToggleState(Boolean(stored.applyOnAllPages));
}

fadeToggle.addEventListener("click", async () => {
  const nextEnabled = fadeToggle.dataset.state !== "on";
  setFadeToggleState(nextEnabled);
  await storageSet("sync", { applyOnAllPages: nextEnabled });
  status(nextEnabled ? "Fade guard enabled." : "Fade guard disabled.");
});

function setSliderDisplay(value) {
  slider.value = value;
  sliderValue.textContent = `${value}%`;
}

async function sendBrightnessToTab(value) {
  if (!activeTabId) {
    return;
  }
  try {
    await api.tabs.sendMessage(activeTabId, {
      type: MESSAGE_SET_PAGE_BRIGHTNESS,
      value
    });
  } catch (error) {
    // No content script on this page (e.g. a browser settings page).
  }
}

async function persistBrightness(value) {
  if (!activeHostname) {
    return;
  }
  const stored = await storageGet("local", { [PAGE_BRIGHTNESS_STORAGE_KEY]: {} });
  const map = { ...(stored[PAGE_BRIGHTNESS_STORAGE_KEY] || {}) };
  if (value === BRIGHTNESS_DEFAULT) {
    delete map[activeHostname];
  } else {
    map[activeHostname] = value;
  }
  await storageSet("local", { [PAGE_BRIGHTNESS_STORAGE_KEY]: map });
}

function schedulePersist(value) {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => persistBrightness(value), 200);
}

slider.addEventListener("input", () => {
  const value = clamp(slider.value, BRIGHTNESS_MIN, BRIGHTNESS_MAX, BRIGHTNESS_DEFAULT);
  setSliderDisplay(value);
  sendBrightnessToTab(value);
  schedulePersist(value);
});

resetButton.addEventListener("click", () => {
  setSliderDisplay(BRIGHTNESS_DEFAULT);
  sendBrightnessToTab(BRIGHTNESS_DEFAULT);
  schedulePersist(BRIGHTNESS_DEFAULT);
  status("Brightness reset for this page.");
});

$("#settings").addEventListener("click", () => {
  api.runtime.openOptionsPage();
});

async function init() {
  let tab;
  try {
    [tab] = await api.tabs.query({ active: true, currentWindow: true });
  } catch (error) {
    tab = null;
  }

  await loadFadeState();

  if (!tab || !tab.url) {
    hostLabel.textContent = "This page";
    slider.disabled = true;
    resetButton.disabled = true;
    status("Page brightness is unavailable here.");
    return;
  }

  activeTabId = tab.id;

  try {
    activeHostname = new URL(tab.url).hostname || null;
  } catch (error) {
    activeHostname = null;
  }

  if (!activeHostname) {
    hostLabel.textContent = "This page";
    slider.disabled = true;
    resetButton.disabled = true;
    status("Page brightness is unavailable here.");
    return;
  }

  hostLabel.textContent = activeHostname;

  const storedBrightness = await storageGet("local", {
    [PAGE_BRIGHTNESS_STORAGE_KEY]: {}
  });
  const map = storedBrightness[PAGE_BRIGHTNESS_STORAGE_KEY] || {};
  const value = clamp(
    map[activeHostname],
    BRIGHTNESS_MIN,
    BRIGHTNESS_MAX,
    BRIGHTNESS_DEFAULT
  );
  setSliderDisplay(value);
}

init();
