const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..");
const BROWSERS = ["chrome", "firefox"];

function readManifest(browserName) {
  return JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, browserName, "manifest.json"), "utf8")
  );
}

function sharedFileExists(relativePath) {
  return fs.existsSync(path.join(repositoryRoot, "shared", relativePath));
}

test("browser manifests share the release version", () => {
  assert.equal(readManifest("firefox").version, readManifest("chrome").version);
});

test("shared modules load before the content script", () => {
  for (const browserName of BROWSERS) {
    const manifest = readManifest(browserName);
    assert.deepEqual(manifest.content_scripts[0].js, [
      "transition-policy.js",
      "settings.js",
      "color.js",
      "content/content-script.js"
    ]);
    manifest.content_scripts[0].js.forEach((file) => assert.ok(sharedFileExists(file), file));
  }
});

test("Firefox loads shared modules before the background script", () => {
  const scripts = readManifest("firefox").background.scripts;
  assert.equal(scripts[scripts.length - 1], "background.js");
  scripts.forEach((file) => assert.ok(sharedFileExists(file), file));
});

test("Chrome's service worker imports the same shared modules", () => {
  const background = fs.readFileSync(path.join(repositoryRoot, "shared", "background.js"), "utf8");
  for (const file of readManifest("firefox").background.scripts.slice(0, -1)) {
    assert.ok(background.includes(`"${file}"`), `background.js should importScripts ${file}`);
  }
});

test("early guard files and permissions are present", () => {
  for (const file of ["content/early-guard.js", "content/early-guard-os-dark.js"]) {
    assert.ok(sharedFileExists(file), file);
  }
  for (const browserName of BROWSERS) {
    const { permissions } = readManifest(browserName);
    assert.ok(permissions.includes("scripting"), `${browserName} needs scripting`);
    assert.ok(permissions.includes("alarms"), `${browserName} needs alarms`);
  }
});

test("localized manifest strings exist in the default locale", () => {
  const messages = JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, "shared", "_locales", "en", "messages.json"), "utf8")
  );
  for (const browserName of BROWSERS) {
    const manifest = readManifest(browserName);
    assert.equal(manifest.default_locale, "en");
    const used = JSON.stringify(manifest).match(/__MSG_(\w+)__/g) || [];
    for (const token of used) {
      const key = token.slice(6, -2);
      assert.ok(messages[key], `${browserName} uses missing message ${key}`);
    }
  }
});

test("both browsers offer the same keyboard commands", () => {
  assert.deepEqual(
    Object.keys(readManifest("chrome").commands).sort(),
    Object.keys(readManifest("firefox").commands).sort()
  );
  // Chrome allows at most four suggested shortcuts.
  const suggested = Object.values(readManifest("chrome").commands).filter((c) => c.suggested_key);
  assert.ok(suggested.length <= 4);
});
