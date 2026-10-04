(async () => {
  const api = typeof browser !== "undefined" ? browser : chrome;
  const {
    MESSAGES,
    OVERLAY_ID,
    PAGE_BRIGHTNESS_STORAGE_KEY,
    PAGE_BRIGHTNESS,
    NAVIGATION_HINT_KEY,
    NAVIGATION_HINT_MAX_AGE_MS,
    clamp,
    compileSettings,
    isActiveOnLocation
  } = globalThis.DarkAntiFlashSettings;
  const {
    parseRgbString,
    brightnessOf,
    compositeColors,
    averageColors,
    rgbToHex,
    hexToRgb,
    createMemo,
    TRANSPARENT
  } = globalThis.DarkAntiFlashColor;
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

  // Top-level overlay already covers frames; running there could also skip
  // a matched site-list rule.
  if (window.top !== window) {
    return;
  }

  // Respect native browser pages and only allow true blank about pages.
  if (isAboutPage && !isAboutBlank) {
    return;
  }

  const CLEANUP_BUFFER_MS = 120;
  const BRIGHTNESS_REPORT_THROTTLE_MS = 400;
  const prefersDarkQuery = window.matchMedia("(prefers-color-scheme: dark)");

  // Read before this page overwrites it on pagehide.
  const navigationHint = readNavigationHint();

  function readNavigationHint() {
    try {
      const hint = JSON.parse(
        window.sessionStorage.getItem(NAVIGATION_HINT_KEY) || "null"
      );
      if (hint && Date.now() - hint.time < NAVIGATION_HINT_MAX_AGE_MS) {
        return hint;
      }
    } catch (error) {
      // Opaque origins have no sessionStorage.
    }
    return null;
  }

  function applyPageBrightness(value) {
    const root = document.documentElement;
    if (!root) {
      return;
    }
    const clamped = clamp(
      value,
      PAGE_BRIGHTNESS.min,
      PAGE_BRIGHTNESS.max,
      PAGE_BRIGHTNESS.default
    );
    if (clamped === PAGE_BRIGHTNESS.default) {
      root.style.removeProperty("filter");
    } else {
      root.style.setProperty("filter", `brightness(${clamped}%)`);
    }
  }

  function isEnabledOnCurrentPage(settings) {
    return isActiveOnLocation(
      settings,
      window.location.hostname,
      window.location.pathname,
      new Date(),
      prefersDarkQuery.matches
    );
  }

  // A slow-to-wake background page (e.g. a suspended Firefox event page)
  // could otherwise leave this unsettled forever, blocking every await on
  // it -- including the one that decides whether the guard fades or clears.
  async function sendRuntimeMessage(message, timeoutMs = 350) {
    try {
      return await Promise.race([
        api.runtime.sendMessage(message),
        new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs))
      ]);
    } catch (error) {
      return null;
    }
  }

  let colorCanvasContext = null;

  // Modern color syntaxes (oklch(), color()) stay unresolved in computed
  // styles; a 1px canvas converts them. Memoized: pages reuse few colors.
  const parseCssColor = createMemo(256, (colorValue) => {
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
  });

  function renderedBackgroundColorFor(element) {
    const style = getComputedStyle(element);
    const solidColor = parseCssColor(style.backgroundColor) || TRANSPARENT;
    const backgroundImage = style.backgroundImage || "";
    if (!backgroundImage.includes("gradient(")) {
      return solidColor;
    }

    const gradientColors = (backgroundImage.match(/rgba?\([^)]*\)/gi) || [])
      .map((color) => parseCssColor(color))
      .filter(Boolean);
    const average = averageColors(gradientColors);
    return average ? compositeColors(average, solidColor) : solidColor;
  }

  function detectBrowserCanvasColor() {
    const colorSchemes = (getComputedStyle(document.documentElement).colorScheme || "")
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
    const toPixels = (size) => (ratio) =>
      Math.min(size - 1, Math.max(0, Math.floor(size * ratio)));
    const xs = [0.2, 0.5, 0.8].map(toPixels(width));
    const ys = [0.2, 0.5, 0.8].map(toPixels(height));
    const samples = xs
      .flatMap((x) => ys.map((y) => sampleRenderedBackgroundAt(x, y, canvasColor)))
      .sort((left, right) => brightnessOf(left) - brightnessOf(right));

    return samples[Math.floor(samples.length / 2)] || canvasColor;
  }

  // Canvas, not a styled div: some browsers (e.g. Zen's "Boost" dark mode)
  // recolor every CSS style color in a tab, which would hue-rotate a div's
  // background-color. Canvas pixels aren't style colors, so they're immune.
  function paintOverlayColor(canvas, color) {
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    context.fillStyle = color;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  function ensureTransitionOverlay(color) {
    const root = document.documentElement;
    if (!root) {
      return null;
    }

    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement("canvas");
      overlay.id = OVERLAY_ID;
      // A solid fill looks the same at any size once stretched to the CSS
      // box below, so no need to match the viewport or handle resize.
      overlay.width = 2;
      overlay.height = 2;
      overlay.style.position = "fixed";
      overlay.style.inset = "0";
      overlay.style.width = "100%";
      overlay.style.height = "100%";
      overlay.style.pointerEvents = "none";
      overlay.style.zIndex = "2147483647";
      overlay.style.opacity = "1";
      overlay.style.transitionProperty = "opacity";
      overlay.style.transitionTimingFunction = "ease-out";
      paintOverlayColor(overlay, color);
      root.appendChild(overlay);
    } else {
      overlay.style.opacity = "1";
      paintOverlayColor(overlay, color);
    }

    return overlay;
  }

  function isOverlayVisible() {
    const overlay = document.getElementById(OVERLAY_ID);
    return Boolean(overlay && overlay.style.opacity !== "0");
  }

  let overlayGeneration = 0;
  // Called once a fade has finished and the overlay is gone.
  let onOverlaySettled = null;

  function removeTransitionOverlay() {
    overlayGeneration += 1;
    const existing = document.getElementById(OVERLAY_ID);
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
  }

  function setOverlayVisibleImmediately(overlay, color) {
    if (!overlay) {
      return;
    }

    paintOverlayColor(overlay, color);
    overlay.style.transitionDuration = "0ms";
    overlay.style.transitionDelay = "0ms";
    overlay.style.opacity = "1";

    // Forces a style recalc so repeated tab switches don't reuse the old
    // transition state.
    void overlay.offsetHeight;
  }

  function fadeOverlayOut(overlay, transitionDurationMs, initialHoldMs, generation) {
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

  function playOverlayTransition(color, transitionDurationMs, initialHoldMs) {
    const generation = ++overlayGeneration;
    const overlay = ensureTransitionOverlay(color);
    if (!overlay) {
      return;
    }

    setOverlayVisibleImmediately(overlay, color);
    fadeOverlayOut(overlay, transitionDurationMs, initialHoldMs, generation);

    setTimeout(() => {
      if (generation !== overlayGeneration) {
        return;
      }
      if (overlay.parentNode && overlay.style.opacity !== "1") {
        overlay.parentNode.removeChild(overlay);
      }
      if (onOverlaySettled) {
        onOverlaySettled();
      }
    }, transitionDurationMs + initialHoldMs + CLEANUP_BUFFER_MS);
  }

  function showGuardOverlay(color) {
    overlayGeneration += 1;
    const overlay = ensureTransitionOverlay(color);
    setOverlayVisibleImmediately(overlay, color);
    return overlay;
  }

  // The guard fades from the previous page's own background when that was
  // dark, so the hand-off is seamless; otherwise from the configured color.
  function chooseGuardColor(settings, previousColor) {
    if (settings.matchPreviousColor) {
      const rgb = hexToRgb(previousColor);
      if (rgb && brightnessOf(rgb) < settings.brightnessThreshold) {
        return previousColor;
      }
    }
    return settings.preloadColor;
  }

  // ---- Brightness detection and reporting ----

  let lastMeasurement = null;
  let lastReported = { brightness: null, color: null };

  function measurePage(settings) {
    const rgba = detectPageBackgroundRgba();
    lastMeasurement = {
      brightness:
        brightnessOf(rgba) >= settings.brightnessThreshold
          ? BRIGHTNESS_BRIGHT
          : BRIGHTNESS_DARK,
      color: rgbToHex(rgba)
    };
    return lastMeasurement;
  }

  function sendBrightnessReport(force = false) {
    const measurement = lastMeasurement;
    if (!measurement) {
      return;
    }
    if (
      !force &&
      measurement.brightness === lastReported.brightness &&
      measurement.color === lastReported.color
    ) {
      return;
    }
    lastReported = measurement;
    void sendRuntimeMessage({
      type: MESSAGES.BRIGHTNESS_REPORT,
      brightness: measurement.brightness,
      color: measurement.color,
      overlayVisible: isOverlayVisible()
    });
  }

  function reportCurrentBrightness(settings, force = false) {
    const { brightness } = measurePage(settings);
    sendBrightnessReport(force);
    return brightness;
  }

  let brightnessReportTimer = null;

  // Trailing throttle, run when the browser is idle: page mutations can
  // arrive many times a second and each measurement forces style and layout.
  function scheduleBrightnessReport(settings) {
    if (brightnessReportTimer !== null || document.visibilityState === "hidden") {
      return;
    }
    brightnessReportTimer = setTimeout(() => {
      const run = () => {
        brightnessReportTimer = null;
        if (document.visibilityState !== "hidden") {
          reportCurrentBrightness(settings);
        }
      };
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(run, { timeout: 300 });
      } else {
        run();
      }
    }, BRIGHTNESS_REPORT_THROTTLE_MS);
  }

  function setupBrightnessMonitoring(settings) {
    const observer = new MutationObserver(() => scheduleBrightnessReport(settings));
    const observe = () =>
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class", "style"]
      });
    observe();

    // Hidden tabs don't watch the page at all; they report their final
    // state as they're left and are re-measured on activation.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        observer.disconnect();
        reportCurrentBrightness(settings);
      } else {
        observe();
        scheduleBrightnessReport(settings);
      }
    });

    window.addEventListener("resize", () => scheduleBrightnessReport(settings), {
      passive: true
    });
    prefersDarkQuery.addEventListener("change", () => scheduleBrightnessReport(settings));
  }

  // Leaves a hint for the next page of this site in this tab (see
  // early-guard.js), so a bright-to-bright navigation skips the guard.
  function setupNavigationHint(settings) {
    window.addEventListener("pagehide", () => {
      if (!isEnabledOnCurrentPage(settings)) {
        return;
      }
      const { brightness, color } = measurePage(settings);
      try {
        window.sessionStorage.setItem(
          NAVIGATION_HINT_KEY,
          JSON.stringify({
            brightness,
            guardColor: chooseGuardColor(settings, color),
            time: Date.now()
          })
        );
      } catch (error) {
        // Storage can be full or unavailable; the hint is only an optimization.
      }
    });
  }

  // ---- Replacing bright CSS backgrounds ----
  // Work is queued and done in small per-frame batches: all style reads of a
  // batch first, then all writes, so the browser recalculates styles once per
  // batch instead of once per element.

  function isInjectedBackground(element, original) {
    return (
      element.style.getPropertyValue("background-color") === original.injectedValue &&
      element.style.getPropertyPriority("background-color") === original.injectedPriority
    );
  }

  function restoreOriginalBackground(element, original) {
    if (original.value) {
      element.style.setProperty("background-color", original.value, original.priority);
    } else {
      element.style.removeProperty("background-color");
    }
  }

  function setupBrightBackgroundOverrides(settings) {
    const FRAME_BUDGET_MS = 6;
    const originalBackgrounds = new Map();
    const forcedElements = new Set();
    const pendingRoots = [];
    let activeWalker = null;
    let canvasDirty = true;
    let frame = null;
    let stopped = false;

    const isBrightColor = (color) =>
      Boolean(
        color &&
          color.a > 0.05 &&
          brightnessOf(color) >= settings.backgroundBrightnessThreshold
      );

    const injectDark = (element) => {
      if (!originalBackgrounds.has(element)) {
        originalBackgrounds.set(element, {
          value: element.style.getPropertyValue("background-color"),
          priority: element.style.getPropertyPriority("background-color")
        });
      }
      element.style.setProperty("background-color", settings.darkBackgroundColor, "important");
      const original = originalBackgrounds.get(element);
      original.injectedValue = element.style.getPropertyValue("background-color");
      original.injectedPriority = element.style.getPropertyPriority("background-color");
    };

    // Hidden tabs get no animation frames, so they work on a timer instead
    // (a larger budget is fine there: nothing is being painted).
    let frameIsTimer = false;
    const schedule = () => {
      if (stopped || frame !== null) {
        return;
      }
      frameIsTimer = document.visibilityState === "hidden";
      frame = frameIsTimer
        ? setTimeout(() => processBatch(4 * FRAME_BUDGET_MS), 0)
        : requestAnimationFrame(() => processBatch(FRAME_BUDGET_MS));
    };
    const cancelScheduled = () => {
      if (frame !== null) {
        (frameIsTimer ? clearTimeout : cancelAnimationFrame)(frame);
        frame = null;
      }
    };

    const enqueueSubtree = (root) => {
      pendingRoots.push(root);
      schedule();
    };

    // Elements whose own class/style changed come first and are re-measured
    // even if already darkened; then the queued subtrees are walked.
    const nextCandidate = () => {
      if (forcedElements.size > 0) {
        const element = forcedElements.values().next().value;
        forcedElements.delete(element);
        return { element, forced: true };
      }
      while (activeWalker || pendingRoots.length > 0) {
        if (!activeWalker) {
          const root = pendingRoots.shift();
          if (!root.isConnected) {
            continue;
          }
          activeWalker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
          if (root !== document.documentElement) {
            return { element: root, forced: false };
          }
        }
        const next = activeWalker.nextNode();
        if (next) {
          return { element: next, forced: false };
        }
        activeWalker = null;
      }
      return null;
    };

    function processPageCanvas() {
      // The page canvas (root background) is judged from rendered samples,
      // since its visible color often comes from body or a full-page wrapper.
      const root = document.documentElement;
      const original = originalBackgrounds.get(root);
      if (original) {
        restoreOriginalBackground(root, original);
      }
      if (isBrightColor(detectPageBackgroundRgba())) {
        injectDark(root);
      } else if (original) {
        originalBackgrounds.delete(root);
      }
    }

    function processBatch(budgetMs) {
      frame = null;
      if (stopped) {
        return;
      }
      const deadline = performance.now() + budgetMs;
      const written = new Set();

      if (canvasDirty) {
        canvasDirty = false;
        processPageCanvas();
        written.add(document.documentElement);
      }

      // Collect a batch. Elements already darkened by us are skipped unless
      // their own class/style changed (then they're re-measured).
      const toMeasure = [];
      const toRemeasure = [];
      let next;
      while (performance.now() < deadline && (next = nextCandidate())) {
        const { element, forced } = next;
        if (
          !(element instanceof Element) ||
          element.id === OVERLAY_ID ||
          element === document.documentElement
        ) {
          continue;
        }
        const original = originalBackgrounds.get(element);
        if (!original) {
          toMeasure.push(element);
        } else if (!isInjectedBackground(element, original)) {
          // The page replaced our inline value: that's the new original.
          originalBackgrounds.set(element, {
            value: element.style.getPropertyValue("background-color"),
            priority: element.style.getPropertyPriority("background-color")
          });
          toMeasure.push(element);
        } else if (forced) {
          toRemeasure.push(element);
        }
      }

      // Re-measured elements need their original color back first (writes),
      // then everything is read in one pass, then written in one pass.
      for (const element of toRemeasure) {
        restoreOriginalBackground(element, originalBackgrounds.get(element));
        written.add(element);
      }
      const verdicts = [...toMeasure, ...toRemeasure].map((element) => [
        element,
        isBrightColor(parseCssColor(getComputedStyle(element).backgroundColor))
      ]);
      for (const [element, bright] of verdicts) {
        if (bright) {
          injectDark(element);
          written.add(element);
        } else {
          originalBackgrounds.delete(element);
        }
      }

      // Drop the observer records caused by our own writes; keep the page's.
      handleMutations(
        observer
          .takeRecords()
          .filter(
            (record) =>
              !(record.type === "attributes" &&
                record.attributeName === "style" &&
                written.has(record.target))
          )
      );

      if (forcedElements.size > 0 || pendingRoots.length > 0 || activeWalker || canvasDirty) {
        schedule();
      }
    }

    function scheduleFullScan() {
      canvasDirty = true;
      enqueueSubtree(document.documentElement);
    }

    function handleMutations(mutations) {
      let fullScan = false;
      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          const target = mutation.target;
          if (!(target instanceof Element) || target.id === OVERLAY_ID) {
            continue;
          }
          if (target === document.documentElement || target === document.body) {
            // Theme switches usually toggle a class here.
            fullScan = true;
            continue;
          }
          forcedElements.add(target);
          if (mutation.attributeName === "class") {
            // Descendant selectors may change with the class.
            pendingRoots.push(target);
          }
          continue;
        }

        if (mutation.target instanceof Element && mutation.target.closest("style")) {
          fullScan = true;
        }
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element) || node.id === OVERLAY_ID) {
            continue;
          }
          if (node.matches("style, link[rel~='stylesheet']")) {
            fullScan = true;
            if (node instanceof HTMLLinkElement) {
              node.addEventListener("load", scheduleFullScan, { once: true });
            }
          }
          pendingRoots.push(node);
        }
      }
      if (fullScan) {
        scheduleFullScan();
      } else if (mutations.length > 0) {
        schedule();
      }
    }

    const observer = new MutationObserver(handleMutations);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style"]
    });
    // First pass now rather than next frame, so the page's first paint is
    // already darkened as far as a generous budget allows.
    canvasDirty = true;
    pendingRoots.push(document.documentElement);
    processBatch(50);

    // A tab that was hidden may have switched from timers to frames.
    const onVisibilityChange = () => {
      if (frame !== null && frameIsTimer !== (document.visibilityState === "hidden")) {
        cancelScheduled();
        schedule();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("resize", scheduleFullScan, { passive: true });
    prefersDarkQuery.addEventListener("change", scheduleFullScan);

    return {
      stop() {
        stopped = true;
        cancelScheduled();
        document.removeEventListener("visibilitychange", onVisibilityChange);
        observer.disconnect();
        window.removeEventListener("resize", scheduleFullScan);
        prefersDarkQuery.removeEventListener("change", scheduleFullScan);
        originalBackgrounds.forEach((original, element) => {
          if (element.isConnected) {
            restoreOriginalBackground(element, original);
          }
        });
        originalBackgrounds.clear();
        forcedElements.clear();
        pendingRoots.length = 0;
        activeWalker = null;
      }
    };
  }

  // ---- Transitions ----

  function transitionOnPageLoad(settings, incomingBrightness, guardColor) {
    const { brightness: nextBrightness } = measurePage(settings);
    const shouldFade = shouldFadeTransition(incomingBrightness, nextBrightness);

    if (document.visibilityState === "hidden") {
      if (settings.tabSwitchTransitionEnabled && shouldFade) {
        showGuardOverlay(guardColor);
      } else {
        removeTransitionOverlay();
      }
    } else if (shouldFade) {
      playOverlayTransition(guardColor, settings.transitionDurationMs, settings.initialHoldMs);
    } else {
      removeTransitionOverlay();
    }
    sendBrightnessReport(true);
  }

  function setupTabStateMessages(settings) {
    api.runtime.onMessage.addListener((message) => {
      if (!message || !isEnabledOnCurrentPage(settings)) {
        return false;
      }

      if (message.type === MESSAGES.SET_TAB_GUARD) {
        // Guard messages are for background tabs only -- activation has its
        // own message, so this can't cancel an in-progress fade.
        if (document.visibilityState !== "hidden") {
          return false;
        }

        const nextBrightness = reportCurrentBrightness(settings);
        if (
          message.armed &&
          settings.tabSwitchTransitionEnabled &&
          nextBrightness === BRIGHTNESS_BRIGHT
        ) {
          showGuardOverlay(chooseGuardColor(settings, message.activeColor));
        } else {
          removeTransitionOverlay();
        }
        return false;
      }

      if (message.type === MESSAGES.TAB_ACTIVATED) {
        const { brightness: nextBrightness } = measurePage(settings);
        if (
          settings.tabSwitchTransitionEnabled &&
          shouldFadeTransition(normalizeBrightness(message.previousBrightness), nextBrightness)
        ) {
          playOverlayTransition(
            chooseGuardColor(settings, message.previousColor),
            settings.tabSwitchTransitionDurationMs,
            settings.tabSwitchInitialHoldMs
          );
        } else {
          removeTransitionOverlay();
        }
        sendBrightnessReport(true);
      }

      return false;
    });
  }

  // Local backstop, independent of background.js: if the background page
  // (an "event page" in Firefox, similar in spirit to Chrome's service
  // worker) is suspended or its message never arrives for any reason, the
  // guard could otherwise stay stuck solid forever with nothing to un-stick
  // it. A short delay after every tab activation, if it's still fully
  // opaque, resolve it from fresh local brightness detection instead.
  function setupVisibilityBackstop(settings) {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible" || !isEnabledOnCurrentPage(settings)) {
        return;
      }

      setTimeout(() => {
        const overlay = document.getElementById(OVERLAY_ID);
        if (!overlay || overlay.style.opacity !== "1") {
          return;
        }

        const nextBrightness = reportCurrentBrightness(settings, true);
        if (settings.tabSwitchTransitionEnabled && nextBrightness === BRIGHTNESS_BRIGHT) {
          playOverlayTransition(
            settings.preloadColor,
            settings.tabSwitchTransitionDurationMs,
            settings.tabSwitchInitialHoldMs
          );
        } else {
          removeTransitionOverlay();
        }
      }, 400);
    });
  }

  // ---- Startup ----
  // The guard itself was painted by early-guard.js (where active). Listeners
  // register synchronously: an unheard message is dropped, not queued, so
  // registering after the awaits could miss a tab-activation or guard
  // message and leave the overlay stuck. settings is mutated in place (not
  // reassigned) once real values load, so these still see them.
  const settings = compileSettings({});
  setupTabStateMessages(settings);
  setupVisibilityBackstop(settings);
  setupNavigationHint(settings);

  api.runtime.onMessage.addListener((message) => {
    if (message && message.type === MESSAGES.SET_PAGE_BRIGHTNESS) {
      applyPageBrightness(message.value);
    }
    return false;
  });

  let rawSettings = await api.storage.sync.get(null);
  Object.assign(settings, compileSettings(rawSettings));

  // Once a fade finishes, report again so pixel-accurate detection can take
  // its screenshot without the overlay in it.
  onOverlaySettled = () => {
    if (settings.accurateDetection) {
      reportCurrentBrightness(settings, true);
    }
  };

  // Independent of the guard settings above -- applies even if the guard is
  // disabled or this site is excluded.
  const storedPageBrightness = await api.storage.local.get({
    [PAGE_BRIGHTNESS_STORAGE_KEY]: {}
  });
  applyPageBrightness(
    (storedPageBrightness[PAGE_BRIGHTNESS_STORAGE_KEY] || {})[window.location.hostname]
  );

  const stateContext = (await sendRuntimeMessage({ type: MESSAGES.DOCUMENT_INIT })) || {};
  const incomingBrightness =
    normalizeBrightness(stateContext.previousBrightness) ||
    normalizeBrightness(navigationHint && navigationHint.brightness) ||
    normalizeBrightness(stateContext.ambientBrightness);
  const guardColor = chooseGuardColor(
    settings,
    stateContext.previousColor ||
      (navigationHint && navigationHint.guardColor) ||
      stateContext.ambientColor
  );
  let backgroundOverrideController = null;

  const syncBackgroundOverrides = () => {
    const shouldOverride =
      isEnabledOnCurrentPage(settings) && settings.darkenBrightBackgroundsEnabled;

    if (shouldOverride && !backgroundOverrideController) {
      backgroundOverrideController = setupBrightBackgroundOverrides(settings);
    } else if (!shouldOverride && backgroundOverrideController) {
      backgroundOverrideController.stop();
      backgroundOverrideController = null;
    }
  };

  api.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local") {
      if (Object.prototype.hasOwnProperty.call(changes, PAGE_BRIGHTNESS_STORAGE_KEY)) {
        const updatedMap = changes[PAGE_BRIGHTNESS_STORAGE_KEY].newValue || {};
        applyPageBrightness(updatedMap[window.location.hostname]);
      }
      return;
    }
    if (areaName !== "sync") {
      return;
    }

    rawSettings = { ...rawSettings };
    Object.entries(changes).forEach(([key, change]) => {
      if (change.newValue === undefined) {
        delete rawSettings[key];
      } else {
        rawSettings[key] = change.newValue;
      }
    });
    Object.assign(settings, compileSettings(rawSettings));

    const changed = (keys) =>
      keys.some((key) => Object.prototype.hasOwnProperty.call(changes, key));

    if (
      backgroundOverrideController &&
      changed([
        "applyOnAllPages",
        "siteListMode",
        "siteListHosts",
        "excludedHosts",
        "scheduleMode",
        "scheduleStart",
        "scheduleEnd",
        "darkenBrightBackgroundsEnabled",
        "darkBackgroundColor",
        "backgroundBrightnessThreshold"
      ])
    ) {
      backgroundOverrideController.stop();
      backgroundOverrideController = null;
    }

    if (
      !isEnabledOnCurrentPage(settings) ||
      (changed(["tabSwitchTransitionEnabled"]) && !settings.tabSwitchTransitionEnabled)
    ) {
      removeTransitionOverlay();
    }
    syncBackgroundOverrides();
    reportCurrentBrightness(
      settings,
      changed(["tabSwitchTransitionEnabled", "brightnessThreshold", "preloadColor"])
    );
  });

  const whenDomReady = (callback) => {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
    } else {
      callback();
    }
  };

  if (!isEnabledOnCurrentPage(settings)) {
    removeTransitionOverlay();
    whenDomReady(() => {
      reportCurrentBrightness(settings, true);
      setupBrightnessMonitoring(settings);
    });
    return;
  }

  syncBackgroundOverrides();

  if (incomingBrightness === BRIGHTNESS_BRIGHT) {
    removeTransitionOverlay();
  } else {
    // Repaint the early guard in the chosen color, or paint it now if the
    // early guard didn't run (e.g. its registration hasn't happened yet).
    showGuardOverlay(guardColor);
  }

  whenDomReady(() => {
    transitionOnPageLoad(settings, incomingBrightness, guardColor);
    setupBrightnessMonitoring(settings);
  });
})();
