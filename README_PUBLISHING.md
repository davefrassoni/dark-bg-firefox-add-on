# Publishing Notes

## Extension Name

Dark Background Anti-Flash

## Version

Current version in `manifest.json`: `1.1.4`

## Packaging (ZIP for upload)

From the project root, create a zip containing these files/folders:

- `manifest.json`
- `background.js`
- `content/`
- `newtab/`
- `options/`

Do not include `.git` folders or unrelated local files.

## Quick Pre-Publish Checklist

1. Confirm extension name and description in `manifest.json`.
2. Confirm options page opens and settings save correctly.
3. Confirm no white flash on common websites.
4. Confirm bright-site override works with custom color and threshold.
5. Confirm excluded hostnames are skipped.
6. Bump `version` in `manifest.json` before each new release.
