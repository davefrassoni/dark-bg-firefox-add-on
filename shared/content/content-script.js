(async () => {
  const api = typeof browser !== "undefined" ? browser : chrome;
  const OVERLAY_ID = "dark-background-anti-flash-overlay";
  const SAME_ORIGIN_NAVIGATION_KEY = "dark-background-anti-flash:same-origin-navigation";
  const SAME_ORIGIN_NAVIGATION_MAX_AGE_MS = 15000;
  const currentUrl = window.location.href;
  const isAboutPage = window.location.protocol === "about:";
  const isAboutBlank =
    currentUrl === "about:blank" || currentUrl.startsWith("about:blank?");

  // A top-level overlay already covers embedded documents. Running in frames can
  // also bypass a site-list rule that correctly matched the top-level page.
  if (window.top !== window) {
    return;
  }

  // Respect native browser pages and only allow true blank about pages.
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
    darkenBrightBackgroundsEnabled: false,
    darkBackgroundColor: "#121417",
    backgroundBrightnessThreshold: 210,
    siteListMode: "blacklist",
    siteListHosts: "",
    excludedHosts: ""
  };

  const CLEANUP_BUFFER_MS = 120;

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

  function parseSiteRules(raw) {
    if (typeof raw !== "string" || raw.trim() === "") {
      return [];
    }

    return raw
      .split(/\r?\n/g)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const normalizedEntry = entry
          .replace(/^\/\//, "")
          .replace(/\/\*$/, "");
        const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(entry)
          ? normalizedEntry
          : `https://${normalizedEntry}`;

        try {
          const parsed = new URL(withScheme);
          const entryHasPath = normalizedEntry
            .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
            .includes("/");
          const pathPrefix =
            entryHasPath && parsed.pathname !== "/"
              ? parsed.pathname.replace(/\/+$/, "")
              : "";

          return {
            hostname: parsed.hostname.toLowerCase().replace(/^\*\./, ""),
            pathPrefix
          };
        } catch (error) {
          return null;
        }
      })
      .filter((rule) => rule && rule.hostname);
  }

  function isHostnameMatch(hostname, ruleHostname) {
    return hostname === ruleHostname || hostname.endsWith("." + ruleHostname);
  }

  function isPathMatch(pathname, pathPrefix) {
    if (!pathPrefix) {
      return true;
    }
    return pathname === pathPrefix || pathname.startsWith(pathPrefix + "/");
  }

  function isCurrentPageIn(siteRules) {
    const hostname = window.location.hostname.toLowerCase();
    const pathname = window.location.pathname || "/";

    return siteRules.some(
      (rule) =>
        isHostnameMatch(hostname, rule.hostname) &&
        isPathMatch(pathname, rule.pathPrefix)
    );
  }

  function normalizeSiteListMode(value) {
    return value === "whitelist" ? "whitelist" : "blacklist";
  }

  function shouldRunOnCurrentPage(settings) {
    const isListed = isCurrentPageIn(settings.siteListRules);
    if (settings.siteListMode === "whitelist") {
      return isListed;
    }
    return !isListed;
  }

  function isEnabledOnCurrentPage(settings) {
    return settings.applyOnAllPages && shouldRunOnCurrentPage(settings);
  }

  function normalizeComparableUrl(value) {
    try {
      const parsed = new URL(value, window.location.href);
      parsed.hash = "";
      return parsed.href;
    } catch (error) {
      return "";
    }
  }

  function consumeSameOriginNavigationMarker() {
    try {
      const rawMarker = sessionStorage.getItem(SAME_ORIGIN_NAVIGATION_KEY);
      sessionStorage.removeItem(SAME_ORIGIN_NAVIGATION_KEY);
      if (!rawMarker) {
        return false;
      }

      const marker = JSON.parse(rawMarker);
      const markerAge = Date.now() - Number(marker.createdAt);
      return (
        markerAge >= 0 &&
        markerAge <= SAME_ORIGIN_NAVIGATION_MAX_AGE_MS &&
        normalizeComparableUrl(marker.destination) ===
          normalizeComparableUrl(window.location.href)
      );
    } catch (error) {
      return false;
    }
  }

  function findClickedLink(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    for (const item of path) {
      if (item instanceof HTMLAnchorElement && item.href) {
        return item;
      }
    }

    return event.target instanceof Element
      ? event.target.closest("a[href]")
      : null;
  }

  function setupSameOriginNavigationTracking(settings) {
    document.addEventListener(
      "click",
      (event) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }

        const link = findClickedLink(event);
        if (
          !link ||
          link.hasAttribute("download") ||
          (link.target && link.target.toLowerCase() !== "_self")
        ) {
          return;
        }

        let destination;
        try {
          destination = new URL(link.href, window.location.href);
        } catch (error) {
          return;
        }

        if (
          destination.origin !== window.location.origin ||
          destination.href === window.location.href ||
          !isBrightPage(settings)
        ) {
          return;
        }

        try {
          sessionStorage.setItem(
            SAME_ORIGIN_NAVIGATION_KEY,
            JSON.stringify({
              destination: destination.href,
              createdAt: Date.now()
            })
          );
        } catch (error) {
          // Some pages block access to session storage.
        }
      },
      true
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
    // Let the browser normalize named colors, hex values, and CSS color syntax.
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
    return transitionDurationMs + initialHoldMs + CLEANUP_BUFFER_MS;
  }

  function setOverlayVisibleImmediately(overlay, color) {
    if (!overlay) {
      return;
    }

    overlay.style.backgroundColor = color;
    overlay.style.transitionDuration = "0ms";
    overlay.style.transitionDelay = "0ms";
    overlay.style.opacity = "1";

    // Force style calculation before enabling the fade so repeated tab
    // switches do not reuse the previous transition state.
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
    const siteListHosts =
      rawSettings.siteListHosts === undefined
        ? rawSettings.excludedHosts
        : rawSettings.siteListHosts;

    return {
      applyOnAllPages: Boolean(rawSettings.applyOnAllPages),
      preloadColor: normalizeHexColor(
        rawSettings.preloadColor,
        DEFAULT_SETTINGS.preloadColor
      ),
      transitionDurationMs: clamp(
        rawSettings.transitionDurationMs,
        0,
        10000,
        DEFAULT_SETTINGS.transitionDurationMs
      ),
      initialHoldMs: clamp(
        rawSettings.initialHoldMs,
        0,
        5000,
        DEFAULT_SETTINGS.initialHoldMs
      ),
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
      darkenBrightBackgroundsEnabled: Boolean(
        rawSettings.darkenBrightBackgroundsEnabled
      ),
      darkBackgroundColor: normalizeHexColor(
        rawSettings.darkBackgroundColor,
        DEFAULT_SETTINGS.darkBackgroundColor
      ),
      backgroundBrightnessThreshold: clamp(
        rawSettings.backgroundBrightnessThreshold,
        0,
        255,
        DEFAULT_SETTINGS.backgroundBrightnessThreshold
      ),
      siteListMode: normalizeSiteListMode(rawSettings.siteListMode),
      siteListRules: parseSiteRules(siteListHosts)
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

  function isBrightBackground(element, settings) {
    if (!(element instanceof Element) || element.id === OVERLAY_ID) {
      return false;
    }

    const color = parseRgbString(getComputedStyle(element).backgroundColor);
    return (
      color &&
      color.a > 0.05 &&
      brightnessOf(color) >= settings.backgroundBrightnessThreshold
    );
  }

  function setDarkBackground(element, settings, originalBackgrounds) {
    if (!originalBackgrounds.has(element)) {
      originalBackgrounds.set(element, {
        value: element.style.getPropertyValue("background-color"),
        priority: element.style.getPropertyPriority("background-color")
      });
    }

    element.style.setProperty(
      "background-color",
      settings.darkBackgroundColor,
      "important"
    );
  }

  function overrideBrightBackground(element, settings, originalBackgrounds) {
    if (!isBrightBackground(element, settings)) {
      return;
    }

    setDarkBackground(element, settings, originalBackgrounds);
  }

  function overrideBrightPageCanvas(settings, originalBackgrounds) {
    const pageColor = colorToRgba(detectPageBackgroundColor());
    if (
      pageColor &&
      brightnessOf(pageColor) >= settings.backgroundBrightnessThreshold
    ) {
      setDarkBackground(
        document.documentElement,
        settings,
        originalBackgrounds
      );
    }
  }

  function overrideBrightBackgroundsIn(root, settings, originalBackgrounds) {
    if (root === document) {
      overrideBrightPageCanvas(settings, originalBackgrounds);
    }

    if (root instanceof Element) {
      overrideBrightBackground(root, settings, originalBackgrounds);
    }

    if (root && typeof root.querySelectorAll === "function") {
      root.querySelectorAll("*").forEach((element) => {
        overrideBrightBackground(element, settings, originalBackgrounds);
      });
    }
  }

  function setupBrightBackgroundOverrides(settings) {
    const originalBackgrounds = new Map();

    overrideBrightBackgroundsIn(document, settings, originalBackgrounds);

    let fullScanScheduled = false;
    const scheduleFullScan = () => {
      if (fullScanScheduled) {
        return;
      }
      fullScanScheduled = true;
      requestAnimationFrame(() => {
        fullScanScheduled = false;
        if (
          settings.darkenBrightBackgroundsEnabled &&
          isEnabledOnCurrentPage(settings)
        ) {
          overrideBrightBackgroundsIn(
            document,
            settings,
            originalBackgrounds
          );
        }
      });
    };

    const observer = new MutationObserver((mutations) => {
      let stylesheetChanged = false;

      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          overrideBrightBackground(
            mutation.target,
            settings,
            originalBackgrounds
          );
          continue;
        }

        if (
          mutation.target instanceof Element &&
          mutation.target.closest("style")
        ) {
          stylesheetChanged = true;
        }

        for (const addedNode of mutation.addedNodes) {
          if (!(addedNode instanceof Element)) {
            continue;
          }
          if (addedNode.matches("style, link[rel~='stylesheet']")) {
            stylesheetChanged = true;
            if (addedNode instanceof HTMLLinkElement) {
              addedNode.addEventListener("load", scheduleFullScan, { once: true });
            }
          }
          overrideBrightBackgroundsIn(
            addedNode,
            settings,
            originalBackgrounds
          );
        }
      }

      if (stylesheetChanged) {
        scheduleFullScan();
      }
    });

    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style"]
    });

    return {
      stop() {
        observer.disconnect();
        originalBackgrounds.forEach((original, element) => {
          if (!element.isConnected) {
            return;
          }
          if (original.value) {
            element.style.setProperty(
              "background-color",
              original.value,
              original.priority
            );
          } else {
            element.style.removeProperty("background-color");
          }
        });
        originalBackgrounds.clear();
      }
    };
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
    let transitionToken = 0;

    const onHidden = () => {
      transitionToken += 1;
      if (
        !settings.tabSwitchTransitionEnabled ||
        !isEnabledOnCurrentPage(settings) ||
        !isBrightPage(settings)
      ) {
        removeTransitionOverlay();
        return;
      }

      const overlay = ensureTransitionOverlay(settings.preloadColor);
      setOverlayVisibleImmediately(overlay, settings.preloadColor);
    };

    const onVisible = () => {
      const token = ++transitionToken;
      if (
        !settings.tabSwitchTransitionEnabled ||
        !isEnabledOnCurrentPage(settings) ||
        !isBrightPage(settings)
      ) {
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
      }, getCleanupDelay(
        settings.tabSwitchTransitionDurationMs,
        settings.tabSwitchInitialHoldMs
      ));
    };

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        onHidden();
      } else if (document.visibilityState === "visible") {
        onVisible();
      }
    });
  }

  const stored = await storageGet({});
  const rawSettings = { ...DEFAULT_SETTINGS, ...stored };
  if (stored.siteListHosts === undefined && stored.excludedHosts) {
    rawSettings.siteListHosts = stored.excludedHosts;
  }

  const settings = parseAndValidateSettings(rawSettings);
  const suppressInitialTransition = consumeSameOriginNavigationMarker();
  let backgroundOverrideController = null;

  const syncBackgroundOverrides = () => {
    const shouldOverride =
      isEnabledOnCurrentPage(settings) &&
      settings.darkenBrightBackgroundsEnabled;

    if (shouldOverride && !backgroundOverrideController) {
      backgroundOverrideController = setupBrightBackgroundOverrides(settings);
    } else if (!shouldOverride && backgroundOverrideController) {
      backgroundOverrideController.stop();
      backgroundOverrideController = null;
    }
  };

  if (api.storage && api.storage.onChanged) {
    api.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "sync") {
        return;
      }

      Object.entries(changes).forEach(([key, change]) => {
        if (change.newValue === undefined) {
          delete rawSettings[key];
        } else {
          rawSettings[key] = change.newValue;
        }
      });

      Object.assign(
        settings,
        parseAndValidateSettings({ ...DEFAULT_SETTINGS, ...rawSettings })
      );

      const backgroundSettingsChanged = [
        "applyOnAllPages",
        "siteListMode",
        "siteListHosts",
        "excludedHosts",
        "darkenBrightBackgroundsEnabled",
        "darkBackgroundColor",
        "backgroundBrightnessThreshold"
      ].some((key) => Object.prototype.hasOwnProperty.call(changes, key));

      if (backgroundSettingsChanged && backgroundOverrideController) {
        backgroundOverrideController.stop();
        backgroundOverrideController = null;
      }

      if (!isEnabledOnCurrentPage(settings)) {
        removeTransitionOverlay();
      }
      syncBackgroundOverrides();
    });
  }

  if (!isEnabledOnCurrentPage(settings)) {
    removeTransitionOverlay();
    return;
  }

  setupSameOriginNavigationTracking(settings);
  setupTabSwitchTransition(settings);
  syncBackgroundOverrides();

  if (suppressInitialTransition) {
    removeTransitionOverlay();
    return;
  }

  showInitialOverlay(settings.preloadColor);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => transitionOnPageLoad(settings), {
      once: true
    });
  } else {
    transitionOnPageLoad(settings);
  }
})();
