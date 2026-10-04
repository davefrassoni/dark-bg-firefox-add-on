// Writes shared/_locales/<lang>/messages.json from shared/i18n.js, so the
// manifest name, description and shortcut labels share the UI translations.
// Run after editing i18n.js: node tools/build-locales.js
// tests/i18n.test.js fails if the generated files are out of date.
const fs = require("node:fs");
const path = require("node:path");
const { SUPPORTED_LANGUAGES, MANIFEST_KEYS, TRANSLATIONS } = require("../shared/i18n.js");

const EXTENSION_NAME = "Dark Background Anti-Flash";

function messagesFor(language) {
  const messages = { extName: { message: EXTENSION_NAME } };
  for (const key of MANIFEST_KEYS) {
    messages[key] = { message: TRANSLATIONS[language][key] || TRANSLATIONS.en[key] };
  }
  return `${JSON.stringify(messages, null, 2)}\n`;
}

function localesDirectory() {
  return path.resolve(__dirname, "..", "shared", "_locales");
}

function build() {
  for (const language of SUPPORTED_LANGUAGES) {
    const directory = path.join(localesDirectory(), language);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "messages.json"), messagesFor(language));
  }
}

if (require.main === module) {
  build();
  console.log(`Wrote ${SUPPORTED_LANGUAGES.length} locales to ${localesDirectory()}`);
}

module.exports = { messagesFor, localesDirectory };
