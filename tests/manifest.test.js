const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..");

function readManifest(browserName) {
  return JSON.parse(
    fs.readFileSync(
      path.join(repositoryRoot, browserName, "manifest.json"),
      "utf8"
    )
  );
}

test("browser manifests share the release version", () => {
  const chromeManifest = readManifest("chrome");
  const firefoxManifest = readManifest("firefox");
  assert.equal(chromeManifest.version, "1.2.1");
  assert.equal(firefoxManifest.version, chromeManifest.version);
});

test("transition policy loads before the content script", () => {
  for (const browserName of ["chrome", "firefox"]) {
    const manifest = readManifest(browserName);
    assert.deepEqual(manifest.content_scripts[0].js, [
      "transition-policy.js",
      "content/content-script.js"
    ]);
  }
});
