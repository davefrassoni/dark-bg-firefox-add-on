const api = typeof browser !== "undefined" ? browser : chrome;
const {
  MESSAGES,
  PAGE_BRIGHTNESS_STORAGE_KEY,
  PAGE_BRIGHTNESS,
  clamp,
  compileSettings,
  isLocationListed,
  isActiveOnLocation,
  setLocationListed
} = globalThis.DarkAntiFlashSettings;
const { resolveLanguage, translateDocument } = globalThis.DarkAntiFlashI18n;
const $ = (selector) => document.querySelector(selector);

const hostLabel = $("#host-label");
const fadeToggle = $("#fade-toggle");
const siteSection = $("#site-section");
const siteState = $("#site-state");
const siteToggle = $("#site-toggle");
const slider = $("#brightness-slider");
const sliderValue = $("#brightness-value");
const resetButton = $("#brightness-reset");
const statusNode = $("#status");

let t = (key) => key;
let settings = compileSettings({});
let activeTabId = null;
let currentSite = null;
let persistTimer = null;

function status(text, isError = false) {
  statusNode.textContent = text;
  statusNode.className = isError ? "error" : "";
}

function render() {
  fadeToggle.dataset.state = settings.applyOnAllPages ? "on" : "off";
  fadeToggle.textContent = settings.applyOnAllPages ? t("popupOn") : t("popupOff");

  if (!currentSite) {
    siteSection.hidden = true;
    return;
  }
  siteSection.hidden = false;
  const listed = isLocationListed(settings.siteListRules, currentSite.hostname, currentSite.pathname);
  const allowedBySiteList = settings.siteListMode === "whitelist" ? listed : !listed;
  const active = isActiveOnLocation(
    settings,
    currentSite.hostname,
    currentSite.pathname,
    new Date(),
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  if (!settings.applyOnAllPages) {
    siteState.textContent = t("popupSiteOffEverywhere");
  } else if (!allowedBySiteList) {
    siteState.textContent = t("popupSitePaused");
  } else {
    siteState.textContent = active ? t("popupSiteActive") : t("popupSiteScheduled");
  }
  siteToggle.textContent = allowedBySiteList ? t("popupPauseSite") : t("popupResumeSite");
  siteToggle.disabled = !settings.applyOnAllPages;
}

fadeToggle.addEventListener("click", async () => {
  const applyOnAllPages = !settings.applyOnAllPages;
  await api.storage.sync.set({ applyOnAllPages });
  status(applyOnAllPages ? t("popupGuardEnabled") : t("popupGuardDisabled"));
});

// Pausing in blacklist mode lists the site; in whitelist mode it unlists it.
siteToggle.addEventListener("click", async () => {
  const listed = isLocationListed(settings.siteListRules, currentSite.hostname, currentSite.pathname);
  const allowedBySiteList = settings.siteListMode === "whitelist" ? listed : !listed;
  await api.storage.sync.set({
    siteListHosts: setLocationListed(
      settings.siteListHosts,
      currentSite.hostname,
      currentSite.pathname,
      !listed
    )
  });
  status(allowedBySiteList ? t("popupSitePausedStatus") : t("popupSiteResumedStatus"));
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
    await api.tabs.sendMessage(activeTabId, { type: MESSAGES.SET_PAGE_BRIGHTNESS, value });
  } catch (error) {
    // No content script on this page (e.g. a browser settings page).
  }
}

async function persistBrightness(value) {
  if (!currentSite) {
    return;
  }
  const stored = await api.storage.local.get({ [PAGE_BRIGHTNESS_STORAGE_KEY]: {} });
  const map = { ...(stored[PAGE_BRIGHTNESS_STORAGE_KEY] || {}) };
  if (value === PAGE_BRIGHTNESS.default) {
    delete map[currentSite.hostname];
  } else {
    map[currentSite.hostname] = value;
  }
  await api.storage.local.set({ [PAGE_BRIGHTNESS_STORAGE_KEY]: map });
}

function schedulePersist(value) {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => persistBrightness(value), 200);
}

slider.addEventListener("input", () => {
  const value = clamp(slider.value, PAGE_BRIGHTNESS.min, PAGE_BRIGHTNESS.max, PAGE_BRIGHTNESS.default);
  setSliderDisplay(value);
  sendBrightnessToTab(value);
  schedulePersist(value);
});

resetButton.addEventListener("click", () => {
  setSliderDisplay(PAGE_BRIGHTNESS.default);
  sendBrightnessToTab(PAGE_BRIGHTNESS.default);
  schedulePersist(PAGE_BRIGHTNESS.default);
  status(t("popupBrightnessReset"));
});

$("#settings").addEventListener("click", () => {
  api.runtime.openOptionsPage();
});

api.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") {
    return;
  }
  void loadSettings().then(render);
});

async function loadSettings() {
  settings = compileSettings(await api.storage.sync.get(null));
}

async function init() {
  await loadSettings();
  t = translateDocument(
    document,
    resolveLanguage(settings.uiLanguage, navigator.languages || [navigator.language])
  );

  let tab = null;
  try {
    [tab] = await api.tabs.query({ active: true, currentWindow: true });
  } catch (error) {
    tab = null;
  }

  try {
    const url = tab && tab.url ? new URL(tab.url) : null;
    currentSite = url && url.hostname ? { hostname: url.hostname, pathname: url.pathname } : null;
  } catch (error) {
    currentSite = null;
  }

  render();

  if (!currentSite) {
    hostLabel.textContent = t("popupThisPage");
    slider.disabled = true;
    resetButton.disabled = true;
    status(t("popupUnavailable"));
    return;
  }

  activeTabId = tab.id;
  hostLabel.textContent = currentSite.hostname;

  const stored = await api.storage.local.get({ [PAGE_BRIGHTNESS_STORAGE_KEY]: {} });
  const map = stored[PAGE_BRIGHTNESS_STORAGE_KEY] || {};
  setSliderDisplay(
    clamp(map[currentSite.hostname], PAGE_BRIGHTNESS.min, PAGE_BRIGHTNESS.max, PAGE_BRIGHTNESS.default)
  );
}

init();
