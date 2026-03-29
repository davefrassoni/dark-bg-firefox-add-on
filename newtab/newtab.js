const api = typeof browser !== "undefined" ? browser : chrome;

const DEFAULT_SETTINGS = {
  preloadColor: "#0b0d10"
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

function updateClock() {
  const target = document.getElementById("clock");
  const now = new Date();
  target.textContent = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function applyTheme() {
  const settings = await storageGet(DEFAULT_SETTINGS);
  document.documentElement.style.setProperty("--base-bg", settings.preloadColor || "#0b0d10");
}

document.getElementById("openOptions").addEventListener("click", () => {
  if (api.runtime && api.runtime.openOptionsPage) {
    api.runtime.openOptionsPage();
    return;
  }
  window.location.href = "../options/options.html";
});

updateClock();
setInterval(updateClock, 1000);
applyTheme();
