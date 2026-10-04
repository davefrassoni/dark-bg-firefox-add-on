const api = typeof browser !== "undefined" ? browser : chrome;
const { DEFAULT_SETTINGS, normalizeHexColor, normalizeLanguage, normalizeSettings } =
  globalThis.DarkAntiFlashSettings;
const { resolveLanguage, translateDocument } = globalThis.DarkAntiFlashI18n;

const form = document.getElementById("settings-form");
const status = document.getElementById("status");
const previewOverlay = document.getElementById("previewOverlay");
const byId = (id) => document.getElementById(id);

const CHECKBOXES = [
  "applyOnAllPages",
  "matchPreviousColor",
  "tabSwitchTransitionEnabled",
  "accurateDetection",
  "darkenBrightBackgroundsEnabled"
];
const VALUES = [
  "transitionDurationMs",
  "initialHoldMs",
  "tabSwitchTransitionDurationMs",
  "tabSwitchInitialHoldMs",
  "brightnessThreshold",
  "backgroundBrightnessThreshold",
  "scheduleMode",
  "scheduleStart",
  "scheduleEnd",
  "siteListMode",
  "siteListHosts",
  "uiLanguage"
];
const COLORS = ["preloadColor", "darkBackgroundColor"];

let t = (key) => key;

function applyLanguage(selectedLanguage) {
  const language = resolveLanguage(selectedLanguage, navigator.languages || [navigator.language]);
  t = translateDocument(document, language);
  document.title = t("pageTitle");
  void renderShortcuts();
}

function syncColorInputs(id) {
  const colorInput = byId(id);
  const textInput = byId(`${id}Text`);
  colorInput.addEventListener("input", () => {
    textInput.value = colorInput.value;
  });
  textInput.addEventListener("input", () => {
    // Keep the color picker usable even while the text field is being edited.
    const normalized = normalizeHexColor(textInput.value, colorInput.value);
    if (normalized !== colorInput.value) {
      colorInput.value = normalized;
    }
  });
}

function updateScheduleVisibility() {
  byId("scheduleTimes").hidden = byId("scheduleMode").value !== "night";
}

function populateForm(settings) {
  for (const id of CHECKBOXES) {
    byId(id).checked = settings[id];
  }
  for (const id of VALUES) {
    byId(id).value = settings[id];
  }
  for (const id of COLORS) {
    byId(id).value = settings[id];
    byId(`${id}Text`).value = settings[id];
  }
  updateScheduleVisibility();
  applyLanguage(settings.uiLanguage);
}

function readForm() {
  const raw = {};
  for (const id of CHECKBOXES) {
    raw[id] = byId(id).checked;
  }
  for (const id of VALUES) {
    raw[id] = byId(id).value;
  }
  for (const id of COLORS) {
    raw[id] = byId(`${id}Text`).value;
  }
  return normalizeSettings(raw);
}

function showStatus(message) {
  status.textContent = message;
  setTimeout(() => {
    if (status.textContent === message) {
      status.textContent = "";
    }
  }, 1800);
}

// Plays the configured fade over this page, from the form's current values,
// so timings can be tuned without saving and reloading other pages.
let previewTimer = null;

function previewFade(kind) {
  const values = readForm();
  const duration = kind === "tab" ? values.tabSwitchTransitionDurationMs : values.transitionDurationMs;
  const hold = kind === "tab" ? values.tabSwitchInitialHoldMs : values.initialHoldMs;

  clearTimeout(previewTimer);
  previewOverlay.hidden = false;
  previewOverlay.style.background = values.preloadColor;
  previewOverlay.style.transition = "none";
  previewOverlay.style.opacity = "1";
  void previewOverlay.offsetHeight;
  previewOverlay.style.transition = `opacity ${duration}ms ease-out ${hold}ms`;
  requestAnimationFrame(() => {
    previewOverlay.style.opacity = "0";
  });
  previewTimer = setTimeout(() => {
    previewOverlay.hidden = true;
  }, duration + hold + 100);
}

async function renderShortcuts() {
  const list = byId("shortcutList");
  if (!api.commands || typeof api.commands.getAll !== "function") {
    list.closest("section").hidden = true;
    return;
  }
  const labels = {
    "toggle-guard": "cmdToggleGuard",
    "toggle-site": "cmdToggleSite",
    "brightness-up": "cmdBrightnessUp",
    "brightness-down": "cmdBrightnessDown"
  };
  const commands = await api.commands.getAll();
  list.replaceChildren(
    ...commands
      .filter((command) => labels[command.name])
      .map((command) => {
        const item = document.createElement("li");
        const label = document.createElement("span");
        label.textContent = t(labels[command.name]);
        const keys = document.createElement("kbd");
        keys.textContent = command.shortcut || t("shortcutNotSet");
        item.append(label, keys);
        return item;
      })
  );
}

async function openShortcutSettings() {
  try {
    if (api.commands && typeof api.commands.openShortcutSettings === "function") {
      // Firefox
      await api.commands.openShortcutSettings();
    } else {
      await api.tabs.create({ url: "chrome://extensions/shortcuts" });
    }
  } catch (error) {
    showStatus(t("shortcutsHint"));
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = readForm();
  await api.storage.sync.set(values);
  populateForm(values);
  showStatus(t("saved"));
});

byId("resetDefaults").addEventListener("click", async () => {
  const defaults = { ...DEFAULT_SETTINGS, uiLanguage: byId("uiLanguage").value };
  await api.storage.sync.set(defaults);
  populateForm(normalizeSettings(defaults));
  showStatus(t("defaultsRestored"));
});

byId("uiLanguage").addEventListener("change", async () => {
  const uiLanguage = normalizeLanguage(byId("uiLanguage").value);
  applyLanguage(uiLanguage);
  await api.storage.sync.set({ uiLanguage });
});

byId("scheduleMode").addEventListener("change", updateScheduleVisibility);
byId("openShortcuts").addEventListener("click", openShortcutSettings);
document.querySelectorAll("[data-preview]").forEach((button) => {
  button.addEventListener("click", () => previewFade(button.dataset.preview));
});

COLORS.forEach(syncColorInputs);

(async () => {
  populateForm(normalizeSettings(await api.storage.sync.get(null)));
})();
