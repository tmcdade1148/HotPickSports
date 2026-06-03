# hotpick.app — Universal Links + invite landing

These files turn `https://hotpick.app/join/CODE` into a real invite link that
opens the app when installed and falls back to a web page (with App/Play Store
buttons) when it isn't. Host the contents of this folder at the root of the
`hotpick.app` domain.

## What's here

```
.well-known/apple-app-site-association   # iOS Universal Links (no file extension!)
.well-known/assetlinks.json              # Android App Links
join/index.html                          # fallback landing page for /join/CODE
```

## Hosting requirements (must all be true or the OS won't verify the links)

1. **HTTPS only**, valid certificate, served from the apex `hotpick.app`
   (match the entitlement `applinks:hotpick.app` and the Android `host`).
2. **`/.well-known/apple-app-site-association`**
   - Served with `Content-Type: application/json`.
   - **No file extension**, **no redirect** (200 directly, not a 30x).
3. **`/.well-known/assetlinks.json`**
   - Served with `Content-Type: application/json`.
4. **Route `/join/*` to `join/index.html`** (path-style invite codes).
   Static hosts need a rewrite, e.g. Netlify `_redirects`:
   ```
   /join/*  /join/index.html  200
   ```
   or Vercel/Cloudflare equivalent.

## Identifiers (all filled in)

| What | Value |
|------|-------|
| Apple appID (AASA) | `W88A7N6XW5.com.hotpicksports` |
| Android package (assetlinks) | `com.hotpicksports` |
| Android Play app signing SHA-256 (assetlinks) | filled — from Play Console App signing key certificate |
| Apple App Store ID (landing page) | `6761190235` |

If the Android **app signing key** ever changes, or you want to also accept the
upload key, add the new SHA-256 to the `sha256_cert_fingerprints` array in
`.well-known/assetlinks.json` (it accepts multiple).

## App / native config (already done in the repo)

- iOS: `applinks:hotpick.app` added to `ios/HotPickSports/HotPickSports.entitlements`.
- Android: `autoVerify` https intent-filter for `hotpick.app` in `AndroidManifest.xml`.
- App routing: `RootNavigator` already parses `https://hotpick.app/join/CODE`.
- Share sheets: `RecruiterBand` + Pool Settings now share the https link.

## Remaining external steps (not codeable here)

1. **Stand up `hotpick.app` hosting** and deploy this folder.
2. **Apple Developer portal:** enable the *Associated Domains* capability on the
   `com.hotpicksports` App ID, then regenerate the provisioning profile (EAS
   managed credentials usually handle this on the next build — verify it picked
   up the entitlement).
3. **Fill the placeholders** above.
4. **Verify** after deploy:
   - iOS: `https://app-site-association.cdn-apple.com/a/v1/hotpick.app` (Apple's
     validator) and tap a `https://hotpick.app/join/TEST` link from Notes on a
     real device.
   - Android: `adb shell pm verify-app-links --re-verify com.hotpicksports` then
     `adb shell pm get-app-links com.hotpicksports` (look for `verified`).
5. **Test on a physical device** — Universal/App Links are unreliable on
   simulators; the custom scheme (`hotpick://join?code=CODE`) is what you can
   exercise in the simulator via `xcrun simctl openurl` / `adb ... VIEW`.
