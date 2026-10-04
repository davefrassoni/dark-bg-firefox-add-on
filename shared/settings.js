// Settings shared by every extension context (content scripts, background,
// popup, options) and by the Node tests. Pure functions only: no browser APIs.
(function exposeSettings(root, factory) {
  const settings = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = settings;
  } else {
    root.DarkAntiFlashSettings = settings;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const DEFAULT_SETTINGS = Object.freeze({
    applyOnAllPages: true,
    preloadColor: "#0b0d10",
    matchPreviousColor: true,
    transitionDurationMs: 1800,
    initialHoldMs: 220,
    tabSwitchTransitionEnabled: true,
    tabSwitchTransitionDurationMs: 1800,
    tabSwitchInitialHoldMs: 220,
    brightnessThreshold: 185,
    accurateDetection: false,
    darkenBrightBackgroundsEnabled: false,
    darkBackgroundColor: "#121417",
    backgroundBrightnessThreshold: 210,
    scheduleMode: "always",
    scheduleStart: "20:00",
    scheduleEnd: "07:00",
    siteListMode: "blacklist",
    siteListHosts: "",
    uiLanguage: "auto",
    excludedHosts: ""
  });

  const SCHEDULE_MODES = ["always", "night", "osDark"];
  const SUPPORTED_LANGUAGES = [
    "en",
    "es",
    "pt_BR",
    "fr",
    "de",
    "zh_CN",
    "ja",
    "ko",
    "ru",
    "ar"
  ];

  const MESSAGES = Object.freeze({
    DOCUMENT_INIT: "dark-anti-flash:document-init",
    BRIGHTNESS_REPORT: "dark-anti-flash:brightness-report",
    SET_TAB_GUARD: "dark-anti-flash:set-tab-guard",
    TAB_ACTIVATED: "dark-anti-flash:tab-activated",
    SET_PAGE_BRIGHTNESS: "dark-anti-flash:set-page-brightness"
  });

  const OVERLAY_ID = "dark-background-anti-flash-overlay";
  const PAGE_BRIGHTNESS_STORAGE_KEY = "darkAntiFlashPageBrightness";
  // Written to the site's own sessionStorage on pagehide so the next page of
  // the same site in the same tab can decide on the guard synchronously.
  const NAVIGATION_HINT_KEY = "darkAntiFlashNavigationHint";
  const NAVIGATION_HINT_MAX_AGE_MS = 4000;
  const PAGE_BRIGHTNESS = Object.freeze({ min: 30, max: 150, step: 5, default: 100 });

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
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(normalized)) {
      return fallback;
    }
    if (normalized.length === 4) {
      return (
        "#" +
        normalized[1].repeat(2) +
        normalized[2].repeat(2) +
        normalized[3].repeat(2)
      );
    }
    return normalized;
  }

  function normalizeTime(value, fallback) {
    if (typeof value !== "string") {
      return fallback;
    }
    const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
      return fallback;
    }
    return `${match[1].padStart(2, "0")}:${match[2]}`;
  }

  function normalizeLanguage(value) {
    return SUPPORTED_LANGUAGES.includes(value) ? value : "auto";
  }

  // Stored shape: what the options page writes to storage.sync.
  function normalizeSettings(raw) {
    const source = { ...DEFAULT_SETTINGS, ...(raw || {}) };
    // Older versions stored the site list as excludedHosts.
    const siteListHosts =
      raw && raw.siteListHosts === undefined && raw.excludedHosts
        ? raw.excludedHosts
        : source.siteListHosts;
    const d = DEFAULT_SETTINGS;

    return {
      applyOnAllPages: Boolean(source.applyOnAllPages),
      preloadColor: normalizeHexColor(source.preloadColor, d.preloadColor),
      matchPreviousColor: Boolean(source.matchPreviousColor),
      transitionDurationMs: clamp(source.transitionDurationMs, 0, 10000, d.transitionDurationMs),
      initialHoldMs: clamp(source.initialHoldMs, 0, 5000, d.initialHoldMs),
      tabSwitchTransitionEnabled: Boolean(source.tabSwitchTransitionEnabled),
      tabSwitchTransitionDurationMs: clamp(
        source.tabSwitchTransitionDurationMs,
        0,
        10000,
        d.tabSwitchTransitionDurationMs
      ),
      tabSwitchInitialHoldMs: clamp(source.tabSwitchInitialHoldMs, 0, 5000, d.tabSwitchInitialHoldMs),
      brightnessThreshold: clamp(source.brightnessThreshold, 0, 255, d.brightnessThreshold),
      accurateDetection: Boolean(source.accurateDetection),
      darkenBrightBackgroundsEnabled: Boolean(source.darkenBrightBackgroundsEnabled),
      darkBackgroundColor: normalizeHexColor(source.darkBackgroundColor, d.darkBackgroundColor),
      backgroundBrightnessThreshold: clamp(
        source.backgroundBrightnessThreshold,
        0,
        255,
        d.backgroundBrightnessThreshold
      ),
      scheduleMode: SCHEDULE_MODES.includes(source.scheduleMode)
        ? source.scheduleMode
        : d.scheduleMode,
      scheduleStart: normalizeTime(source.scheduleStart, d.scheduleStart),
      scheduleEnd: normalizeTime(source.scheduleEnd, d.scheduleEnd),
      siteListMode: source.siteListMode === "whitelist" ? "whitelist" : "blacklist",
      siteListHosts: typeof siteListHosts === "string" ? siteListHosts : "",
      uiLanguage: normalizeLanguage(source.uiLanguage),
      excludedHosts: ""
    };
  }

  // Runtime shape: normalized settings plus the parsed site rules.
  function compileSettings(raw) {
    const normalized = normalizeSettings(raw);
    return { ...normalized, siteListRules: parseSiteRules(normalized.siteListHosts) };
  }

  function parseSiteRule(entry) {
    const normalizedEntry = entry.replace(/^\/\//, "").replace(/\/\*$/, "");
    const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(entry);
    const withScheme = hasScheme ? normalizedEntry : `https://${normalizedEntry}`;

    try {
      const parsed = new URL(withScheme);
      const entryHasPath = normalizedEntry
        .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
        .includes("/");
      const pathPrefix =
        entryHasPath && parsed.pathname !== "/"
          ? parsed.pathname.replace(/\/+$/, "")
          : "";
      const hostname = parsed.hostname.toLowerCase().replace(/^\*\./, "");
      return hostname ? { hostname, pathPrefix } : null;
    } catch (error) {
      return null;
    }
  }

  function parseSiteRules(raw) {
    if (typeof raw !== "string" || raw.trim() === "") {
      return [];
    }
    return raw
      .split(/\r?\n/g)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map(parseSiteRule)
      .filter(Boolean);
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

  function ruleMatches(rule, hostname, pathname) {
    return (
      isHostnameMatch(hostname.toLowerCase(), rule.hostname) &&
      isPathMatch(pathname || "/", rule.pathPrefix)
    );
  }

  function isLocationListed(rules, hostname, pathname) {
    return rules.some((rule) => ruleMatches(rule, hostname, pathname));
  }

  function minutesOf(time) {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  }

  function isWithinSchedule(settings, now, prefersDark) {
    if (settings.scheduleMode === "osDark") {
      return Boolean(prefersDark);
    }
    if (settings.scheduleMode !== "night") {
      return true;
    }
    const start = minutesOf(settings.scheduleStart);
    const end = minutesOf(settings.scheduleEnd);
    const current = now.getHours() * 60 + now.getMinutes();
    if (start === end) {
      return true;
    }
    return start < end
      ? current >= start && current < end
      : current >= start || current < end;
  }

  // The next moment the night schedule flips on or off, or null.
  function nextScheduleChange(settings, now) {
    if (settings.scheduleMode !== "night" || settings.scheduleStart === settings.scheduleEnd) {
      return null;
    }
    const candidates = [settings.scheduleStart, settings.scheduleEnd].map((time) => {
      const [hours, minutes] = time.split(":").map(Number);
      const date = new Date(now.getTime());
      date.setHours(hours, minutes, 0, 0);
      if (date.getTime() <= now.getTime()) {
        date.setDate(date.getDate() + 1);
      }
      return date;
    });
    return candidates.reduce((earliest, date) => (date < earliest ? date : earliest));
  }

  function isActiveOnLocation(settings, hostname, pathname, now, prefersDark) {
    if (!settings.applyOnAllPages || !isWithinSchedule(settings, now, prefersDark)) {
      return false;
    }
    const listed = isLocationListed(settings.siteListRules, hostname, pathname);
    return settings.siteListMode === "whitelist" ? listed : !listed;
  }

  // Match patterns for the browser's content-script registration, so the
  // early guard never runs on pages the user excluded.
  function siteRuleToMatchPatterns(rule) {
    const host = rule.hostname;
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(host)) {
      return [];
    }
    const isIpAddress = /^\d+(\.\d+){3}$/.test(host);
    const hostPattern = isIpAddress ? host : `*.${host}`;
    if (!rule.pathPrefix) {
      return [`*://${hostPattern}/*`];
    }
    const path = rule.pathPrefix.replace(/\*/g, "");
    return [
      `*://${hostPattern}${path}`,
      `*://${hostPattern}${path}?*`,
      `*://${hostPattern}${path}/*`
    ];
  }

  function siteRulesToMatchPatterns(rules) {
    return [...new Set(rules.flatMap(siteRuleToMatchPatterns))];
  }

  // Adds or removes the current site from the site list text. Removing drops
  // every line that matches the location, including parent-domain rules.
  function setLocationListed(listText, hostname, pathname, listed) {
    const lines = typeof listText === "string" ? listText.split(/\r?\n/g) : [];
    if (listed) {
      if (isLocationListed(parseSiteRules(listText), hostname, pathname)) {
        return listText;
      }
      const kept = lines.filter((line) => line.trim() !== "");
      return [...kept, hostname.toLowerCase()].join("\n");
    }
    return lines
      .filter((line) => {
        const rule = line.trim() ? parseSiteRule(line.trim()) : null;
        return !(rule && ruleMatches(rule, hostname, pathname));
      })
      .filter((line) => line.trim() !== "")
      .join("\n");
  }

  return {
    DEFAULT_SETTINGS,
    SCHEDULE_MODES,
    SUPPORTED_LANGUAGES,
    MESSAGES,
    OVERLAY_ID,
    PAGE_BRIGHTNESS_STORAGE_KEY,
    NAVIGATION_HINT_KEY,
    NAVIGATION_HINT_MAX_AGE_MS,
    PAGE_BRIGHTNESS,
    clamp,
    normalizeHexColor,
    normalizeTime,
    normalizeLanguage,
    normalizeSettings,
    compileSettings,
    parseSiteRules,
    isLocationListed,
    isWithinSchedule,
    nextScheduleChange,
    isActiveOnLocation,
    siteRulesToMatchPatterns,
    setLocationListed
  };
});
