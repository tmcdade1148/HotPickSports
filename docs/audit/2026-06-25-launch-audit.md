> **ARCHIVED — original launch-readiness audit report (2026-06-25), the read-only findings pass. Superseded by the living register at `docs/LAUNCH_READINESS.md`, which is now the single source of truth. Kept for provenance; not maintained.**

# HotPick Sports — Launch-Readiness Audit (NFL Season 2)

**Generated:** 2026-06-25 · **Branch:** `claude/zen-tesla-upp18m`
**Supabase project:** `mzqtrpdiqhopjmxjccwy` (PostgreSQL 17.6.1 — **read-only** inspection)
**Method:** Four parallel read-only sub-agents (scoring & data integrity, client reliability,
security & auth, tech debt) audited the repo, the **live deployed Edge Functions**
(`get_edge_function`), **live Postgres bodies** (`pg_get_functiondef`), and **live data**
(read-only `SELECT`). The two Tier-0 findings and the `notification_preferences` root cause
were then **independently re-verified live** by the lead before being written here.

> **Nothing was modified.** No writes, no migrations, no commits. Findings only — every
> "Suggested fix" is described, not applied.

**Severity tiers (as defined for this audit):**
- **Tier 0** — can corrupt a score or stall a live week.
- **Tier 1** — crash, won't-open, or data loss.
- **Tier 2** — tech debt.

**Owner legend:** **Tom** = needs Tom's sign-off and/or a live-prod migration (manual backup +
approval per the deployment rules). **Code** = a clear-cut repo/app change for the normal
eng flow (PR → preview → ship/OTA). **Claude** = a well-scoped follow-up Claude can execute on request.

---

## TL;DR

### 🚫 Items that block launch (fix before the `nfl_2026` season opens)

1. ✅ **[T0-1] RESOLVED 2026-06-25 — No `nfl_2026` pick could be saved.** The pick-lock trigger compared game
   status to lowercase `'scheduled'`, but the live importer wrote all **318** `nfl_2026` games as uppercase
   `'SCHEDULED'`, so every pick insert/update was rejected with "Picks are locked." **Fixed** by making the trigger
   comparison case-insensitive (`lower(status) <> 'scheduled'`) — applied live (after a manual backup) as migration
   `20260625162854_fix_enforce_pick_lock_status_case` and verified (uppercase `SCHEDULED` now allows picks;
   `IN_PROGRESS`/`FINAL` still lock; no data rows changed). See T0-1 below.

**No open launch blockers remain.** (T0-2 is Tier 0 by severity but dormant until the playoffs — see "can wait".)

### ⏳ Items that can wait (do NOT block the September launch — but track them)

- **[T0-2] Playoff rank double-count.** Severe (Tier 0) but **dormant until the playoffs (week ≥ 19, ≈ Jan 2027)** —
  the Home-screen pool-rank chip shows roughly double the real points during the postseason and disagrees
  with the Ladder. No score is corrupted; it's a display/trust bug that only appears months after launch.
  Fix before the playoffs, not before kickoff.
- **[T1-x] Client reliability:** no error boundary (one screen throw white-screens the whole app),
  the Ladder renders every member with no virtualization (stall/OOM risk on big pools), and
  `notification_preferences` toggles silently don't persist. All real, none are launch-day blockers — fix in the first OTA cycle.
- **All Tier 2:** scoring/repo drift, one sandbox-only RPC missing a role check, two enumerable
  storage buckets, large-file refactors, the loose `PURGE_PRESEASON_PICKS.sql`, three dead simulator HTMLs.

### ✅ Reassuring results (prior fears that are NOT real holes)

- **Security finding #14 from the prior review is REMEDIATED** (verified live). Migration
  `20260608153000_revoke_anon_execute_and_pin_search_path.sql` revoked `anon` from every destructive
  RPC; all of them now self-authorize by `super_admin`/pool-role; `admin_purge_user` was dropped entirely.
  **No Tier 0 and no Tier 1 security holes.**
- **Scoring idempotency, `frozen_rank` immutability, and the `power_up` hole are all confirmed SAFE**
  against live code + data (see Appendix A).

---

## Tier 0 — can corrupt a score or stall a live week

### T0-1 · `enforce_pick_lock` rejects every pick on the live `nfl_2026` season (status case mismatch)
**Owner: Tom** (applied by Claude) · **Status: ✅ RESOLVED 2026-06-25**

> **✅ Resolution (2026-06-25):** Fixed by making the status comparison case-insensitive
> (`lower(game_record.status) <> 'scheduled'`), preserving the per-game `lock_at` check and the exact RAISE messages.
> A manual Supabase backup was taken first; applied to the live DB via `apply_migration` as
> **`20260625162854_fix_enforce_pick_lock_status_case`** (committed under `supabase/migrations/`). Verified live: the
> function body now uses `lower(...)`, trigger `check_pick_lock` is still enabled, and a non-mutating logic check
> confirms uppercase `SCHEDULED` is allowed while `IN_PROGRESS`/`FINAL` still lock. No data rows were modified.

- **Location:**
  - Live Postgres fn `public.enforce_pick_lock()` (trigger `check_pick_lock` on `season_picks`, **verified enabled**,
    `BEFORE INSERT OR UPDATE OF picked_team, is_hotpick`): `IF game_record.status != 'scheduled' THEN RAISE EXCEPTION 'Picks are locked for this game (status: %)'`.
  - Producer: `supabase/functions/nfl-import-schedule/index.ts` writes `status = "SCHEDULED"` (uppercase) for imported games.
- **Risk (plain language):** The code that decides whether picks are still open checks for the lowercase word
  `scheduled`, but the real-season schedule importer saved every game as uppercase `SCHEDULED`. Because
  `'SCHEDULED'` is not equal to `'scheduled'`, the system thinks **every** game is already locked, so it refuses
  to save any pick. On launch day, no real user could submit a single pick for `nfl_2026` — the product is dead on
  arrival until this is fixed. It slipped through testing because the practice/simulator competitions store the
  status in lowercase, which the check happens to accept.
- **Evidence (verified live by the lead):** `enforce_pick_lock` body confirmed via `pg_get_functiondef`;
  `SELECT competition, status, count(*) FROM season_games GROUP BY 1,2` returns **318 `nfl_2026` rows all `SCHEDULED`**
  (uppercase), vs lowercase `scheduled` for the sims; `season_picks` has **zero `nfl_2026` rows**; trigger `check_pick_lock`
  confirmed enabled (`tgenabled = 'O'`). *(Note: `nfl_2025_simA`/`simG` also carry 13 uppercase rows each — same defect, partially unpickable.)*
- **Suggested fix (do NOT apply):** Make the comparison case-insensitive — `IF lower(game_record.status) <> 'scheduled'`.
  The rest of the pipeline already tolerates either case (`nfl-update-scores` / `finalize_week_for_all_users` use
  `ILIKE '%FINAL%'`); only this trigger is exact-match. Then pick **one** canonical casing for `season_games.status`
  across the importer, `sim-operator`, and the scorer so this class of bug can't recur. Requires `apply_migration` +
  a manual Supabase backup first (per the deployment rules).

### T0-2 · Home-screen pool rank double-counts playoff points (postseason only)
**Owner: Tom** (live-prod RPC migration) · **Status: OPEN — fix before the playoffs (≈ Jan 2027); NOT a Sept-launch blocker**

- **Location:**
  - Live RPC `public.get_user_ranks_in_pools`: `COALESCE(SUM(t.week_points + COALESCE(t.playoff_points, 0)), 0)::int AS total_points` (no phase/week-cap filter).
  - Writers set `playoff_points = week_points` for weeks 19–22 (`upsert_season_week_scores`: `CASE WHEN p_week >= 19 THEN week_points ELSE 0 END`; `finalize_week_for_all_users`).
  - Call sites: `src/shell/stores/slices/poolIndicatorsSlice.ts:184` → rendered at `src/shell/components/home/PoolModule.tsx:184`
    (also `src/shell/components/home/RecruiterBand.tsx:48`, `src/shell/screens/SettingsScreen.tsx:391`).
  - Correct path for contrast: the Board/Ladder uses `src/templates/season/stores/seasonStore.ts:526` (phase-scoped, sums `week_points` only) — so it does **not** double-count.
- **Risk (plain language):** During the playoffs the scorer stores the same number in two columns (`week_points` and
  `playoff_points`). This rank query adds those two columns together, so it counts every playoff point **twice** — and
  because it has no phase filter, during the postseason it shows roughly `regular-season total + 2× playoff total`. The
  number on the Home-screen "you're #N of M" chip will be wrong, and it will **disagree with the actual leaderboard**
  the user sees on the Board tab. Two screens showing the same player two different ranks is exactly the kind of thing
  that destroys trust in a scoring product. It is invisible during the regular season and only switches on at the Wild
  Card round (week 19).
- **Evidence (verified live by the lead):** RPC body confirmed via `pg_get_functiondef`; live data shows weeks 19/20/21
  have **every** row with `playoff_points = week_points` (17/17, 18/18, 21/21 nonzero); week 22 (Super Bowl) diverges due
  to enhanced scoring but still double-counts the HotPick portion.
- **Suggested fix (do NOT apply):** This RPC is a *cumulative-season* rank, so sum a single source of truth —
  `SUM(t.week_points)` (since `week_points` already holds the playoff value for weeks ≥ 19) — **or**, if the chip is meant
  to be phase-scoped like the Ladder, add the same week/phase filter the Ladder uses. Do **not** "fix" it by zeroing
  `week_points` for playoff weeks; the Ladder depends on `week_points` carrying the playoff value.

---

## Tier 1 — crash, won't-open, or data loss

### T1-1 · No `ErrorBoundary` anywhere — any render throw white-screens the entire app
**Owner: Code** · **Status: OPEN — fix in first OTA cycle**

- **Location:** `App.tsx:7-20`, `src/shell/navigation/RootNavigator.tsx:174-249` (no boundary around `NavigationContainer`
  or any screen). Sentry wrapper `src/shared/monitoring/sentry.ts:108-117` only *reports*, renders no fallback, and is a
  no-op unless a DSN is configured and a fresh native build shipped. Confirmed: zero `componentDidCatch` /
  `getDerivedStateFromError` in `src/`.
- **Risk (plain language):** If a single screen hits an unexpected error while drawing — a malformed pool brand config,
  an unexpected-null leaderboard row, a bad deep-link — React tears down the whole app and the user is left staring at a
  blank white screen with no way out except force-quitting. There is no safety net and no per-screen isolation.
- **Suggested fix (do NOT apply):** Add a class `ErrorBoundary` (with `getDerivedStateFromError` + `componentDidCatch`
  that calls `captureError`) wrapping the `Stack.Navigator` in `RootNavigator`, rendering a "Something went wrong / Reload"
  fallback; ideally also wrap high-churn screens (Home, SeasonBoard, SmackTalk) individually. Do not rely on `Sentry.wrap`
  for the fallback UI.

### T1-2 · The Ladder renders every member eagerly in a `ScrollView` (no virtualization)
**Owner: Code** · **Status: OPEN — fix before any large pool goes live**

- **Location:** `src/templates/season/screens/SeasonBoardScreen.tsx:398` (`leaderboard.map(...)`) and `:413`
  (`weekLeaderboard.map(...)`), inside a vertical `ScrollView` (`:346`) wrapping a horizontal pager (`:377`). Fed by
  `seasonStore.fetchLeaderboard` (`src/templates/season/stores/seasonStore.ts:441`, member query `:481-486`) which pulls
  **every active member with no `.limit()`**.
- **Risk (plain language):** The Board tab builds a row for every member of a pool at once, with no windowing. Small
  Contests are fine, but the platform auto-enrolls everyone into a global pool and big Club Contests can have hundreds to
  thousands of members. Opening the Board for a large pool renders thousands of views at once: the tab hangs for seconds,
  memory spikes, and on a low-end Android phone it can crash the app outright.
- **Suggested fix (do NOT apply):** Replace the two `.map()` panels with `FlatList` (stable `keyExtractor` on `user_id`)
  so rows virtualize, and/or page the results in `fetchLeaderboard`/`fetchWeekLeaderboard` (`.range()` or a "top N + your
  row" pattern). Keep the horizontal pager, but make each page's body a `FlatList`.

### T1-3 · `notification_preferences` toggles silently never persist (resets on relogin)
**Owner: Code** · **Status: OPEN — root cause REFINED below; needs a device repro to pin the exact trigger, but the recommended fix is robust regardless**

- **Location:** `src/shell/screens/NotificationPreferencesScreen.tsx:120-133` (the `togglePref` write), seeding at `:101-103`,
  `src/shell/services/pushNotifications.ts:214-218`.
- **Risk (plain language):** When a user turns a notification type off, it appears to work, but the setting isn't actually
  saved — on next login every toggle is back to its default. Users can't durably opt out of (or into) push notifications,
  which is both an annoyance and an app-store/notification-consent liability.
- **Root cause (corrected after live verification — supersedes the sub-agent's first take):** The write is an
  `.upsert(..., {onConflict:'user_id'}).select().single()`. The sub-agent theorized the **INSERT arm is rejected because
  rows are trigger-only and there is no client INSERT policy** — **live inspection disproves that.** `notification_preferences`
  has RLS enabled and exactly **one** policy: `ALL` to `public`, `USING (auth.uid() = user_id)` **and**
  `WITH CHECK (auth.uid() = user_id)`. So a client write of the user's *own* row is permitted; the upsert **succeeds iff the
  submitted `user_id` equals the caller's `auth.uid()`**, and fails (→ the `.select().single()` throws → `togglePref`'s revert
  branch runs → nothing is written) **only when `user_id` is null or stale at write time.** That points back at the
  originally-suspected **null/stale `userId`** cause — i.e. the write fires with a `user_id` that doesn't match the live
  session (e.g. a not-yet-/just-rehydrated session around relogin), not an RLS-architecture gap.
- **Evidence (verified live by the lead):** `pg_policies` shows the single `ALL`/`WITH CHECK (auth.uid()=user_id)` policy;
  `pg_class.relrowsecurity = true`; no reset trigger on the table.
- **Suggested fix (do NOT apply):** Move the write into a `SECURITY DEFINER` RPC — e.g.
  `set_notification_preference(p_type, p_value)` — that derives `auth.uid()` **server-side** and runs
  `UPDATE notification_preferences SET <col> = p_value WHERE user_id = auth.uid()`. This is immune to whatever client-side
  `userId` staleness causes the mismatch and stops trusting a client-supplied id. (A plain client `.update().eq('user_id', userId)`
  would *not* fix it if `userId` is the problem — it would update zero rows and still throw.) Add device logging of `userId` +
  the thrown error at toggle time to confirm the exact trigger condition.

---

## Tier 2 — tech debt

### Scoring / data integrity

#### T2-S1 · Live deployed scorer diverges from the repo on tie handling
**Owner: Code** (redeploy from repo) · **Status: OPEN — low impact**
- **Location:** Live `nfl-calculate-scores` bundles `_shared/scoring.ts` with `if (!game || !game.winner_team) continue;`
  (a FINAL game with no winner is **skipped**). Repo `supabase/functions/_shared/scoring.ts:120-122` has newer logic that
  scores a tie as a **loss** (−rank for a HotPick), and `__tests__/scoring.test.ts:172-196` tests the repo behavior the live
  build doesn't implement.
- **Risk (plain language):** A genuinely tied NFL game (rare, ~once every few seasons) would be silently skipped by the live
  incremental scorer instead of counting a HotPick tie as −rank, so a user's mid-week score could be briefly wrong. The
  authoritative Tuesday finalizer scores it correctly, so the settled total self-corrects — but the green test suite does not
  reflect what's actually deployed.
- **Suggested fix:** Redeploy `nfl-calculate-scores` from current repo so live `_shared/scoring.ts` matches the tested logic.

#### T2-S2 · `protect_frozen_rank` only blocks null-out, not re-ranking to a different value
**Owner: Code/Tom** · **Status: OPEN — low priority (current live behavior is correct)**
- **Location:** Live trigger `protect_frozen_rank` (BEFORE UPDATE on `season_games`): `IF OLD.frozen_rank IS NOT NULL AND NEW.frozen_rank IS NULL THEN NEW.frozen_rank := OLD.frozen_rank;`.
- **Risk (plain language):** The database guard for the "a frozen HotPick rank can never change after lock" rule only stops a
  rank from being wiped to empty. It does **not** stop a locked rank from being overwritten with a *different* number. Today
  nothing does that (the importer omits the rank columns on re-import, so it's safe), but the immutability promise rests on that
  convention, not on a hard lock.
- **Cross-ref:** This same function is also flagged for a mutable `search_path` in **T2-SEC3**.
- **Suggested fix:** If full DB-level immutability is wanted, harden the trigger to also block `value → different value` except
  via an explicit authorized path (e.g. the intentional `nfl-rank-games --force`).

### Security & auth  *(prior review's finding #14/#15 verified REMEDIATED — these are the residual Tier-2 items)*

#### T2-SEC1 · `reset_reviewer_sim` is gated by a competition allowlist, not a caller-role check
**Owner: Tom** (sandbox tool) · **Status: OPEN — low priority (cannot touch production)**
- **Location:** `public.reset_reviewer_sim(p_competition text)`; `EXECUTE` granted to `authenticated`. First statement is
  `IF p_competition NOT IN ('nfl_2025_simA','nfl_2025_simG') THEN RAISE EXCEPTION ...` — no caller-role check in the body.
- **Risk (plain language):** Any logged-in user (not just a super-admin) could reset the two App-Review demo sandboxes —
  archiving the reviewer's pools, deleting their picks, re-futuring the slate. It physically **cannot** touch `nfl_2026` or
  `nfl_2025_sim` (the allowlist hard-blocks that), so there's no production-score or live-week risk; the exposure is a curious
  tester disrupting an in-progress App Review demo.
- **Suggested fix:** Add an `is_super_admin`/reviewer-allowlist guard as the first statement, **or** `REVOKE EXECUTE ... FROM
  authenticated` and call it from an Edge Function as `service_role`. Keep the competition allowlist as a second layer.

#### T2-SEC2 · Two anon-executable read-only `SECURITY DEFINER` functions remain (intentional)
**Owner: Code** · **Status: ACKNOWLEDGED — no action required**
- **Location:** `public.check_poolie_name_available(text)` (pre-signup name check) and `public.user_can_see_competition(text, uuid)`
  (referenced inside an RLS policy expression, so it must stay anon-grantable). Documented as deliberate KEEP-ANON in
  `20260608153000_...sql` §1.
- **Risk (plain language):** Unauthenticated callers can run two harmless read-only lookups. No mutation, no sensitive data. The
  security advisor will keep listing them as WARN.
- **Suggested fix:** None needed; accept as-is. (Don't switch `user_can_see_competition` to INVOKER pre-launch — its RLS call-site depends on the current grant.)

#### T2-SEC3 · `protect_frozen_rank` has a mutable `search_path` (the only one live)
**Owner: Code/Tom** · **Status: OPEN — low priority**
- **Location:** `public.protect_frozen_rank()` — defined in `supabase/migrations/20260611195119_protect_frozen_rank.sql`
  (created *after* the June-08 hardening, which is why it was missed). It is `SECURITY INVOKER` (not DEFINER), so the classic
  definer-escalation vector doesn't apply.
- **Risk (plain language):** With no pinned `search_path`, the trigger resolves object names using the session's path; in
  principle someone who can influence that path could shadow a referenced object. Real-world exploitability is low (invoker
  context, simple trigger), but this trigger guards `frozen_rank` (scoring integrity), so it's worth pinning. *Note: the prior
  review's "~13 mutable search_paths" are fixed; the live count is now **1** — a single later regression, not the original set.*
- **Suggested fix:** `ALTER FUNCTION public.protect_frozen_rank() SET search_path = pg_catalog, public;` (match the project's existing convention).

#### T2-SEC4 / T2-SEC5 · Two public buckets have SELECT policies gated only by `bucket_id` (enumerable), and are not in git
**Owner: Tom** (storage-policy decision + commit to migration) · **Status: OPEN — bounded info-exposure**
- **Location:** storage policy `"Anyone can view partner logos"` on `partner-logos` (`qual = bucket_id = 'partner-logos'`), and
  `"Public read access on public-data"` on `public-data` (`qual = bucket_id = 'public-data'`). Neither appears in
  `supabase/migrations/` — both were created via the dashboard.
- **Risk (plain language):** Any client (including someone not logged in) can **list/enumerate every file** in those two public
  buckets, not just fetch a known URL. Both hold only public assets (partner logos; legal docs), so impact is limited to file
  enumeration. Writes are correctly locked down (super-admin for `partner-logos`; path-scoped to `legal/` for `public-data`).
- **Suggested fix:** Drop the broad SELECT policies (public buckets serve object-URL reads without a listing policy) or add a
  path-prefix/role constraint — and move the policies into a committed migration so they're reproducible (closes the "all DB
  objects in git" gap).

### Tech debt & dead code

#### T2-D1 · Loose destructive SQL sitting in `migrations/`
**Owner: Claude** (safe move) · **Status: OPEN**
- **Location:** `supabase/migrations/PURGE_PRESEASON_PICKS.sql` — a `DELETE FROM public.season_picks WHERE competition='nfl_2026' AND game_id IN (… preseason games)` inside `BEGIN/COMMIT`, with an audit-log write. A one-off runbook, intentionally non-timestamped so the CLI ignores it.
- **Risk (plain language):** A raw script that deletes real user picks lives in the folder the migration tool scans, protected
  only by its non-standard filename. A future "replay/baseline all migrations" pass, a rename to a timestamp, or a tooling change
  could silently delete production preseason picks. (Already flagged as finding #3 in `ARCHITECTURE_AUDIT.md`.)
- **Suggested fix:** Move it to `scripts/` (alongside `seed-nfl-2025.mjs`) as a documented one-off runbook, out of `supabase/migrations/`.

#### T2-D2 · Three dead, superseded simulator HTML tools
**Owner: Claude** (delete/archive after confirm) · **Status: OPEN**
- **Location:** `tools/season-simulator.html`, `tools/season-simulator-v2.html`, `tools/season-simulator-v3.html` (~205 KB total).
- **Risk (plain language):** Three near-identical stale copies of a simulator UI that's been replaced twice over (by v4, then the
  CLI runner, then the Operator Console). Harmless but confusing clutter. Grep proves nothing references them (only `.git/index`).
- **Correction to the brief:** Only **three** are dead — **`tools/season-simulator-v4.html` is still the live App-Review reviewer
  tool** (referenced in `docs/REVIEWER_SIM_RUNBOOK.md:103`) and `tools/hotpick-operator-console.html` is still wired into
  `tools/check-home-spec-sync.mjs` + app SYNC comments. **Keep both.**
- **Suggested fix:** Delete the three v1/v2/v3 files (or move to `tools/archive/`) after a final confirmation. Do not touch v4 or the operator console.

#### T2-D3 · Large files (> ~800 lines) — split-out plan + in-season risk
**Owner: Claude/Code** (off-season refactors) · **Status: OPEN — schedule for the off-season**

The cheapest, lowest-risk win across the UI files is extracting each trailing `StyleSheet.create` block to a
co-located `*.styles.ts` (there's prior art: `src/shell/screens/partnerAdmin/styles.ts`). **Leave the three in-season
hot-path files alone during a live week.**

| File | Lines | What to split out | Risky to touch in-season? |
|---|---|---|---|
| `src/shell/screens/PoolSettingsScreen.tsx` | 1652 | Two `<Modal>` blocks (962–1034, 1038–1094) → components; ~553-line styles block → `poolSettings.styles.ts` | **No** — organizer settings UI, off the hot path |
| `src/shell/screens/PartnerAdminScreen.tsx` | 1563 | Chairman-assignment flow + perk editor → `PartnerChairmanCard`/`PartnerPerkEditor` | **No** — super-admin tooling |
| `src/shared/components/SmackTalkScreen.tsx` | 1269 | Two long-press modals (916–976, 979–1000) → `ReactionPickerModal`/`ReactorListModal`; styles → file | **Mild** — live during games but off the scoring path; prefer a preview build |
| `src/shell/screens/SettingsScreen.tsx` | 1096 | One `<Modal>` (708–766) + ~324-line styles block → `settings.styles.ts` | **No** — account/settings UI |
| `src/shell/components/home/PicksOpenHero.tsx` | 1027 | Salutation/spec copy (mirrored to the Operator Console via the `:691` SYNC contract) → shared module; styles → file | **YES — careful** — Home hero on the pick path; guarded by `tools/check-home-spec-sync.mjs`. Don't touch mid-week |
| `src/shell/screens/ClubAdminScreen.tsx` | 1021 | Two broadcast/perk modals (755–813, 817–861) → `ClubBroadcastComposer`/perk editor | **No** — League Tools admin |
| `src/templates/season/stores/seasonStore.ts` | 991 | Live-score Realtime sub + per-week stamping (`subscribeToLiveScores`, ~119+) vs leaderboard assembly | **YES** — in-season hot path; off-season only |
| `src/shell/components/home/PoolModule.tsx` | 975 | Rank-pill sub-UI (~208-line `rankPillStyles` + pill render) → `RankPill` component | **Mild** — Home Contest card; presentational, reads from store; prefer a preview build |
| `src/sports/nfl/stores/nflStore.ts` | 945 | `subscribeToLiveScores`/`subscribeToCompetitionConfig` (~125+) vs `setLiveScore`/standings (470–528) | **YES — highest caution** — NFL live scores for the active competitions; off-season only |
| `src/shell/screens/PoolMembersScreen.tsx` | 885 | Two member-management modals (505–559, 564–609) → components; styles → file | **No** — roster admin UI |
| `supabase/functions/compute-hardware/index.ts` | 939 | ~16 standalone `computeX{Week,Season}` award fns (110–880) → `awards/weekly.ts` + `awards/season.ts` + thin dispatcher | **No (server-critical)** — runs only at `weekly_settle`/`season_settle`/manual; refactor between settles, verify on the sim competition |

---

## Appendix A — Four adversarial claims: verdicts (Sub-agent 1, re-verified live)

| # | Claim | Verdict | Key evidence (live) |
|---|---|---|---|
| 1 | **Idempotency** — re-running `calculate-scores` can't double points (totals `SET`, not `+=`) | ✅ **CONFIRMED SAFE** | Live `upsert_season_week_scores`: `ON CONFLICT … DO UPDATE SET week_points = EXCLUDED.week_points` (overwrite); `apply_season_pick_results`: `SET points = …`. No accumulation anywhere in the live write path. |
| 2 | **`frozen_rank`** — a schedule re-import can't null a locked rank | ✅ **CONFIRMED SAFE** *(with caveat)* | Live `nfl-import-schedule` omits `rank`/`frozen_rank` from its upsert payload, so PostgREST never touches them on re-import; `protect_frozen_rank` additionally blocks `value → NULL`. **Caveat (T2-S2):** the trigger does NOT block `value → different value`, so immutability rests on the importer's column-omission convention. |
| 3 | **`power_up` hole** — scorer honors `power_up='double_down'` but nothing writes it | ✅ **CONFIRMED SAFE / no live exposure** | Live scorer does branch on it (`rank * 2`), but `SELECT power_up, count(*) FROM season_picks WHERE power_up IS NOT NULL GROUP BY 1` returns **[]** (zero rows). All client writers hardcode `power_up: null`; no write path sets it. (Power-ups are a deferred feature.) |
| 4 | **Playoff double-count** — `get_user_ranks_in_pools` sums `week_points + playoff_points`, equal for wk ≥ 19 | 🔴 **HOLE FOUND** | YES, double-counts — **but only on the Home pool-rank chip, not the Ladder.** Summing line confirmed live; call site `poolIndicatorsSlice.ts:184` → `PoolModule.tsx:184`. The Ladder (`seasonStore.ts:526`) is phase-scoped and correct, so the two surfaces disagree in the postseason. See **T0-2**. |

---

## Appendix B — Checked and found OK (no action)

- **Realtime/listener/timer cleanup** — every `.channel().subscribe()` has a matching `removeChannel` in cleanup;
  `AppState`/`Linking` listeners and all `setInterval`/debounced `setTimeout` timers are cleared on unmount.
- **FlatList keys** — all 10 existing `FlatList`s use stable id-based `keyExtractor`s; the SmackTalk message list is
  bounded (`.limit(50)` + pagination). *(The Ladder is the one unbounded `.map()` — see T1-2.)*
- **`is_hotpick_correct`** — no `?? false` in the scoring path; the live finalizer correctly keeps it `NULL` pre-FINAL.
- **`scoring_locked` brake** — present and honored in live `nfl-calculate-scores`, `nfl-update-scores`, `nfl-finalize-week`.
- **`nfl-import-schedule` sim guard** — live function refuses any competition whose `data_provider != 'espn'` (403) before the stale-id delete.
- **Destructive admin RPCs** — every one verified to self-authorize by `super_admin`/pool-role as its first action, and `anon` is revoked (prior finding #14 remediated; `admin_purge_user` dropped).
- **Storage writes** — `partner-logos` (super-admin) and `public-data` (path-scoped to `legal/`) write policies are correctly gated; only the SELECT/listing policies are broad (T2-SEC4/5).

---

*Read-only audit, generated by four parallel sub-agents with live re-verification of the Tier-0 findings and the
`notification_preferences` root cause. Suggested fixes are described, not applied — left for Tom to triage.*
