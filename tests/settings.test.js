const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_SETTINGS,
  compileSettings,
  normalizeSettings,
  parseSiteRules,
  isLocationListed,
  isActiveOnLocation,
  isWithinSchedule,
  nextScheduleChange,
  siteRulesToMatchPatterns,
  setLocationListed
} = require("../shared/settings.js");

const at = (hours, minutes = 0) => new Date(2026, 0, 15, hours, minutes);

test("normalizeSettings fills defaults and clamps values", () => {
  const settings = normalizeSettings({
    transitionDurationMs: 99999,
    brightnessThreshold: "abc",
    preloadColor: "#ABC",
    scheduleMode: "sometimes",
    scheduleStart: "25:00",
    siteListMode: "whitelist"
  });
  assert.equal(settings.transitionDurationMs, 10000);
  assert.equal(settings.brightnessThreshold, DEFAULT_SETTINGS.brightnessThreshold);
  assert.equal(settings.preloadColor, "#aabbcc");
  assert.equal(settings.scheduleMode, "always");
  assert.equal(settings.scheduleStart, DEFAULT_SETTINGS.scheduleStart);
  assert.equal(settings.siteListMode, "whitelist");
});

test("legacy excludedHosts becomes the site list", () => {
  assert.equal(normalizeSettings({ excludedHosts: "a.com" }).siteListHosts, "a.com");
  assert.equal(
    normalizeSettings({ excludedHosts: "a.com", siteListHosts: "b.com" }).siteListHosts,
    "b.com"
  );
});

test("site rules match hosts, subdomains and path prefixes", () => {
  const rules = parseSiteRules("example.com\nhttps://docs.site.org/guide/\n*.wild.net\n\n not a url ");
  assert.equal(isLocationListed(rules, "example.com", "/"), true);
  assert.equal(isLocationListed(rules, "www.example.com", "/x"), true);
  assert.equal(isLocationListed(rules, "notexample.com", "/"), false);
  assert.equal(isLocationListed(rules, "docs.site.org", "/guide"), true);
  assert.equal(isLocationListed(rules, "docs.site.org", "/guide/intro"), true);
  assert.equal(isLocationListed(rules, "docs.site.org", "/guidebook"), false);
  assert.equal(isLocationListed(rules, "a.wild.net", "/"), true);
});

test("match patterns mirror the site rules", () => {
  const patterns = siteRulesToMatchPatterns(
    parseSiteRules("example.com\ndocs.site.org/guide\n192.168.0.1\nexample.com")
  );
  assert.deepEqual(patterns, [
    "*://*.example.com/*",
    "*://*.docs.site.org/guide",
    "*://*.docs.site.org/guide?*",
    "*://*.docs.site.org/guide/*",
    "*://192.168.0.1/*"
  ]);
});

test("setLocationListed adds and removes the current site", () => {
  const added = setLocationListed("a.com", "www.b.com", "/page", true);
  assert.equal(added, "a.com\nwww.b.com");
  assert.equal(setLocationListed(added, "www.b.com", "/page", true), added);
  // Removing drops parent-domain and path rules that cover the location.
  assert.equal(setLocationListed("b.com\na.com\nwww.b.com/page", "www.b.com", "/page", false), "a.com");
});

test("night schedule handles windows that cross midnight", () => {
  const night = { scheduleMode: "night", scheduleStart: "20:00", scheduleEnd: "07:00" };
  assert.equal(isWithinSchedule(night, at(23), false), true);
  assert.equal(isWithinSchedule(night, at(6, 59), false), true);
  assert.equal(isWithinSchedule(night, at(7), false), false);
  assert.equal(isWithinSchedule(night, at(12), false), false);

  const day = { scheduleMode: "night", scheduleStart: "09:00", scheduleEnd: "17:00" };
  assert.equal(isWithinSchedule(day, at(10), false), true);
  assert.equal(isWithinSchedule(day, at(18), false), false);
});

test("osDark schedule follows the system color scheme", () => {
  const settings = { scheduleMode: "osDark" };
  assert.equal(isWithinSchedule(settings, at(12), true), true);
  assert.equal(isWithinSchedule(settings, at(12), false), false);
});

test("nextScheduleChange returns the next boundary", () => {
  const night = { scheduleMode: "night", scheduleStart: "20:00", scheduleEnd: "07:00" };
  assert.deepEqual(nextScheduleChange(night, at(12)), at(20));
  assert.deepEqual(nextScheduleChange(night, at(21)), new Date(2026, 0, 16, 7, 0));
  assert.equal(nextScheduleChange({ scheduleMode: "always" }, at(12)), null);
});

test("isActiveOnLocation combines toggle, schedule and site list", () => {
  const base = compileSettings({ siteListHosts: "off.com" });
  assert.equal(isActiveOnLocation(base, "on.com", "/", at(12), false), true);
  assert.equal(isActiveOnLocation(base, "off.com", "/", at(12), false), false);
  assert.equal(
    isActiveOnLocation({ ...base, applyOnAllPages: false }, "on.com", "/", at(12), false),
    false
  );
  const whitelist = compileSettings({ siteListMode: "whitelist", siteListHosts: "only.com" });
  assert.equal(isActiveOnLocation(whitelist, "only.com", "/", at(12), false), true);
  assert.equal(isActiveOnLocation(whitelist, "other.com", "/", at(12), false), false);
});
