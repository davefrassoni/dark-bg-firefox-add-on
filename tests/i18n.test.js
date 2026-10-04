const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  SUPPORTED_LANGUAGES,
  MANIFEST_KEYS,
  TRANSLATIONS,
  resolveLanguage
} = require("../shared/i18n.js");
const { SUPPORTED_LANGUAGES: SETTINGS_LANGUAGES } = require("../shared/settings.js");
const { messagesFor, localesDirectory } = require("../tools/build-locales.js");

test("every language translates every key", () => {
  const keys = Object.keys(TRANSLATIONS.en);
  for (const language of SUPPORTED_LANGUAGES) {
    const missing = keys.filter((key) => !TRANSLATIONS[language][key]);
    assert.deepEqual(missing, [], `${language} is missing keys`);
  }
});

test("settings and i18n agree on the supported languages", () => {
  assert.deepEqual(SETTINGS_LANGUAGES, SUPPORTED_LANGUAGES);
});

test("generated _locales files are up to date", () => {
  for (const language of SUPPORTED_LANGUAGES) {
    const file = path.join(localesDirectory(), language, "messages.json");
    assert.equal(
      fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n"),
      messagesFor(language),
      `${file} is stale: run node tools/build-locales.js`
    );
  }
});

test("store descriptions fit Chrome's 132-character limit", () => {
  for (const language of SUPPORTED_LANGUAGES) {
    assert.ok(TRANSLATIONS[language].extDescription.length <= 132, language);
  }
  assert.ok(MANIFEST_KEYS.includes("extDescription"));
});

test("browser languages resolve to a supported translation", () => {
  assert.equal(resolveLanguage("auto", ["pt-PT"]), "pt_BR");
  assert.equal(resolveLanguage("auto", ["zh-TW", "en"]), "zh_CN");
  assert.equal(resolveLanguage("auto", ["nl", "de-AT"]), "de");
  assert.equal(resolveLanguage("auto", ["nl"]), "en");
  assert.equal(resolveLanguage("ja", ["en"]), "ja");
});
