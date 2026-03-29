# Dark Background Anti-Flash (Firefox)

Dark Background Anti-Flash is a Firefox extension that reduces sudden bright flashes while browsing in low-light environments.

## Features

- Uses a dark fullscreen overlay to reduce white flash on bright pages.
- Smoothly fades the overlay out to reveal the original page colors.
- Does not override Firefox's built-in new-tab page/favorites.
- Full customization via extension options.

## Options

- `Apply on all websites`
- `Preload dark color`
- `Page load transition duration (ms)`
- `Page load delay before transition (ms)`
- `Enable tab switch transition`
- `Tab switch transition duration (ms)`
- `Tab switch delay before transition (ms)`
- `Brightness threshold (0-255)`
- `Excluded hostnames` (one per line)

## Local Testing In Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on**.
3. Select [manifest.json](./manifest.json).

## Project Structure

- `manifest.json` - extension manifest (MV3).
- `background.js` - default settings initialization.
- `content/content-script.js` - brightness detection and overlay transition logic.
- `options/*` - settings UI and storage logic.
