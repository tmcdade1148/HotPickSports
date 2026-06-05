# Sentry — Crash & Error Monitoring

This app reports unhandled JS errors, native crashes, and (optionally) handled
errors to [Sentry](https://sentry.io). The **JavaScript scaffold is already
wired**; turning it on requires two one-time actions: a **DSN** and a **native
rebuild**. Until both are done, the app runs exactly as before — every entry
point no-ops safely when monitoring isn't active.

## Architecture

All monitoring goes through one module: [`src/shared/monitoring/sentry.ts`](../src/shared/monitoring/sentry.ts).

| Function | Where it's called | Purpose |
|---|---|---|
| `initMonitoring()` | `index.js`, before `AppRegistry` | Initialise the SDK. No-ops without a DSN; never throws if the native module isn't linked. |
| `wrapWithMonitoring(App)` | `App.tsx` default export | Captures render-tree errors. Returns `App` unchanged when inactive. |
| `setMonitoringUser(id)` | `globalStore` `setUser` / `signOut` | Tags events with the auth user id only — **no PII** (no email/name). |
| `captureError(err, ctx)` | anywhere a handled error is worth recording | Best-effort manual report. Logs to console in dev. |

Design guarantees:

- **No DSN → disabled.** Dev builds and any build without the env var run with
  monitoring off and zero behavioural change.
- **Native module not linked → safe.** `init` is wrapped in try/catch, so the
  app keeps running even if the JS lands before the native rebuild.
- **Privacy.** `sendDefaultPii: false`; only a hashed-free auth `user.id` is
  attached, explicitly, and cleared on logout.

## One-time setup

### 1. Create the project + get the DSN

1. Create a project at https://sentry.io (platform: **React Native**).
2. Copy the **DSN** (looks like `https://abc123@o0.ingest.sentry.io/123`).

### 2. Provide the DSN to builds (preferred: EAS env var)

The DSN is resolved at runtime in this order:

1. `process.env.EXPO_PUBLIC_SENTRY_DSN` — **preferred**
2. `Constants.expoConfig.extra.sentryDsn` — fallback (in `app.json`)

Set it as an EAS env var scoped to **all three environments** (matching the
`google-services.json` rule in CLAUDE.md — narrowing to one silently breaks the
others):

```bash
eas env:create --name EXPO_PUBLIC_SENTRY_DSN --value "https://...@oXXX.ingest.sentry.io/XXX" \
  --environment production --environment preview --environment development --visibility plaintext
```

A Sentry DSN is a public ingest key, but we keep it out of git so it can rotate
without a code change.

### 3. Native rebuild (bare workflow)

This is a **bare** React Native app (real `android/` + `ios/` dirs), so Sentry
needs native linking + source-map upload wiring. The JS SDK alone will not
capture native crashes or symbolicate stack traces until this ships.

- **iOS:** `cd ios && pod install`, then add the Sentry build phase (or run
  `npx @sentry/wizard@latest -i reactNative` once and review the diff).
- **Android:** the `@sentry/react-native` Gradle plugin is autolinked; confirm
  `apply from: ...sentry.gradle` is present after a clean build.
- For **source maps**, add a `sentry.properties` (auth token, org, project) —
  keep the auth token in EAS secrets / CI env, **never** in git.

Then build through the normal profile order: `development → preview → production`
(never skip preview — CLAUDE.md deployment rules).

## Verifying

After a build with the DSN set, trigger a test error and confirm it appears in
the Sentry dashboard. `isMonitoringActive()` returns `true` only when a DSN was
found **and** init succeeded against a linked native module.

## Notes

- **OTA limitation:** wiring the SDK in is a native change — it requires a full
  build + store submission, **not** an EAS Update. (CLAUDE.md: OTA is
  JS-only.)
- `tracesSampleRate` is `0.1` (light performance sampling). Raise it later if we
  want more traces; it has a cost/quota impact.
- Events are disabled in dev (`enabled: !__DEV__`) so local crashes aren't
  signal.
