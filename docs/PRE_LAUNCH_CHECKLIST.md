# Pre-Launch Deploy Checklist — Sept 2 Launch (v1.1)

**Created:** 2026-06-02. **Target launch:** Sept 2 (NFL 2026, marketing version **1.1**).
**Purpose:** the loose ends surfaced during the pre-launch review, in one place. Boxes are things to verify/do *before* submitting to Apple/Google. Most are off-device (EAS / Supabase / store consoles) and only Tom can do them.

---

## 1. Edge Functions — make live match git

- [x] **`nfl-calculate-scores` + `nfl-update-scores` deployed** (2026-06-05) so live == git, including the new shared `_shared/scoring.ts` module (pure scoring logic now covered by `__tests__/scoring.test.ts`). Off-season deploy — no live scoring in flight. Versions: calc v18, update v10, both `verify_jwt: true`.
- [ ] **Deploy `compute-hardware`.** Git is one commit ahead of the deployed version (weekly award queries scoped to `competition` — commit `0adb08d`). Behavior-preserving in the current single competition, but deploy it so live matches git:
      ```
      supabase functions deploy compute-hardware --project-ref mzqtrpdiqhopjmxjccwy
      ```
- [ ] **One full `supabase functions deploy` pass** (or per-function) so all 22 functions live == repo. As of 2026-06 the repo holds all 22 (the 5 previously server-only ones were pulled in); `compute-hardware` is the only known remaining drift (the two scoring fns above are now reconciled).
- [ ] **Decide on `send-broadcast-email`** — in git but **not deployed**, and the app calls it (fire-and-forget) from `globalStore.broadcastToPool`. Today: in-app broadcasts work; the companion **email silently doesn't send**. To enable emails at launch:
  - [ ] deploy the function, **and**
  - [ ] set `RESEND_API_KEY` env var on Supabase, **and**
  - [ ] verify the `hotpicksports.com` sending domain in Resend, **and**
  - [ ] confirm `profiles.email` is populated.
  - …otherwise leave it off (graceful — no crash, just no broadcast emails).

## 2. Versioning (mostly done — verify)

- [x] `runtimeVersion` = `1.1.0` in all three (`app.json`, `Expo.plist`, `strings.xml`). **Re-verified 2026-06-05** — all three match, no OTA drift.
- [x] Marketing version = `1.1` (iOS `MARKETING_VERSION` ×2, Android `versionName`). **Re-verified 2026-06-05.**
- [ ] ⚠️ `eas.json` uses `"appVersionSource": "remote"` — confirm the **build shows version 1.1** (EAS may override local). If it doesn't stick, set it in EAS or flip to `"local"`. Build numbers auto-increment (don't hand-set). *(Build-time check — can't verify from repo.)*

## 3. EAS / build config

- [ ] **File-type env vars scoped to all 3 environments.** `google-services.json` / `GoogleService-Info.plist` are EAS file env vars (not in repo). Verify each is present for **production, preview, AND development** or Android builds fail with "google-services.json is missing":
      ```
      eas env:list --environment preview --format long
      ```
- [ ] **`submit.production` credentials** — `eas.json` `submit.production` is `{}`; supply App Store Connect app ID / Play service account when running `eas submit`.

## 4. Build → test → submit flow

- [ ] Cut a **`preview`** build off `main`; install on a real device.
- [ ] Device check the visible changes — **palette in light AND dark** (teal text accents, `#A5CCD9`, teal "GAMES" tags, white text on active week chip), **cold launch** (force-quit → hero **skeleton** → correct phase hero, no Week 1 flash), **Picks week pills** + tap-a-trend-pill → right week, **Settings → Awards & Records** opens with back button.
- [ ] Testers via **TestFlight** (iOS) + **closed/internal testing track** (Google).
- [ ] Fix tester findings on a **feature branch** (not main), merge, rebuild.
- [ ] Cut the **`production`** build; **submit to both stores EARLY** (Apple review can take days + possible resubmit) — aim a couple weeks before Sept 2.
- [ ] Schedule store **release for Sept 2**; keep the `scoring_locked` emergency brake handy on launch day.

## 5. Data / safety

- [ ] **Manual Supabase backup** before any schema migration during launch prep (Project Settings → Database → Backups).
- [x] Confirm `nfl_2026` season setup present in `competition_config`. **Verified 2026-06-05:** `scoring_locked` (emergency brake) ✓, `current_phase`, `current_week`, `week_state`, `playoff_start_week`, `season_opener_date`, `preseason_start_date`, `season_picks_open_at`, `is_active`, `season_year` all present. *(Schedule rows in `season_games` not re-checked here.)* Minor hygiene: `is_active` / `scoring_locked` rows lack a `description` (non-blocking).
- [ ] Cron health (verified 2026-06: all jobs attach auth, returning 200; ~2% transient DNS timeouts, self-healing). **Optional:** bump `timeout_milliseconds` on heavy jobs (`nfl-calculate-scores`, `compute-hardware`) from the 5s default to ~30s for cleaner launch-week monitoring.

## 6. Monitoring — activate Sentry (before launch)

Crash/error reporting is **scaffolded but inert** (PR #207, `src/shared/monitoring/sentry.ts`). It no-ops until **both** a DSN is configured **and** a fresh native build ships. Turn it on before Season 2 so live crashes are actually visible. One-time native setup: `docs/SENTRY.md`.

- [ ] **Create a Sentry project** (react-native platform) and copy its **DSN** (a public ingest key — safe to expose, but we keep it out of git so it can rotate without a code change).
- [ ] **Supply the DSN** via the EAS env var **`EXPO_PUBLIC_SENTRY_DSN`** (preferred), scoped to **production + preview** — leave dev unset (Sentry is disabled in `__DEV__` anyway). `app.json` `extra.sentryDsn` is the fallback.
- [ ] **Native rebuild required.** `@sentry/react-native` is a native module — the DSN alone does nothing without a fresh `eas build` (`cd ios && pod install` for iOS). OTA won't activate it.
- [ ] **Verify events flow** in a release/TestFlight build: trigger a test error and confirm it lands in the dashboard (check `release` = `hotpicksports@<version>` and the right `environment`).
- [ ] *(Optional, robustness)* Harden `sentry.ts` to a **guarded `require()`** so a missing/stale `@sentry/react-native` install degrades to a no-op instead of red-screening Metro — the current static `import` bit us once during a stale `npm install`.

---

## Deferred — NOT launch blockers (post-launch / Nov 2026)

- **Super Bowl enhanced scoring + playoff/SB champion + tie-breaker ladder** — Nov 2026 (`docs/SUPER_BOWL_SCORING_SPEC.md`).
- **Regular-season results archive** — no persistent per-contest final-standings view after the playoff reset (spec §9). Champion *award* exists (`compute-hardware`); standings *archive* doesn't.
- **Efficiency redesign (scale)** — make `compute-hardware` event-driven (fire on week settle, not every 30 min); window game-day crons; etc. Only matters at volume.
- **History tab** — `HistoryScreen` is reachable from Settings ("Awards & Records"); the bottom-nav History *tab* stays shelved ("not ready for launch").
- **Weekly Engine — Version B shadow run** — Parked for **September**. A `nfl_2026_sim` competition running the *real* production pipeline on `open_picks_mode = auto`, as a parallel shadow of the live (manual-open) season, to prove auto-open before it's ever trusted on production. Explicitly out of scope for the Weekly Engine build (`260605_HotPick_WeeklyEngine_Spec` v1.0, §1). Production (`nfl_2026`) stays **manual-open** for Season 2 regardless.
