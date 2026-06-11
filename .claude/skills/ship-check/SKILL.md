---
name: ship-check
description: >
  Decide whether a HotPick change can ship to live users via EAS Update (OTA) or
  needs a new App Store / Play Store build + review. Use whenever the user asks
  "can I push this live / ship this", how to deploy or release a change, whether
  something needs Apple/Google review, what an OTA can and can't do, or asks to
  classify the current git diff / a branch's changes. Also separates app changes
  from server-side (Supabase Edge Function / migration) changes, which don't go
  through the app at all.
---

# ship-check — OTA vs store build for HotPick

HotPick is a **React Native app built with Expo SDK 55** and shipped with
**EAS Update** (over-the-air JS updates). A change reaches live users in one of
three ways. Your job: figure out which, and give the exact next step.

| Path | Reaches users via | Review? | Speed |
|---|---|---|---|
| **OTA** (`eas update`) | new JavaScript bundle downloaded on app open | none | minutes–hours |
| **Store build** (`eas build` → submit) | new native binary in App Store / Play | Apple + Google review | ~1–2 days |
| **Server deploy** | Supabase (Edge Functions / DB) — not the app at all | none | immediate |

Golden rule: **JavaScript & assets → OTA. Native shell → store build. Backend → server deploy.**

---

## Step 1 — See what actually changed
If the user refers to "my changes" / "what I've got" / a branch, inspect it (read-only):

```bash
git status --short                  # uncommitted
git diff --name-only                # unstaged
git diff --name-only --staged       # staged
git diff --name-only main...HEAD    # a branch vs main
```
Take the list of changed paths and classify **each** with Step 2. The final verdict
is the "heaviest" category that appears (Server-only < OTA < Build; a Build-class
file means the whole change needs a build).

---

## Step 2 — Classify each changed path

### ✅ A. OTA-eligible (ship with `eas update`, no review)
Pure JavaScript / TypeScript and the assets bundled with it:
- `src/**`, `App.tsx`, `index.js`, any `.ts` / `.tsx` / `.js`
- `assets/**` images & fonts that are imported in JS
- **`babel.config.js`, `metro.config.js`** — these are *JS bundler* config. They
  change how the bundle is built but ship *inside* the OTA bundle; no native rebuild.
  (We shipped the `metro.config.js` `unstable_enablePackageExports=false` fix via OTA.)
- `app.config.js` / `app.json` **`extra` / non-native** values that JS reads at runtime
- Supabase **keys/URLs** in JS (e.g. the publishable key in `src/shared/config/supabase.ts`)

### ❌ B. Needs a new store build + Apple/Google review
Anything that touches the compiled native shell:
- `ios/**`, `android/**` (Podfile, Gradle, Info.plist, AndroidManifest, entitlements, `.xcodeproj`)
- **`package.json` / `package-lock.json` dependency changes that add or upgrade a
  *native* module** (a library with its own `ios/`/`android/` code or an Expo
  *config plugin*). Pure-JS libraries are OTA-able; native ones are not. When unsure,
  check the package for native folders / a `plugin` entry → treat as native = build.
- **Expo SDK version** or **`react-native` version** bumps (and their peers, e.g. worklets)
- `app.json` / `app.config.js` **native** fields: app **icon**, **splash**, **name**,
  `bundleIdentifier` / `package`, **permissions**, `plugins`, `ios`/`android` blocks,
  `jsEngine`, `newArchEnabled`, associated domains / deep-link intent filters
- **`runtimeVersion`** changes (these *define* a new build generation — see Step 3)

### ⚠️ C. Mixed / dangerous — JS that depends on a native change
A JS change that calls a capability the **installed build doesn't have** (a new native
module, a new permission). The OTA JS would load on old builds and **crash**. This is a
**build**, not an OTA — ship the native build first (with a bumped runtimeVersion), then
JS rides along. Never OTA a feature whose native half isn't already in users' app.

### 🔧 D. Not an app change at all → server deploy
These never touch the app binary or an OTA:
- `supabase/functions/**` → `supabase functions deploy <name>`
  (the 12 cron functions need `--no-verify-jwt`; see CLAUDE.md / rotation runbook)
- `supabase/migrations/**` → applied to the database (`apply_migration` / CLI)
- `docs/**`, `.github/**`, tests, `.claude/**`, `devDependencies` (jest/eslint/CI-only) →
  **no user-facing ship at all** (CI/repo only)

---

## Step 3 — The `runtimeVersion` rule (the catch)
- Current builds are **`runtimeVersion 1.1.0`**. An OTA only reaches installs on the
  **same** runtimeVersion. So an OTA published at 1.1.0 reaches every 1.1.0 install. 👍
- A **native change forces a new build**, and per CLAUDE.md you **bump `runtimeVersion`
  in three places together**: `app.json`, `ios/HotPickSports/Supporting/Expo.plist`
  (`EXUpdatesRuntimeVersion`), `android/app/src/main/res/values/strings.xml`
  (`expo_runtime_version`). After that, OTAs you publish only reach the **new** build —
  users on the old build must update from the store.
- Therefore: JS-only fix → keep runtimeVersion, OTA to everyone. Native change → new
  runtimeVersion + store build, and the old version is frozen until users update.

---

## Step 4 — Give the verdict + the exact commands

**If OTA (category A only):**
```bash
# preview first — NEVER skip preview (CLAUDE.md)
eas update --branch preview    --message "<what changed>"
# verify on a preview build, then:
eas update --branch production --message "<what changed>"
```
JS-only; reaches runtimeVersion 1.1.0 installs. (Channels: development / preview / production.)

**If store build (category B, or C):**
```bash
eas build -p ios     --profile preview      # and/or -p android
eas build -p android --profile preview
# test on a real device, then promote to production and submit
```
Before building a native change: bump `runtimeVersion` (3 places above) and the
marketing version together. iOS release here is often an Xcode Archive (EAS submit has
been unreliable for this project — see CLAUDE.md).

**If server deploy (category D):**
```bash
supabase functions deploy <name>          # add --no-verify-jwt for the 12 cron fns
# migrations: apply via the tracked migration flow (apply_migration), not execute_sql
```

---

## HotPick-specific facts to apply
- Expo **SDK 55**, `react-native` **0.83.6** (SDK-pinned — never bump RN alone; use
  `npx expo install --fix`). `runtimeVersion` **1.1.0**. EAS channels: development/preview/production.
- **OTA is for JavaScript-only changes.** New behavior that needs native support = full build.
- **Never skip preview**; **never commit to `main` during a live season** (use a branch + preview build first).
- The **`metro.config.js`** `unstable_enablePackageExports = false` line must stay (SDK-55
  Hermes `require` bootstrap fix) — removing it reintroduces the launch redbox.
- `react-native` / native dep changes → realign with `npx expo install --fix`; never
  `npm audit fix --force`; restart Metro with `--clear` after any dep/native change.

## Apple / Google guardrail
OTA is allowed for bug fixes and improvements. Do **not** use OTA to change the app's
core purpose or add things that should have gone through review (e.g. gambling, a
different app). Normal features and fixes are fine — that's what OTA is for.

---

## Output the user wants (template)
> **Verdict:** ✅ OTA-only · ❌ Store build + review · ⚠️ Mixed (build) · 🔧 Server deploy
> **Why:** <which changed files put it in that bucket>
> **Ship it:** <the exact command(s) from Step 4>
> **Heads-up:** <runtimeVersion / preview-first / native-dependency caveats, if any>

Keep it short and decisive. If the diff is mixed, name the specific file that forces a
build so the user knows what to pull out if they want an OTA-only change.
