# Publishing Guide

## Build the release packages

1. Update `version` in both `firefox/manifest.json` and
   `chrome/manifest.json`. The values must match.
2. Run:

   ```powershell
   .\package.ps1
   ```

3. Test `build/chrome` and `build/firefox` locally before uploading.

The Chrome upload is
`dist/dark-background-anti-flash-chrome-v<VERSION>.zip`. Its
`manifest.json` is at the ZIP root, as required by the store.

## Publish to the Chrome Web Store

These steps reflect the Chrome Web Store process in July 2026.

1. Enable 2-Step Verification on the Google account that will own the item.
2. Open the
   [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/),
   register as a developer, accept the agreement, and pay the one-time
   registration fee shown there.
3. In the dashboard Account page, set the publisher name and verify the contact
   email.
4. Click **Add new item**, choose the Chrome ZIP above, and upload it.
5. Complete **Store listing**:
   - Category: **Accessibility** is the closest fit.
   - Add an accurate detailed description.
   - Upload the 128x128 icon from `shared/icons/icon-128.png`.
   - Upload at least one screenshot at 1280x800 or 640x400. Show the real
     options page and/or the extension working; do not use misleading mockups.
   - Upload `store-assets/v1.2.1/promo-small-440x280.png` as the required
     440x280 small promotional image.
   - Upload `store-assets/v1.2.1/promo-marquee-1400x560.png` as the optional
     marquee image and `store-assets/v1.2.1/screenshot-options-1280x800.png`
     as the required screenshot.
6. Complete **Privacy practices** using the suggested text below. Confirm the
   declarations against the actual dashboard wording before submitting.
7. Complete **Distribution**. Use **Private** for trusted-tester validation,
   **Unlisted** for link-only access, or **Public** for a searchable listing.
   All three modes are reviewed against the same policies.
8. Add test instructions only if the reviewer needs something beyond opening a
   normal bright website and the options page.
9. Click **Submit for Review**. You can choose automatic publication after
   approval or deferred publishing. A deferred approved release must be
   published within 30 days or it returns to draft.

For later updates, increase both manifest versions, rebuild, use **Upload new
package**, and submit the update for review.

## Suggested Chrome privacy answers

Use wording like this, adjusting it if the extension behavior changes.

**Single purpose**

> Reduce sudden bright flashes during normal web browsing by placing a
> configurable temporary dark overlay over web pages and optionally replacing
> bright page backgrounds.

**`storage` permission**

> Stores the user's visual preferences and per-site allow/block list with the
> browser's synchronized extension storage so the settings persist.

**`contextMenus` permission**

> Adds an “Open options” command to the extension toolbar button's context
> menu.

**Host permission (`<all_urls>`)**

> The anti-flash overlay must run automatically at the beginning of navigation
> on ordinary websites. Access to all website origins lets the content script
> inspect rendered background colors locally and apply the selected visual
> effect. Page content and browsing activity are not transmitted.

**Remote code**

> No. All executable code is included in the extension package.

**Data use**

> The developer does not collect, sell, or receive user data. The extension
> processes the current page's URL and rendered background colors locally.
> User preferences, including any site rules the user enters, are stored
> through Chrome's extension sync-storage service and may be synchronized by
> the browser provider.

Host access is necessary for automatic `document_start` protection, but it
causes Chrome's broad website-access warning. Removing it would require a
different, click-to-activate product and would no longer prevent initial page
flashes.

## Privacy policy

Publish [PRIVACY.md](./PRIVACY.md) at a stable public HTTPS URL (for example,
the repository's public GitHub page) and enter that URL in the dashboard if a
privacy-policy URL is requested. The store declarations and policy must remain
consistent.

## Firefox

Live listing:
https://addons.mozilla.org/en-US/firefox/addon/dark-background-anti-flash/

Upload `dist/dark-background-anti-flash-firefox-v<VERSION>.zip` to AMO. Before
submitting, confirm the options page, site rules, page-load fade, tab-switch
fade, and bright-background replacement in Firefox.

## Official references

- https://developer.chrome.com/docs/webstore/register/
- https://developer.chrome.com/docs/webstore/set-up-account/
- https://developer.chrome.com/docs/webstore/prepare/
- https://developer.chrome.com/docs/webstore/publish/
- https://developer.chrome.com/docs/webstore/cws-dashboard-privacy/
- https://developer.chrome.com/docs/webstore/cws-dashboard-distribution/
- https://developer.chrome.com/docs/webstore/program-policies/two-step-verification/
