# Universal Links & Deep Linking

> Extracted from `REFERENCE.md` §23. Full deploy/host details live in
> `web/hotpick.app/README.md`.

Contest invites use **https universal links** (iOS) / **App Links** (Android) so a
shared link linkifies in Messages/WhatsApp and opens the app directly when
installed — falling back to a web landing page (with store buttons) when it isn't.
The legacy custom scheme (`hotpick://`) still works for in-app/auth flows but is
**not** used for sharing (it doesn't linkify and only works if the app is already
installed).

### Canonical link format
```
https://hotpick.app/join/CODE      ← share this (universal link, path-style)
hotpick://join?code=CODE           ← legacy custom scheme (auth/reset, internal)
```
`RootNavigator.tsx` parses both: the path-style regex `/join/([A-Za-z0-9]+)` sets
`pendingInviteCode` in `globalStore`. Share surfaces (`RecruiterBand`, Pool
Settings) emit the https form only.

### The domain (hotpick.app)
Hosted on **Netlify** (site `hotpick-app`), DNS at **DirectNIC** — single apex
`A` record → `75.2.60.5`, plus `www` CNAME → `hotpick-app.netlify.app`. Let's
Encrypt TLS auto-provisioned. The site is **not** the app repo's deploy target for
code — it only serves three things from `web/hotpick.app/` (published via the
repo-root `netlify.toml`):

| Path | Purpose |
|------|---------|
| `/.well-known/apple-app-site-association` | iOS verification (served `application/json`, no extension, no redirect) |
| `/.well-known/assetlinks.json` | Android verification (served `application/json`) |
| `/join/*` → `join/index.html` | fallback landing page (rewrite, not redirect) |

`netlify.toml` enforces the JSON content-types and the `/join/*` rewrite — both
are required or the OS silently refuses to verify.

### Identifiers (already wired in)
- iOS appID (AASA): `W88A7N6XW5.com.hotpicksports` (Team ID + bundle ID)
- Android package (assetlinks): `com.hotpicksports`
- Android assetlinks SHA-256: the **Play app signing key** cert fingerprint
  (Play Console → App integrity → App signing). Accepts multiple entries if the
  signing key rotates or you also want the upload key.
- App Store ID (landing page): `6761190235`

### Native config
- **iOS:** `com.apple.developer.associated-domains` → `applinks:hotpick.app` in
  `ios/HotPickSports/HotPickSports.entitlements`. The entitlements file is
  referenced by both build configs (`CODE_SIGN_ENTITLEMENTS`) and signing is
  **Automatic**, so an EAS build *or* an Xcode archive auto-enables the Associated
  Domains capability on the App ID and regenerates the profile — no manual portal
  step (manual signing would require enabling it on the App ID by hand first).
- **Android:** `autoVerify="true"` https intent-filter for host `hotpick.app` in
  `AndroidManifest.xml`. Verifies against the hosted `assetlinks.json` on install.

### Go-live / rebuild steps (a native change → full build, never OTA)
1. `git pull` (entitlement + manifest changes live on `main`).
2. iOS + Android builds — `eas build -p ios --profile preview` /
   `-p android --profile preview` (or Xcode archive for iOS). Accept any
   credential/profile update prompt.
3. Install on a **real device** (universal links don't work in simulators).
4. Test: tap `https://hotpick.app/join/TEST123` from **Notes/Messages** (not the
   browser URL bar) → app opens to the join flow.
5. Promote to `production` and submit through the normal release flow.

### Verification helpers
- iOS archive entitlement check: `codesign -d --entitlements :- HotPickSports.app`
  → expect `applinks:hotpick.app`.
- Apple ingestion: `https://app-site-association.cdn-apple.com/a/v1/hotpick.app`.
- Android: `adb shell pm get-app-links com.hotpicksports` → expect
  `hotpick.app: verified`.
- iOS caches the AASA at install — if a link won't open the app, delete + reinstall.
