(async () => {
  const api = typeof browser !== "undefined" ? browser : chrome;
  const OVERLAY_ID = "dark-background-anti-flash-overlay";
  const MESSAGE_DOCUMENT_INIT = "dark-anti-flash:document-init";
  const MESSAGE_BRIGHTNESS_REPORT = "dark-anti-flash:brightness-report";
  const MESSAGE_SET_TAB_GUARD = "dark-anti-flash:set-tab-guard";
  const MESSAGE_TAB_ACTIVATED = "dark-anti-flash:tab-activated";
  const {
    BRIGHTNESS_BRIGHT,
    BRIGHTNESS_DARK,
    normalizeBrightness,
    shouldFadeTransition
  } = globalThis.DarkAntiFlashPolicy;
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

  async function sendRuntimeMessage(message) {
    try {
      return await api.runtime.sendMessage(message);
    } catch (error) {
      return null;
    }
  }

  function parseRgbString(rgbValue) {
    if (typeof rgbValue !== "string") {
      return null;
    }

    const normalized = rgbValue.trim().replace(/\s*\/\s*/, ",");
    const match = normalized.match(
      /^rgba?\(\s*([\d.]+)(?:\s*,\s*|\s+)([\d.]+)(?:\s*,\s*|\s+)([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i
    );
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

  let colorCanvasContext = null;

  function parseCssColor(colorValue) {
    const direct = parseRgbString(colorValue);
    if (direct) {
      return direct;
    }

    if (
      typeof colorValue !== "string" ||
      (globalThis.CSS &&
        typeof CSS.supports === "function" &&
        !CSS.supports("color", colorValue))
    ) {
      return null;
    }

    if (!colorCanvasContext) {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      colorCanvasContext = canvas.getContext("2d", { willReadFrequently: true });
    }

    if (!colorCanvasContext) {
      return null;
    }

    colorCanvasContext.clearRect(0, 0, 1, 1);
    colorCanvasContext.fillStyle = colorValue;
    colorCanvasContext.fillRect(0, 0, 1, 1);
    const [r, g, b, alpha] = colorCanvasContext.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: alpha / 255 };
  }

  function brightnessOf(color) {
    return 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
  }

  function compositeColors(foreground, background) {
    const alpha = foreground.a + background.a * (1 - foreground.a);
    if (alpha <= 0) {
      return { r: 0, g: 0, b: 0, a: 0 };
    }

    return {
      r:
        (foreground.r * foreground.a +
          background.r * background.a * (1 - foreground.a)) /
        alpha,
      g:
        (foreground.g * foreground.a +
          background.g * background.a * (1 - foreground.a)) /
        alpha,
      b:
        (foreground.b * foreground.a +
          background.b * background.a * (1 - foreground.a)) /
        alpha,
      a: alpha
    };
  }

  function renderedBackgroundColorFor(element) {
    const style = getComputedStyle(element);
    const solidColor = parseCssColor(style.backgroundColor) || {
      r: 0,
      g: 0,
      b: 0,
      a: 0
    };
    const backgroundImage = style.backgroundImage || "";
    if (!backgroundImage.includes("gradient(")) {
      return solidColor;
    }

    const colorTokens = backgroundImage.match(/rgba?\([^)]*\)/gi) || [];
    const gradientColors = colorTokens
      .map((color) => parseCssColor(color))
      .filter(Boolean);
    if (gradientColors.length === 0) {
      return solidColor;
    }

    const average = gradientColors.reduce(
      (result, color) => ({
        r: result.r + color.r / gradientColors.length,
        g: result.g + color.g / gradientColors.length,
        b: result.b + color.b / gradientColors.length,
        a: result.a + color.a / gradientColors.length
      }),
      { r: 0, g: 0, b: 0, a: 0 }
    );
    return compositeColors(average, solidColor);
  }

  function detectBrowserCanvasColor() {
    const root = document.documentElement;
    const rootStyle = getComputedStyle(root);
    const colorSchemes = (rootStyle.colorScheme || "")
      .toLowerCase()
      .split(/\s+/)
      .filter((value) => value && value !== "only" && value !== "normal");

    if (colorSchemes[0] === "dark") {
      return { r: 18, g: 18, b: 18, a: 1 };
    }

    return { r: 255, g: 255, b: 255, a: 1 };
  }

  function sampleRenderedBackgroundAt(x, y, canvasColor) {
    if (typeof document.elementsFromPoint !== "function") {
      return canvasColor;
    }

    const elements = document
      .elementsFromPoint(x, y)
      .filter((element) => element.id !== OVERLAY_ID);
    let result = canvasColor;

    for (let index = elements.length - 1; index >= 0; index -= 1) {
      const background = renderedBackgroundColorFor(elements[index]);
      if (background && background.a > 0.01) {
        result = compositeColors(background, result);
      }
    }

    return result;
  }

  function detectPageBackgroundRgba() {
    const canvasColor = detectBrowserCanvasColor();
    const width = Math.max(1, document.documentElement.clientWidth || innerWidth);
    const height = Math.max(1, document.documentElement.clientHeight || innerHeight);
    const horizontalSamples = [0.2, 0.5, 0.8].map((ratio) =>
      Math.min(width - 1, Math.max(0, Math.floor(width * ratio)))
    );
    const verticalSamples = [0.2, 0.5, 0.8].map((ratio) =>
      Math.min(height - 1, Math.max(0, Math.floor(height * ratio)))
    );
    const points = horizontalSamples.flatMap((x) =>
      verticalSamples.map((y) => [x, y])
    );
    const samples = points
      .map(([x, y]) => sampleRenderedBackgroundAt(x, y, canvasColor))
      .sort((left, right) => brightnessOf(left) - brightnessOf(right));

    return samples[Math.floor(samples.length / 2)] || canvasColor;
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

  let overlayGeneration = 0;

  function removeTransitionOverlay() {
    overlayGeneration += 1;
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

  function fadeOverlayOut(
    overlay,
    transitionDurationMs,
    initialHoldMs,
    generation
  ) {
    if (!overlay) {
      return;
    }

    overlay.style.transitionDuration = `${transitionDurationMs}ms`;
    overlay.style.transitionDelay = `${initialHoldMs}ms`;
    void overlay.offsetHeight;

    requestAnimationFrame(() => {
      if (generation === overlayGeneration) {
        overlay.style.opacity = "0";
      }
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
    return (
      brightnessOf(detectPageBackgroundRgba()) >= settings.brightnessThreshold
    );
  }

  function detectPageBrightness(settings) {
    return isBrightPage(settings) ? BRIGHTNESS_BRIGHT : BRIGHTNESS_DARK;
  }

  function isBrightBackground(element, settings) {
    if (!(element instanceof Element) || element.id === OVERLAY_ID) {
      return false;
    }

    const color = parseCssColor(getComputedStyle(element).backgroundColor);
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

    const original = originalBackgrounds.get(element);
    original.injectedValue = element.style.getPropertyValue("background-color");
    original.injectedPriority = element.style.getPropertyPriority(
      "background-color"
    );
  }

  function restoreOriginalBackground(element, original) {
    if (original.value) {
      element.style.setProperty(
        "background-color",
        original.value,
        original.priority
      );
    } else {
      element.style.removeProperty("background-color");
    }
  }

  function isInjectedBackground(element, original) {
    return (
      element.style.getPropertyValue("background-color") ===
        original.injectedValue &&
      element.style.getPropertyPriority("background-color") ===
        original.injectedPriority
    );
  }

  function reevaluateBrightBackground(element, settings, originalBackgrounds) {
    if (!(element instanceof Element) || element.id === OVERLAY_ID) {
      return;
    }

    let original = originalBackgrounds.get(element);
    if (original) {
      // An inline change that replaced our injected value belongs to the page
      // and becomes the new value to restore when it is no longer bright.
      if (!isInjectedBackground(element, original)) {
        original = {
          value: element.style.getPropertyValue("background-color"),
          priority: element.style.getPropertyPriority("background-color")
        };
        originalBackgrounds.set(element, original);
      }
      restoreOriginalBackground(element, original);
    }

    if (isBrightBackground(element, settings)) {
      setDarkBackground(element, settings, originalBackgrounds);
    } else if (original) {
      originalBackgrounds.delete(element);
    }
  }

  function overrideBrightPageCanvas(settings, originalBackgrounds) {
    const canvas = document.documentElement;
    let original = originalBackgrounds.get(canvas);
    if (original) {
      if (!isInjectedBackground(canvas, original)) {
        original = {
          value: canvas.style.getPropertyValue("background-color"),
          priority: canvas.style.getPropertyPriority("background-color")
        };
        originalBackgrounds.set(canvas, original);
      }
      restoreOriginalBackground(canvas, original);
    }

    const pageColor = detectPageBackgroundRgba();
    if (
      pageColor &&
      brightnessOf(pageColor) >= settings.backgroundBrightnessThreshold
    ) {
      setDarkBackground(canvas, settings, originalBackgrounds);
    } else if (original) {
      originalBackgrounds.delete(canvas);
    }
  }

  function overrideBrightBackgroundsIn(root, settings, originalBackgrounds) {
    if (root === document) {
      overrideBrightPageCanvas(settings, originalBackgrounds);
    }

    if (root instanceof Element) {
      reevaluateBrightBackground(root, settings, originalBackgrounds);
    }

    if (root && typeof root.querySelectorAll === "function") {
      root.querySelectorAll("*").forEach((element) => {
        if (root === document && element === document.documentElement) {
          return;
        }
        reevaluateBrightBackground(element, settings, originalBackgrounds);
      });
    }
  }

  function setupBrightBackgroundOverrides(settings) {
    const originalBackgrounds = new Map();
    let observer;
    let stopped = false;
    let fullScanFrame = null;

    const startObserving = () => {
      if (stopped) {
        return;
      }
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class", "style"]
      });
    };

    overrideBrightBackgroundsIn(document, settings, originalBackgrounds);

    let fullScanScheduled = false;
    const scheduleFullScan = () => {
      if (stopped || fullScanScheduled) {
        return;
      }
      fullScanScheduled = true;
      fullScanFrame = requestAnimationFrame(() => {
        fullScanFrame = null;
        fullScanScheduled = false;
        if (stopped) {
          return;
        }
        if (
          settings.darkenBrightBackgroundsEnabled &&
          isEnabledOnCurrentPage(settings)
        ) {
          observer.disconnect();
          overrideBrightBackgroundsIn(
            document,
            settings,
            originalBackgrounds
          );
          startObserving();
        }
      });
    };

    observer = new MutationObserver((mutations) => {
      let stylesheetChanged = false;
      observer.disconnect();

      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          overrideBrightBackgroundsIn(
            mutation.target,
            settings,
            originalBackgrounds
          );
          if (
            mutation.target === document.documentElement ||
            mutation.target === document.body
          ) {
            stylesheetChanged = true;
          }
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

      startObserving();

      if (stylesheetChanged) {
        scheduleFullScan();
      }
    });

    startObserving();
    const colorSchemeQuery = matchMedia("(prefers-color-scheme: dark)");
    const handleEnvironmentChange = () => scheduleFullScan();
    window.addEventListener("resize", handleEnvironmentChange, {
      passive: true
    });
    if (typeof colorSchemeQuery.addEventListener === "function") {
      colorSchemeQuery.addEventListener("change", handleEnvironmentChange);
    } else if (typeof colorSchemeQuery.addListener === "function") {
      colorSchemeQuery.addListener(handleEnvironmentChange);
    }

    return {
      stop() {
        stopped = true;
        if (fullScanFrame !== null) {
          cancelAnimationFrame(fullScanFrame);
          fullScanFrame = null;
          fullScanScheduled = false;
        }
        observer.disconnect();
        window.removeEventListener("resize", handleEnvironmentChange);
        if (typeof colorSchemeQuery.removeEventListener === "function") {
          colorSchemeQuery.removeEventListener(
            "change",
            handleEnvironmentChange
          );
        } else if (typeof colorSchemeQuery.removeListener === "function") {
          colorSchemeQuery.removeListener(handleEnvironmentChange);
        }
        originalBackgrounds.forEach((original, element) => {
          if (!element.isConnected) {
            return;
          }
          restoreOriginalBackground(element, original);
        });
        originalBackgrounds.clear();
      }
    };
  }

  function playOverlayTransition(preloadColor, transitionDurationMs, initialHoldMs) {
    const generation = ++overlayGeneration;
    const overlay = ensureTransitionOverlay(preloadColor);
    if (!overlay) {
      return;
    }

    setOverlayVisibleImmediately(overlay, preloadColor);
    fadeOverlayOut(
      overlay,
      transitionDurationMs,
      initialHoldMs,
      generation
    );

    setTimeout(() => {
      if (generation === overlayGeneration) {
        cleanupAfterTransition(overlay);
      }
    }, getCleanupDelay(transitionDurationMs, initialHoldMs));
  }

  function showGuardOverlay(color) {
    overlayGeneration += 1;
    const overlay = ensureTransitionOverlay(color);
    setOverlayVisibleImmediately(overlay, color);
    return overlay;
  }

  let currentPageBrightness = null;
  let brightnessReportTimer = null;

  function reportCurrentBrightness(settings, force = false) {
    const brightness = detectPageBrightness(settings);
    if (!force && brightness === currentPageBrightness) {
      return brightness;
    }

    currentPageBrightness = brightness;
    void sendRuntimeMessage({
      type: MESSAGE_BRIGHTNESS_REPORT,
      brightness
    });
    return brightness;
  }

  function scheduleBrightnessReport(settings) {
    if (brightnessReportTimer !== null) {
      return;
    }
    brightnessReportTimer = setTimeout(() => {
      brightnessReportTimer = null;
      reportCurrentBrightness(settings);
    }, 120);
  }

  function setupBrightnessMonitoring(settings) {
    const observer = new MutationObserver(() => {
      scheduleBrightnessReport(settings);
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style"]
    });

    window.addEventListener("resize", () => scheduleBrightnessReport(settings), {
      passive: true
    });

    const colorSchemeQuery = matchMedia("(prefers-color-scheme: dark)");
    const onColorSchemeChanged = () => scheduleBrightnessReport(settings);
    if (typeof colorSchemeQuery.addEventListener === "function") {
      colorSchemeQuery.addEventListener("change", onColorSchemeChanged);
    } else if (typeof colorSchemeQuery.addListener === "function") {
      colorSchemeQuery.addListener(onColorSchemeChanged);
    }
  }

  function transitionOnPageLoad(settings, incomingBrightness) {
    const nextBrightness = reportCurrentBrightness(settings, true);

    if (document.visibilityState === "hidden") {
      if (
        settings.tabSwitchTransitionEnabled &&
        shouldFadeTransition(incomingBrightness, nextBrightness)
      ) {
        showGuardOverlay(settings.preloadColor);
      } else {
        removeTransitionOverlay();
      }
      return;
    }

    if (!shouldFadeTransition(incomingBrightness, nextBrightness)) {
      removeTransitionOverlay();
      return;
    }

    playOverlayTransition(
      settings.preloadColor,
      settings.transitionDurationMs,
      settings.initialHoldMs
    );
  }

  function setupTabStateMessages(settings) {
    api.runtime.onMessage.addListener((message) => {
      if (!message || !isEnabledOnCurrentPage(settings)) {
        return false;
      }

      if (message.type === MESSAGE_SET_TAB_GUARD) {
        // Guard messages target background tabs. Activation has its own message
        // so a post-activation guard sync cannot cancel an in-progress fade.
        if (document.visibilityState !== "hidden") {
          return false;
        }

        const nextBrightness = reportCurrentBrightness(settings);
        if (
          message.armed &&
          settings.tabSwitchTransitionEnabled &&
          nextBrightness === BRIGHTNESS_BRIGHT
        ) {
          showGuardOverlay(settings.preloadColor);
        } else {
          removeTransitionOverlay();
        }
        return false;
      }

      if (message.type === MESSAGE_TAB_ACTIVATED) {
        const nextBrightness = reportCurrentBrightness(settings, true);
        if (
          settings.tabSwitchTransitionEnabled &&
          shouldFadeTransition(
            normalizeBrightness(message.previousBrightness),
            nextBrightness
          )
        ) {
          playOverlayTransition(
            settings.preloadColor,
            settings.tabSwitchTransitionDurationMs,
            settings.tabSwitchInitialHoldMs
          );
        } else {
          removeTransitionOverlay();
        }
      }

      return false;
    });
  }

  const stored = await storageGet({});
  const rawSettings = { ...DEFAULT_SETTINGS, ...stored };
  if (stored.siteListHosts === undefined && stored.excludedHosts) {
    rawSettings.siteListHosts = stored.excludedHosts;
  }

  const settings = parseAndValidateSettings(rawSettings);
  const stateContext =
    (await sendRuntimeMessage({ type: MESSAGE_DOCUMENT_INIT })) || {};
  const incomingBrightness =
    normalizeBrightness(stateContext.previousBrightness) ||
    normalizeBrightness(stateContext.ambientBrightness);
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
      const tabTransitionSettingsChanged = [
        "tabSwitchTransitionEnabled",
        "tabSwitchTransitionDurationMs",
        "tabSwitchInitialHoldMs",
        "preloadColor"
      ].some((key) => Object.prototype.hasOwnProperty.call(changes, key));

      if (backgroundSettingsChanged && backgroundOverrideController) {
        backgroundOverrideController.stop();
        backgroundOverrideController = null;
      }

      if (!isEnabledOnCurrentPage(settings)) {
        removeTransitionOverlay();
      } else if (
        Object.prototype.hasOwnProperty.call(
          changes,
          "tabSwitchTransitionEnabled"
        ) &&
        !settings.tabSwitchTransitionEnabled
      ) {
        removeTransitionOverlay();
      }
      syncBackgroundOverrides();
      if (tabTransitionSettingsChanged) {
        reportCurrentBrightness(settings, true);
      } else {
        scheduleBrightnessReport(settings);
      }
    });
  }

  setupTabStateMessages(settings);

  if (!isEnabledOnCurrentPage(settings)) {
    removeTransitionOverlay();
    const reportDisabledPage = () => {
      reportCurrentBrightness(settings, true);
      setupBrightnessMonitoring(settings);
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", reportDisabledPage, {
        once: true
      });
    } else {
      reportDisabledPage();
    }
    return;
  }

  syncBackgroundOverrides();

  if (incomingBrightness === BRIGHTNESS_BRIGHT) {
    removeTransitionOverlay();
  } else {
    showGuardOverlay(settings.preloadColor);
  }

  const finishInitialPageDetection = () => {
    transitionOnPageLoad(settings, incomingBrightness);
    setupBrightnessMonitoring(settings);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", finishInitialPageDetection, {
      once: true
    });
  } else {
    finishInitialPageDetection();
  }
})();
