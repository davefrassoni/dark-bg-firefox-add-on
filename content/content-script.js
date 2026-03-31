(async () => {
  const api = typeof browser !== "undefined" ? browser : chrome;
  const OVERLAY_ID = "dark-background-anti-flash-overlay";
  const currentUrl = window.location.href;
  const isAboutPage = window.location.protocol === "about:";
  const isAboutBlank =
    currentUrl === "about:blank" || currentUrl.startsWith("about:blank?");

  // Respect Firefox native new-tab/favorites surfaces and only allow true blank about pages.
  if (isAboutPage && !isAboutBlank) {
    return;
  }

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

  function parseExcludedHosts(raw) {
    if (typeof raw !== "string" || raw.trim() === "") {
      return [];
    }

    return raw
      .split(/\r?\n/g)
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
      .map((entry) => entry.replace(/^https?:\/\//, ""))
      .map((entry) => entry.split("/")[0])
      .filter(Boolean);
  }

  function isHostMatch(hostList) {
    const hostname = window.location.hostname.toLowerCase();
    return hostList.some(
      (host) => hostname === host || hostname.endsWith("." + host)
    );
  }

  function parseRgbString(rgbValue) {
    const match = rgbValue
      .replace(/\s+/g, "")
      .match(/^rgba?\((\d+),(\d+),(\d+)(?:,([\d.]+))?\)$/i);
    if (!match) {
      return null;
    }
    return {
      r: clamp(Number(match[1]), 0, 255, 0),
      g: clamp(Number(match[2]), 0, 255, 0),
      b: clamp(Number(match[3]), 0, 255, 0),
      a: match[4] === undefined ? 1 : clamp(Number(match[4]), 0, 1, 1)
    };
  }

  function colorToRgba(colorValue) {
    const probe = document.createElement("span");
    probe.style.color = colorValue;
    probe.style.display = "none";
    (document.documentElement || document.body).appendChild(probe);
    const computed = getComputedStyle(probe).color;
    probe.remove();
    return parseRgbString(computed);
  }

  function brightnessOf(color) {
    return 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
  }

  function isTransparentColor(colorValue) {
    const parsed = parseRgbString(colorValue);
    if (!parsed) {
      return true;
    }
    return parsed.a <= 0.05;
  }

  function detectPageBackgroundColor() {
    if (document.body) {
      const bodyBg = getComputedStyle(document.body).backgroundColor;
      if (!isTransparentColor(bodyBg)) {
        return bodyBg;
      }
    }

    const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
    if (!isTransparentColor(htmlBg)) {
      return htmlBg;
    }

    return "rgb(255, 255, 255)";
  }

  function ensureTransitionOverlay(color) {
    const root = document.documentElement;
    if (!root) {
      return null;
    }

    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = OVERLAY_ID;
      overlay.style.position = "fixed";
      overlay.style.inset = "0";
      overlay.style.pointerEvents = "none";
      overlay.style.zIndex = "2147483647";
      overlay.style.opacity = "1";
      overlay.style.backgroundColor = color;
      overlay.style.transitionProperty = "opacity";
      overlay.style.transitionTimingFunction = "ease-out";
      root.appendChild(overlay);
    } else {
      overlay.style.opacity = "1";
      overlay.style.backgroundColor = color;
    }

    return overlay;
  }

  function removeTransitionOverlay() {
    const existing = document.getElementById(OVERLAY_ID);
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
  }

  function getCleanupDelay(transitionDurationMs, initialHoldMs) {
    return transitionDurationMs + initialHoldMs + 120;
  }

  function setOverlayVisibleImmediately(overlay, color) {
    if (!overlay) {
      return;
    }

    overlay.style.backgroundColor = color;
    overlay.style.transitionDuration = "0ms";
    overlay.style.transitionDelay = "0ms";
    overlay.style.opacity = "1";
    void overlay.offsetHeight;
  }

  function fadeOverlayOut(overlay, transitionDurationMs, initialHoldMs) {
    if (!overlay) {
      return;
    }

    overlay.style.transitionDuration = `${transitionDurationMs}ms`;
    overlay.style.transitionDelay = `${initialHoldMs}ms`;
    void overlay.offsetHeight;

    requestAnimationFrame(() => {
      overlay.style.opacity = "0";
    });
  }

  function parseAndValidateSettings(rawSettings) {
    return {
      applyOnAllPages: Boolean(rawSettings.applyOnAllPages),
      preloadColor: normalizeHexColor(rawSettings.preloadColor, DEFAULT_SETTINGS.preloadColor),
      transitionDurationMs: clamp(
        rawSettings.transitionDurationMs,
        0,
        10000,
        DEFAULT_SETTINGS.transitionDurationMs
      ),
      initialHoldMs: clamp(rawSettings.initialHoldMs, 0, 5000, DEFAULT_SETTINGS.initialHoldMs),
      tabSwitchTransitionEnabled: Boolean(rawSettings.tabSwitchTransitionEnabled),
      tabSwitchTransitionDurationMs: clamp(
        rawSettings.tabSwitchTransitionDurationMs,
        0,
        10000,
        DEFAULT_SETTINGS.tabSwitchTransitionDurationMs
      ),
      tabSwitchInitialHoldMs: clamp(
        rawSettings.tabSwitchInitialHoldMs,
        0,
        5000,
        DEFAULT_SETTINGS.tabSwitchInitialHoldMs
      ),
      brightnessThreshold: clamp(
        rawSettings.brightnessThreshold,
        0,
        255,
        DEFAULT_SETTINGS.brightnessThreshold
      ),
      excludedHosts: parseExcludedHosts(rawSettings.excludedHosts)
    };
  }

  function cleanupAfterTransition(overlay) {
    if (overlay && overlay.parentNode && overlay.style.opacity !== "1") {
      overlay.parentNode.removeChild(overlay);
    }
  }

  function isBrightPage(settings) {
    const nativeColor = detectPageBackgroundColor();
    const nativeRgba = colorToRgba(nativeColor) || { r: 255, g: 255, b: 255, a: 1 };
    return brightnessOf(nativeRgba) >= settings.brightnessThreshold;
  }

  function playOverlayTransition(preloadColor, transitionDurationMs, initialHoldMs) {
    const overlay = ensureTransitionOverlay(preloadColor);
    if (!overlay) {
      return;
    }

    setOverlayVisibleImmediately(overlay, preloadColor);
    fadeOverlayOut(overlay, transitionDurationMs, initialHoldMs);

    setTimeout(() => {
      cleanupAfterTransition(overlay);
    }, getCleanupDelay(transitionDurationMs, initialHoldMs));
  }

  function showInitialOverlay(color) {
    const overlay = ensureTransitionOverlay(color);
    setOverlayVisibleImmediately(overlay, color);
    return overlay;
  }

  function transitionOnPageLoad(settings) {
    if (!isBrightPage(settings)) {
      removeTransitionOverlay();
      return;
    }

    playOverlayTransition(
      settings.preloadColor,
      settings.transitionDurationMs,
      settings.initialHoldMs
    );
  }

  function setupTabSwitchTransition(settings) {
    if (!settings.tabSwitchTransitionEnabled) {
      return;
    }

    let transitionToken = 0;

    const onHidden = () => {
      transitionToken += 1;
      if (!isBrightPage(settings)) {
        removeTransitionOverlay();
        return;
      }

      const overlay = ensureTransitionOverlay(settings.preloadColor);
      setOverlayVisibleImmediately(overlay, settings.preloadColor);
    };

    const onVisible = () => {
      const token = ++transitionToken;
      if (!isBrightPage(settings)) {
        removeTransitionOverlay();
        return;
      }

      const overlay = ensureTransitionOverlay(settings.preloadColor);
      if (!overlay) {
        return;
      }

      setOverlayVisibleImmediately(overlay, settings.preloadColor);
      fadeOverlayOut(
        overlay,
        settings.tabSwitchTransitionDurationMs,
        settings.tabSwitchInitialHoldMs
      );

      setTimeout(() => {
        if (token !== transitionToken) {
          return;
        }
        if (document.visibilityState !== "visible") {
          return;
        }
        cleanupAfterTransition(overlay);
      }, getCleanupDelay(settings.tabSwitchTransitionDurationMs, settings.tabSwitchInitialHoldMs));
    };

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        onHidden();
      } else if (document.visibilityState === "visible") {
        onVisible();
      }
    });
  }

  // Keep a protective overlay visible immediately on first navigation while
  // settings load and before we can inspect the page background.
  const initialOverlay = showInitialOverlay(DEFAULT_SETTINGS.preloadColor);

  const stored = await storageGet(DEFAULT_SETTINGS);
  const settings = parseAndValidateSettings({ ...DEFAULT_SETTINGS, ...stored });

  if (!settings.applyOnAllPages) {
    removeTransitionOverlay();
    return;
  }

  if (isHostMatch(settings.excludedHosts)) {
    removeTransitionOverlay();
    return;
  }

  if (initialOverlay) {
    initialOverlay.style.backgroundColor = settings.preloadColor;
  }

  setupTabSwitchTransition(settings);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => transitionOnPageLoad(settings), {
      once: true
    });
  } else {
    transitionOnPageLoad(settings);
  }
})();
