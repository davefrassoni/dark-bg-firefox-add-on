# Dark Background Anti-Flash (Firefox)

Dark Background Anti-Flash is a Firefox extension that reduces sudden bright flashes while browsing in low-light environments.

## Features

- Replaces the Firefox new-tab page with a dark start screen.
- Injects a dark background at `document_start` to reduce white flash.
- Smoothly transitions from the preload color to the website background color.
- Optional bright-site override: keep bright pages on a custom dark color.
- Full customization via extension options.

## Options

- `Apply on all websites`
- `Preload dark color`
- `Transition duration (ms)`
- `Delay before transition (ms)`
- `Replace bright site background with a custom color`
- `Custom color for bright sites`
- `Brightness threshold (0-255)`
- `Excluded hostnames` (one per line)

## Local Testing In Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on**.
3. Select [manifest.json](./manifest.json).

## Project Structure

- `manifest.json` - extension manifest (MV3).
- `background.js` - default settings initialization.
- `content/content-script.js` - anti-flash behavior and transition logic.
- `content/preload.css` - immediate dark preload background.
- `newtab/*` - custom dark new-tab UI.
- `options/*` - settings UI and storage logic.
