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

- Click the toolbar button to open the options page.
- Right-click the toolbar button and choose `Open options`.
- If the button is not visible, open Firefox's Extensions button, find `Dark Background Anti-Flash`, and pin it to the toolbar.
- `Settings page language`: use `Auto` or choose English, Spanish, Portuguese, French, German, Chinese, Japanese, Korean, Russian, or Arabic.
- `Apply on all websites`: master switch for the page overlay.
- `Preload dark color`: color used while the page is guarded.
- `Transition duration`: fade-out speed for page loads.
- `Delay before transition`: how long to hold the dark overlay before fading.
- `Tab switch transition`: optional fade when returning to an existing tab.
- `Brightness threshold`: only pages at or above this brightness get the overlay.
- `Replace bright CSS backgrounds`: persistently overrides bright solid background colors with a chosen dark color, including content added after page load.
- `CSS background threshold`: controls which CSS background colors are replaced.
- `Site Access`: use a blacklist to skip listed pages, or a whitelist to run only on listed pages.

## Local Testing

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on**.
3. Select [manifest.json](./manifest.json).
4. Click the extension toolbar button and confirm the options page opens.
5. Right-click the extension toolbar button and choose `Open options`.
6. Change the settings page language and confirm labels update immediately.
7. Open a bright page and confirm the dark overlay fades out cleanly.
8. Change the Site Access mode, save, reload the test page, and confirm whitelist or blacklist behavior.
9. Enable `Replace bright CSS backgrounds`, then confirm bright solid backgrounds (including dynamically added elements) use the selected replacement color.
10. Follow a same-site link from a bright page and confirm the page-load overlay is skipped.

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
