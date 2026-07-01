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
- [ ] **Odds API — verify end-to-end in PRE_SEASON (Aug 6).** Off-season this can't be tested: `nfl-fetch-odds` returns `no_active_week` before ever calling The Odds API, and the NFL has no games to price until preseason. When a preseason week is active: (1) confirm `ODDS_API_KEY` is set (Dashboard → Edge Functions → Secrets); (2) let the Tuesday `nfl-fetch-odds` cron run (or trigger it with the `x-cron-secret` header); (3) check `week_readiness` for that week shows `odds_status = 'ok'` and `odds_count = odds_expected` with no `odds_error`.
- [x] **Odds success is already a hard gate before picks open.** `open_week_picks` → `_assert_week_ready` → `_week_readiness_is_ready` requires `odds_status = 'ok'` **and** `odds_count = odds_expected` (every game priced), plus games + ranks complete — otherwise it raises `NOT_READY` and refuses to open the week. Hardened **2026-06-11** (migration `20260611160000`) with a freshness/ordering guard (`odds_at >= games_at`, `ranks_at >= odds_at`) so a stale readiness row can't satisfy the gate even if counts coincidentally match.

## 6. Monitoring — No Silent Failures (Sentry removed)

Sentry was **removed entirely** (`@sentry/react-native` caused a native-module
startup crash and an Xcode-26 iOS pod build break). Crash/error visibility now
comes from three Sentry-free pieces (spec: `260629_HotPick_NoSilentFailures_Spec`):

- [x] **Top-level `AppErrorBoundary`** contains a render crash with a visible,
  recoverable fallback instead of white-screening the session (register 1.1).
- [x] **Standalone `logError()`** writes to the `client_error_log` table — a plain
  Supabase insert, no Sentry/DSN/native dependency. Throttled + dedup'd; no PII.
- [x] **"Surface-don't-swallow"** — data-fetch errors raise a visible error state
  AND a `logError` row, never a silent empty list (the #360 Ladder fix is the
  worked example).
- [ ] **Apply the `client_error_log` migration** (`20260630120000_client_error_log.sql`)
  after a manual Supabase backup. Verify a forced error writes a row and
  super-admin read works.
- [ ] **Turn on the free native consoles** (Tom): Play Console → Android vitals
  and Xcode → Organizer. They catch native crashes the JS logger can't.

## 7. Auth — email confirmation on signup

**Context (2026-06-15):** A fresh email/password signup hit *"Could not accept terms"* on the
age/TOS gate. Root cause: the Supabase project has **"Confirm email" ON**, so
`supabase.auth.signUp()` returns a `user` but a **null session** until the email link is
clicked. `EmailEntryScreen` only checks `if (data.user)` and walks the unauthenticated user
straight into `runPostAuthFlow` → `ensureGlobalPoolMembership()` + `acceptTos()`, both of
which call `authenticated`-only RPCs. As `anon` those fail (`permission denied for function
rpc_accept_tos` / `auto_enroll_global_pools`). Same cause surfaces as *"Email not confirmed"*
on sign-in and *"email rate limit exceeded"* on repeated signups (Supabase built-in SMTP cap).

**Interim fix shipped (#1):** "Confirm email" turned OFF in the dashboard so signup returns an
immediate session and the app flows through onboarding as-is. No verified emails at signup.

- [ ] **(#2 — proper fix before public launch) Re-enable "Confirm email" and handle the
      no-session case in-app.** After `supabase.auth.signUp()`, if `data.session` is null, do
      **not** call `runPostAuthFlow`; instead route to a new **"Check your email to confirm"**
      screen and handle the confirmation deep link (`hotpick://...`) to resume onboarding once
      the session exists. Guards `EmailEntryScreen.tsx`.
- [ ] **Custom SMTP before relying on confirmation emails.** Supabase's built-in email sender
      is rate-limited (the "email rate limit exceeded" 429). Configure a real provider (Resend
      — domain already needed for `send-broadcast-email`, see §1) so confirmation + password-reset
      emails actually deliver at volume.
- [ ] **Defensive UX regardless of toggle:** surface a clear message on a null-session signup
      instead of the misleading *"Could not accept terms."*

---

## Deferred — NOT launch blockers (post-launch / Nov 2026)

- **Super Bowl enhanced scoring + playoff/SB champion + tie-breaker ladder** — Nov 2026 (`docs/SUPER_BOWL_SCORING_SPEC.md`).
- **Regular-season results archive** — no persistent per-contest final-standings view after the playoff reset (spec §9). Champion *award* exists (`compute-hardware`); standings *archive* doesn't.
- **Efficiency redesign (scale)** — make `compute-hardware` event-driven (fire on week settle, not every 30 min); window game-day crons; etc. Only matters at volume.
- **History tab** — `HistoryScreen` is reachable from Settings ("Awards & Records"); the bottom-nav History *tab* stays shelved ("not ready for launch").
- **Weekly Engine — Version B shadow run** — Parked for **September**. A `nfl_2026_sim` competition running the *real* production pipeline on `open_picks_mode = auto`, as a parallel shadow of the live (manual-open) season, to prove auto-open before it's ever trusted on production. Explicitly out of scope for the Weekly Engine build (`260605_HotPick_WeeklyEngine_Spec` v1.0, §1). Production (`nfl_2026`) stays **manual-open** for Season 2 regardless.
