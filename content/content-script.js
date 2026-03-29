(async () => {
  const api = typeof browser !== "undefined" ? browser : chrome;

  const DEFAULT_SETTINGS = {
    applyOnAllPages: true,
    preloadColor: "#0b0d10",
    transitionDurationMs: 900,
    initialHoldMs: 120,
    forceColorOnBrightSites: false,
    brightSiteColor: "#14191f",
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

  function isExcluded(hostList) {
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

  function setStyleOnTargets(targets, property, value, important = false) {
    for (const target of targets) {
      if (!target) {
        continue;
      }
      if (important) {
        target.style.setProperty(property, value, "important");
      } else {
        target.style.setProperty(property, value);
      }
    }
  }

  function removeStyleOnTargets(targets, property) {
    for (const target of targets) {
      if (!target) {
        continue;
      }
      target.style.removeProperty(property);
    }
  }

  function ensurePreloadStyle(preloadColor) {
    const style = document.createElement("style");
    style.id = "dark-background-anti-flash-preload-style";
    style.textContent = `html, body { background-color: ${preloadColor} !important; }`;

    if (document.head) {
      document.head.appendChild(style);
    } else {
      document.documentElement.appendChild(style);
    }

    return style;
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
      forceColorOnBrightSites: Boolean(rawSettings.forceColorOnBrightSites),
      brightSiteColor: normalizeHexColor(rawSettings.brightSiteColor, DEFAULT_SETTINGS.brightSiteColor),
      brightnessThreshold: clamp(
        rawSettings.brightnessThreshold,
        0,
        255,
        DEFAULT_SETTINGS.brightnessThreshold
      ),
      excludedHosts: parseExcludedHosts(rawSettings.excludedHosts)
    };
  }

  function cleanupAfterTransition(targets) {
    removeStyleOnTargets(targets, "background-color");
    removeStyleOnTargets(targets, "transition");
    removeStyleOnTargets(targets, "transition-property");
    removeStyleOnTargets(targets, "transition-duration");
    removeStyleOnTargets(targets, "transition-delay");
  }

  function transitionToTarget(settings, nativeColor, targets) {
    const nativeRgba = colorToRgba(nativeColor) || { r: 255, g: 255, b: 255, a: 1 };
    const nativeBrightness = brightnessOf(nativeRgba);

    const shouldForceColor =
      settings.forceColorOnBrightSites && nativeBrightness >= settings.brightnessThreshold;

    const finalColor = shouldForceColor ? settings.brightSiteColor : nativeColor;

    setStyleOnTargets(targets, "transition-property", "background-color", true);
    setStyleOnTargets(
      targets,
      "transition-duration",
      `${settings.transitionDurationMs}ms`,
      true
    );
    setStyleOnTargets(targets, "transition-delay", `${settings.initialHoldMs}ms`, true);
    setStyleOnTargets(targets, "background-color", settings.preloadColor, true);

    void document.documentElement.offsetHeight;

    requestAnimationFrame(() => {
      const forceImportant = shouldForceColor;
      setStyleOnTargets(targets, "background-color", finalColor, forceImportant);

      if (!shouldForceColor) {
        const cleanupDelay = settings.transitionDurationMs + settings.initialHoldMs + 120;
        setTimeout(() => cleanupAfterTransition(targets), cleanupDelay);
      } else {
        const cleanupDelay = settings.transitionDurationMs + settings.initialHoldMs + 120;
        setTimeout(() => {
          removeStyleOnTargets(targets, "transition");
          removeStyleOnTargets(targets, "transition-property");
          removeStyleOnTargets(targets, "transition-duration");
          removeStyleOnTargets(targets, "transition-delay");
        }, cleanupDelay);
      }
    });
  }

  const stored = await storageGet(DEFAULT_SETTINGS);
  const settings = parseAndValidateSettings({ ...DEFAULT_SETTINGS, ...stored });

  if (!settings.applyOnAllPages) {
    return;
  }

  if (isExcluded(settings.excludedHosts)) {
    return;
  }

  const preloadStyle = ensurePreloadStyle(settings.preloadColor);
  const runTransition = () => {
    const targets = [document.documentElement, document.body].filter(Boolean);

    preloadStyle.disabled = true;
    const nativeColor = detectPageBackgroundColor();
    preloadStyle.remove();

    transitionToTarget(settings, nativeColor, targets);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runTransition, { once: true });
  } else {
    runTransition();
  }
})();
