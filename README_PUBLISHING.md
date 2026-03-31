# Publishing Notes

## Extension Name

Dark Background Anti-Flash

## Version

Current version in `manifest.json`: `1.1.7`

## Packaging (ZIP for upload)

From the project root, run:

```powershell
.\package.ps1
```

This creates versioned archives in `dist/` with normalized `/` zip entry paths for Firefox/AMO validation.

## Quick Pre-Publish Checklist

1. Confirm extension name and description in `manifest.json`.
2. Confirm options page opens and settings save correctly.
3. Confirm no white flash on common websites.
4. Confirm overlay applies only on bright pages and fades smoothly.
5. Confirm excluded hostnames are skipped.
6. Bump `version` in `manifest.json` before each new release.
