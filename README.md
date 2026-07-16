# Dark Background Anti-Flash

A cross-browser Manifest V3 extension for Firefox and Chrome. It reduces bright
flashes while pages load or when returning to a bright tab.

[Install the Firefox version](https://addons.mozilla.org/en-US/firefox/addon/dark-background-anti-flash/).

## Features

- Temporary dark overlay with configurable hold and fade durations.
- Optional protection when returning to an existing tab.
- Transition-aware behavior: fades occur only when moving from a dark or
  unknown surface to a bright page, including across origins.
- Bright-page detection and optional replacement of bright CSS backgrounds.
- Per-site blacklist or whitelist.
- Settings stored with browser sync storage; no analytics or data collection.
- Options UI in English, Spanish, Portuguese, French, German, Chinese,
  Japanese, Korean, Russian, and Arabic.

## Project structure

- `shared/`: background logic, content script, options UI, and icons used by
  both browsers.
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

Run the transition-policy tests with:

```powershell
node --test tests/*.test.js
```

## Publishing

See [README_PUBLISHING.md](./README_PUBLISHING.md) for Chrome Web Store upload
steps, privacy declarations, permission justifications, and the Firefox release
checklist.
