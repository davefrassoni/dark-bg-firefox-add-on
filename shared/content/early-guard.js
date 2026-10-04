// Paints the dark guard at document_start, before the page's first frame.
// background.js registers this script only where the guard is active (site
// list, global toggle and schedule), so excluded pages never see a dark flash.
// content-script.js takes the overlay over once settings have loaded.
(() => {
  const { OVERLAY_ID, NAVIGATION_HINT_KEY, NAVIGATION_HINT_MAX_AGE_MS, normalizeHexColor } =
    globalThis.DarkAntiFlashSettings;

  if (window.top !== window || window.location.protocol === "about:") {
    return;
  }
  if (
    globalThis.DarkAntiFlashRequireOsDark &&
    !window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return;
  }

  // Same-site navigation in this tab: the previous page left a hint saying
  // how bright it was. Bright to bright never needs a guard.
  let color = "#0b0d10";
  try {
    const hint = JSON.parse(window.sessionStorage.getItem(NAVIGATION_HINT_KEY) || "null");
    if (hint && Date.now() - hint.time < NAVIGATION_HINT_MAX_AGE_MS) {
      if (hint.brightness === "bright") {
        return;
      }
      color = normalizeHexColor(hint.guardColor, color);
    }
  } catch (error) {
    // Opaque origins (sandboxed frames, data: URLs) have no sessionStorage.
  }

  const root = document.documentElement;
  if (!root || document.getElementById(OVERLAY_ID)) {
    return;
  }

  // Canvas, not a styled div: some browsers (e.g. Zen's "Boost" dark mode)
  // recolor every CSS color in a tab; canvas pixels are immune.
  const overlay = document.createElement("canvas");
  overlay.id = OVERLAY_ID;
  overlay.width = 2;
  overlay.height = 2;
  overlay.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;" +
    "z-index:2147483647;opacity:1;transition-property:opacity;" +
    "transition-timing-function:ease-out";
  const context = overlay.getContext("2d");
  if (context) {
    context.fillStyle = color;
    context.fillRect(0, 0, 2, 2);
  }
  root.appendChild(overlay);
})();
