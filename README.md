# Dark Background Anti-Flash

A cross-browser Manifest V3 extension for Firefox and Chrome. It reduces bright
flashes while pages load or when returning to a bright tab.

[Landing page](https://davefrassoni.com/darkbg/) · [Install for Firefox](https://addons.mozilla.org/en-US/firefox/addon/dark-background-anti-flash/) · [Install for Chrome](https://chromewebstore.google.com/detail/dark-background-anti-flas/dkipfcfdojolkdecalknlonckfleobee)

## Features

- Temporary dark overlay with configurable hold and fade durations, painted
  before the page's first frame.
- Optional protection when returning to an existing tab.
- Transition-aware behavior: fades occur only when moving from a dark or
  unknown surface to a bright page, including across origins.
- The fade starts from the previous page's own color when it was dark.
- Bright-page detection, an optional pixel-accurate mode that also catches
  bright images, and optional replacement of bright CSS backgrounds.
- Per-site blacklist or whitelist, with a one-click "Pause here" in the
  toolbar popup.
- Schedule: always, only during set hours, or only while the system is in
  dark mode.
- Keyboard shortcuts: toggle the guard (Alt+Shift+D), pause or resume on the
  current site (Alt+Shift+S), brighten or dim the current site
  (Alt+Shift+Up/Down).
- Fade preview on the options page.
- Settings stored with browser sync storage; no analytics or data collection.
- Popup, options page and store description in English, Spanish, Portuguese,
  French, German, Chinese, Japanese, Korean, Russian, and Arabic.

## How it works

- `content/early-guard.js` paints the guard at `document_start`. The
  background script registers it dynamically (`scripting` API) only where the
  guard is active: excluded sites, a disabled guard and hours outside the
  schedule never get it, so they never see a dark flash.
- For same-site navigation the content script leaves a short-lived hint in
  the site's `sessionStorage` on `pagehide`, so a bright-to-bright navigation
  skips the guard without waiting for the background script.
- `content/content-script.js` then decides from the previous page's
  brightness (tracked per tab by `background.js`) whether to fade or clear.

## Project structure

- `shared/`: background logic, content scripts, popup, options UI, icons and
  `_locales`, used by both browsers.
  - `settings.js`, `color.js`, `transition-policy.js`, `i18n.js`: shared,
    side-effect-free modules loaded by every context and by the tests.
- `tools/build-locales.js`: regenerates `shared/_locales` from `i18n.js`.
- `firefox/manifest.json`: Firefox-specific manifest (`menus`,
  `background.scripts`, and Gecko metadata).
- `chrome/manifest.json`: Chrome-specific manifest (`contextMenus` and an MV3
  service worker).
- `package.ps1`: merges shared and browser-specific files into loadable builds
  and store-ready ZIP archives.

Keep the version in both manifests identical for every release.

## Build

From the repository root:

```powershell
.\package.ps1
```

This creates:

- `build/firefox/` and `build/chrome/` for local testing.
- `dist/dark-background-anti-flash-firefox-v<VERSION>.zip`.
- `dist/dark-background-anti-flash-chrome-v<VERSION>.zip`.

Build only one browser with `.\package.ps1 -Browser Chrome` or
`.\package.ps1 -Browser Firefox`.

## Local testing

### Chrome

1. Run `.\package.ps1 -Browser Chrome`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select `build/chrome`.
5. Click the toolbar button and confirm the options page opens.
6. Test page-load and tab-switch fades on ordinary `http` and `https` pages.

### Firefox

1. Run `.\package.ps1 -Browser Firefox`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on**.
4. Select `build/firefox/manifest.json`.

Browser-owned pages such as `chrome://extensions`, the Chrome Web Store, and
Firefox `about:` pages do not allow normal content-script injection.

## Chrome-specific implications

- Chrome displays a broad site-access warning because automatic protection at
  `document_start` requires `<all_urls>`. Restricting the extension to **On
  click** in Chrome's site-access controls prevents automatic anti-flash
  behavior.
- Chrome does not permit this extension to modify `chrome://` pages or the
  Chrome Web Store. Access to local `file://` pages also requires the user to
  enable **Allow access to file URLs** on `chrome://extensions`.
- Firefox Sync and Chrome Sync are separate. Settings do not migrate between
  browsers even though both builds use the same settings format.
- The Chrome background code runs as an event-driven service worker. All
  per-tab brightness coordination is kept in session storage so it survives
  service-worker suspension without becoming browsing history.

## Tests

```powershell
node --test
```

After editing translations in `shared/i18n.js`, run
`node tools/build-locales.js`; a test fails if `_locales` is out of date.

GitHub Actions (`.github/workflows/ci.yml`) runs the tests, builds both
browsers and validates the Firefox build with `web-ext lint` on every push.
