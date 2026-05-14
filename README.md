# Dark Background Anti-Flash

A small Firefox extension that reduces the sudden white flash that can appear while bright pages load or when returning to a bright tab.

[Install it from Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/dark-background-anti-flash/).

## What It Does

- Shows a temporary dark overlay before a bright page is ready.
- Fades the overlay away smoothly instead of snapping to white.
- Can repeat the same protection when you return to an existing tab.
- Leaves Firefox's built-in New Tab page and favorites alone.
- Stores settings with Firefox sync storage and does not collect data.

## Settings

- `Apply on all websites`: master switch for the page overlay.
- `Preload dark color`: color used while the page is guarded.
- `Transition duration`: fade-out speed for page loads.
- `Delay before transition`: how long to hold the dark overlay before fading.
- `Tab switch transition`: optional fade when returning to an existing tab.
- `Brightness threshold`: only pages at or above this brightness get the overlay.
- `Excluded hostnames`: one hostname per line for sites that should be skipped.

## Local Testing

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on**.
3. Select [manifest.json](./manifest.json).
4. Open a bright page and confirm the dark overlay fades out cleanly.
5. Open the extension options page and confirm settings save and apply after reload.

## Packaging

Run the packager from the repository root:

```powershell
.\package.ps1
```

Versioned archives are written to `dist/`.

## Project Structure

- [manifest.json](./manifest.json): Firefox MV3 manifest.
- [background.js](./background.js): installs and migrates default settings.
- [content/content-script.js](./content/content-script.js): detects bright pages and runs overlay transitions.
- [options](./options): settings page UI, styles, and storage logic.
