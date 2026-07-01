# Handoff Brief — HotPick Rehearsal / Tie-Test Work

**Written:** 2026-06-30, end of session `session_01DWEYVDJVtZBtZ29nNn5bGd`
**For:** a fresh Code session with no memory of the prior one.
**Branch:** `claude/rehearsal-bugs-diagnostic-e9rg9o` (PR #361), 10 commits ahead of `origin/main`, HEAD `b030957`.
**Live Supabase project:** `mzqtrpdiqhopjmxjccwy`.

## How to read this brief
Every item is labelled by **demonstrable state**, not "does code exist":
- **DONE-&-VERIFIED** — I confirmed the *outcome* this session (read the live artifact / queried the DB / checked CI).
- **DEPLOYED-BUT-UNMERGED** — live in prod, but the repo (`main`/this branch) does **not** contain it → redeploying from repo would regress it.
- **BUILT-UNVERIFIED** — code is committed/deployed but its effect has **not** been demonstrated (no consumer exercised it).
- **REGRESSION** — something that worked was reverted.
- **SPECCED-NOT-BUILT** — a doc/decision with no implementation.
- **NEEDS-CONFIRMATION** — I could not fully verify; the next session must check.

> **Why the paranoia:** the previous session reported the title tiebreaker as "half-built" because it read a *repo* copy of `compute-hardware` and saw an array-index sort. That was **stale unmerged code**. The **live** function is the correct `title_rank` version. Lesson applied throughout: *verify the live consumer, not the repo producer.* A computed value with no consumer is called out explicitly.

---

## 0. Verification method used
- **Live edge functions** read via `get_edge_function` (source, not just version): `sim-operator` v14, `compute-hardware` v14, `nfl-calculate-scores` v30.
- **Live DB** read via `execute_sql`: `compute_pool_standings` / `get_pool_standings` definitions + grants, `client_error_log` existence + row count, `competition_config`, function ACLs.
- **CI** read via GitHub checks API on HEAD `b030957`.
- Repo/branch state via `git`.

---

## 1. Branch / PR state — DONE-&-VERIFIED

### PR #361 — this branch (`claude/rehearsal-bugs-diagnostic-e9rg9o` → `main`)
- **State:** OPEN, not merged. HEAD `b030957`.
- **CI (verified on HEAD):** `Typecheck + tests + lint` = **success (GREEN)**. `eas update --channel preview` = **success**. (Netlify checks are `neutral`/canceled — irrelevant; this is a mobile app.)
- **Contents (10 commits):** Sentry removal + No Silent Failures infra (`dc7ef60`), Ladder blank-fix (`503865b`), lint fix (`bd6236c`), preview-OTA workflow (`1b366a8`), TestFlight build workflow (`0475bae`), CompleteHero standing-line hide (`42533c6`), PoolModule rank-chip hide + stale-week-tile fix (`2ca2c66`), retire v4 / rename operator console → `_v2` (`3e3483c`), Seed Bots (`94225b1`), build-label bump (`b030957`).
- **Merge gate (from the PR body + this session):**
  1. CI green — **MET** (verified).
  2. Apply `client_error_log` migration — **MET** (table exists live; see §6).
  3. **Hold merge to `main` until the points-tie and title-tie rehearsal parts pass** — **NOT MET** (the rehearsal has not been run on this repaired build).
- **Net:** the only thing between #361 and a merge is **the rehearsal passing** (§2 + §4).

### PR #360 — `claude/ladder-ties-name-uniqueness-k0aar9` → `main`
- **State:** OPEN, not merged. This is the **Tie-Handling** PR (push-on-draw + single-source-of-truth standings + title tiebreaker).
- **Its server side is DEPLOYED-BUT-UNMERGED** (verified live this session):
  - `compute_pool_standings` / `get_pool_standings` — **live** (migration effect present; see §2).
  - `compute-hardware` v14 (podium by `title_rank`) — **live** (see §2).
  - `nfl-calculate-scores` v30 (`_shared/scoring.ts` push-on-draw) — **live** (see §3/§7).
  - `nfl-announce-regular-winners` v11 (crown by `title_rank`) — claimed by #360, **NEEDS-CONFIRMATION** (not re-read this session).
- **Sequence decision (from prior session, still holds):** this branch (#361) is the **carrier of the corrected app-side** Ladder fix. #360 keeps its server migration + edge functions; **drop #360's app-side `seasonStore`/`SeasonBoardScreen` edits** in favour of #361's.
- **The drift risk is real:** `main` (and this branch) contain the **old** `compute-hardware` (array-index podium) and the **old** `_shared/scoring.ts` (tie-as-loss). If anyone redeploys those functions **from the repo**, production regresses. Closing this requires **merging #360's server code to `main`** (or porting it onto this branch) — see §2 and §3.

**Exact merge order that is safe:**
1. Fix the `sim-operator` tie regression (§3) so the sandbox mirrors prod.
2. Run the rehearsal (points-tie + title-tie + a drawn game) — §2/§4.
3. Land #360's server code into `main` (merge #360 or port it) so repo == live.
4. Then merge #361.

---

## 2. Podium / champion title tiebreaker — **#1 NEXT ACTION** — DEPLOYED-BUT-UNMERGED + BUILT-UNVERIFIED

**Corrected understanding (important):** the tiebreaker is **not** "half-built in production." The **live** `compute-hardware` v14 `computePodiumAward()` was re-read this session and it:
- calls `supabase.rpc("compute_pool_standings", { p_pool_id })`,
- awards **every row at `title_rank === targetRank`** (not an array index),
- emits `co_champions`, and on the champion slot `title_decided_by_hotpick_points` + `title_tiebreak_reason`.

Because it routes through `compute_pool_standings`, it **inherits** that function's properties, verified live:
- **Super-admins excluded** — `members` CTE has `NOT COALESCE(pr.is_super_admin,false)`. ✅
- **`pool_start_date` window + `season_year` scope** — real NFL-week window, not a calendar extract. ✅
- `standing_rank = RANK() OVER (ORDER BY total_points DESC)` (co-rank, points only), `title_rank = RANK() OVER (ORDER BY total_points DESC, hotpick_points DESC)` (the tiebreaker).
- **Grants (verified):** `compute_pool_standings` = `service_role` + `postgres` only (NOT `authenticated`); `get_pool_standings` = `authenticated` + `service_role`. So the client can only ever read **ranks** (no `hotpick_points` leak); the award engine reads the full function server-side.

**Consumer check (the thing that bit us last time):** `title_rank`'s consumer is the **live `compute-hardware` v14** award path. The **client never receives `title_rank`** (`get_pool_standings` strips it; no `src/**` file reads it). So: consumed by the award engine ✅, correctly *not* consumed by the Ladder ✅.

**So why is this still the #1 action?** Because it is **BUILT-UNVERIFIED** — the deployed tiebreaker has **never been exercised by a forced tie**, and it can silently regress two ways: (a) repo `main` still holds the old array-index version (redeploy = regression), (b) a super-admin or start-date bug would only show under a real tie. The rehearsal is what turns this from "believed" into "demonstrated."

### Acceptance criteria — demonstrable outcomes (run in `nfl_2025_sim`)
Set up a sandbox pool and drive weeks so that, in one pool, **two non-admin members finish level on `total_points` but with different `hotpick_points`**, plus a **third pair level on both**. Then invoke `compute-hardware` with `trigger:"season_settle"` (or `manual_override`) for `nfl_2025_sim`. **PASS =** all of:

1. **Tiebreaker names the right champion.**
   `SELECT user_id, context_json->>'title_decided_by_hotpick_points' AS by_hp, context_json->>'final_points' AS pts FROM user_hardware WHERE hardware_slug='pool_champion' AND competition='nfl_2025_sim' AND pool_id='<POOL>';`
   → exactly **one** row, `user_id` = the higher-`hotpick_points` player, `by_hp = true`.

2. **The Ladder still shows an honest co-rank (no leak).**
   `SELECT user_id, standing_rank, is_tied FROM get_pool_standings(ARRAY['<POOL>']::uuid[]);` (as an authenticated member)
   → both tied players `standing_rank = 1`, `is_tied = true`. Neither is secretly ordered by hotpick points on the board.

3. **True co-champions when level on BOTH.**
   For the pair equal on points *and* hotpick points: two `pool_champion` rows, both `context_json->>'co_champions' = 'true'`, and **no `podium_2nd` row** for that pool (a 1,1,3 `title_rank` leaves 2nd empty — decided).

4. **Super-admin never wins.** Seed a super-admin with the pool's top raw points → they must be **absent** from `compute_pool_standings('<POOL>')` output and hold **no** `pool_champion` row.

5. **Idempotent.** Re-invoke `season_settle`; `user_hardware` row count for the pool is unchanged (ON CONFLICT DO NOTHING).

### After it passes
Land #360's server code into `main` (merge #360 or cherry-port `compute-hardware` + the `20260627120000` migration + `nfl-calculate-scores` + `nfl-announce-regular-winners`) so **repo == live** and the array-index version can't be redeployed. **NEEDS-CONFIRMATION:** the migration `20260627120000` did **not** appear in `supabase_migrations.schema_migrations` when queried, yet the functions are live — confirm the ledger records it (or reconcile) before relying on a `db reset`.

---

## 3. `sim-operator` tie handling — **REGRESSION introduced this session** — must fix before the rehearsal

**Locked rule (#360 / register 2.7):** a regular-season game that ends even is a **PUSH**, not a loss (regular pick excluded, HotPick 0 swing, `is_hotpick_correct` stays null).

**Verified live state:**
- **Production scorer `nfl-calculate-scores` v30 = PUSH** ✅ (read live; `_shared/scoring.ts` has the explicit `if (!game.winner_team) continue;` push branch).
- **Sandbox scorer `sim-operator` v14 = LOSS** ✗ — its `scoreWeek` scores a null-winner game as a loss (HotPick `-rank`, `is_hotpick_correct=false`).

**Cause:** this session redeployed `sim-operator` (v13 → **v14**) to add the `seed_bots` action, **from this branch**, which forked from `main` before #360 and therefore carries the **old tie-as-loss** `scoreWeek`. That deploy **reverted #360's v13 push guard** in the sandbox. So the sandbox no longer mirrors production for a drawn game — which is exactly what the rehearsal is meant to prove.

**Fix (before running the drawn-game part of the rehearsal):** port the push branch from `_shared/scoring.ts` into `sim-operator`'s inline `scoreWeek` (null `winner_team` → regular pick not counted / no result row / 0 pts; HotPick 0 swing, `is_hotpick_correct` stays null), keep the `seed_bots` action, commit, and redeploy `sim-operator` (verify_jwt=false preserved). **Acceptance:** in `nfl_2025_sim`, seed a pick on a game you then finalize with `winner_team=NULL` + equal scores → after scoring, that user's `season_user_totals` shows **no** `-rank` swing and `is_hotpick_correct` is null; a regular pick on it does **not** increment `total_picks`.

> Note: `seed_bots` deliberately treats a tie game as an incorrect regular pick when steering bot scores ("tie → loss anyway"). Under push semantics a tie game doesn't score at all, so avoid using tie games in the "correct-count" math — `seedBots` already restricts the correct set to `winner IS NOT NULL` games, so this is cosmetic, but revisit if a week has a real draw.

---

## 4. Seed Bots (operator console) — DEPLOYED but BUILT-UNVERIFIED

- **`sim-operator` `seed_bots` action — DEPLOYED** (v14, `verify_jwt=false`, verified by reading the live function: `"seed_bots"` in `VALID_ACTIONS`, dispatch case, and full `seedBots()` present). Hard-locked to `nfl_2025_sim` and to the 8 constant bot UUIDs; writes `season_picks` only; idempotent skip-if-present. Reads intended winners from the real `nfl_2025` results, so "N correct" is deterministic; seeds at `picks_open` (games must be `scheduled`).
- **`_v2` console UI — BUILT, syntax-checked, UNVERIFIED in use.** Panel renders only for `nfl_2025_sim` at `picks_open`. Build label `2026-06-30.1 · seed-bots` (bumped so the operator can confirm they have the right file).
- **Was it used to seed the last rehearsal? NO.** The `seed_bots` action has **never been successfully invoked** — the operator spent the session loading the correct console file (repeated stale-file / browser-cache issues). The bots' existing Week-1 picks in `nfl_2025_sim` were seeded earlier by **SQL / `sim-runner.mjs`**, not by this button. **First real click is still pending** — treat the button as unproven until a seed returns `{success:true, seeded:[...]}` and the Ladder reflects the targeted finishes.
- **Delivery caveat:** `_v2` is a **local file the operator opens in a browser**; it is not hosted. The operator must open the copy from the repo working tree (`tools/hotpick-operator-console_v2.html`) on this branch — a stale local/download copy will not have the button.

---

## 5. Home-card display fixes — BUILT + PUBLISHED-TO-PREVIEW, UNVERIFIED-ON-DEVICE

- **`42533c6`** — hides the "You sit {Nth} in {Contest}" standing line on `CompleteHero` (module-const flag `SHOW_STANDING_LINE = false`). Fixes the "0th" render.
- **`2ca2c66`** — hides the PoolModule Season/Week rank chip (`SHOW_POOL_RANK_CHIP = false`) and re-syncs the stale Week-2 tile on focus return. Fixes "12th of 11".
- **Both are committed on this branch** (verified) and are ancestors of HEAD.
- **The preview OTA at HEAD `b030957` succeeded** (`eas update --channel preview` check = success) — so the **preview channel now carries these fixes**. This is the key correction: the publish is **not** the gap.
- **The gap is device delivery.** The operator still saw "0th" / "12th of 11" because **their phone had not pulled/applied the preview bundle** all session (the recurring "stale bundle on the phone" problem; an EAS TestFlight build path was wired — workflow `0475bae` / `eas.json` `testflight` profile — but **never triggered/verified**). **NEEDS-CONFIRMATION:** the phone's channel + `runtimeVersion` vs the published update (runtime was `1.1.0`). A phone on the `preview` channel with a matching runtime **will** get these on next launch; if it's a standalone/TestFlight build on a different runtime, it won't. Resolve device delivery (finish the TestFlight build or confirm the phone is on `preview`) before trusting an on-device check.
- **Reversibility:** both fixes are single boolean flags — flip back to `true` to restore the rank UI once the rank sources are trustworthy (see §7 week-rank note).

---

## 6. No Silent Failures infra — PARTIALLY VERIFIED

- **Sentry removal — DONE-&-VERIFIED (repo).** `@sentry/react-native` gone from `package.json`/lock; `sentry.ts` + `docs/SENTRY.md` deleted; `initMonitoring`/`wrapWithMonitoring`/`setMonitoringUser` unwired; jest sentry mock removed. (This is repo state; the *effect* only lands on the next native build.)
- **`client_error_log` table — DONE-&-VERIFIED live.** `to_regclass('public.client_error_log')` = present. RLS/append-only per migration `20260630120000`. **NEEDS-CONFIRMATION:** that version did **not** show in `supabase_migrations.schema_migrations` when queried — confirm the ledger recorded it.
- **`logError()` + `AppErrorBoundary` — BUILT-UNVERIFIED end-to-end.** `client_error_log` has **0 rows**. That is *expected* (the app code that writes to it lives only on this unmerged branch and is not on any shipped build yet), but it also means **the write path has never been demonstrated**. To verify: run the app from this branch, force a caught render error, and confirm a row lands in `client_error_log`. Until then, treat "errors are captured" as unproven.

---

## 7. Open bugs — current read (each labelled)

- **Client "score wrong at kickoff" — EXPLAINED, and it contradicts a locked decision.**
  Locked decision: *game scores update live, but a user's own score resolves only at FINAL.*
  - **Server (authoritative) = FINAL-only** ✅ — both scorers filter `ilike status '%FINAL%'`; `season_user_totals` only reflects finalized games.
  - **Client display `src/sports/nfl/utils/liveWeekScore.ts` = moves LIVE** ✗ — `computeLiveWeekEarned()` deliberately adds/subtracts points for **in-progress** games (currently-winning → `+value`; HotPick currently-losing → `-rank`). Its own header calls it a "running estimate … converges to the settled total once every game is final."
  - **So the decision is DECISION-ONLY on the client** — the shipped code does the opposite of "resolve only at FINAL," which is almost certainly the "score wrong at kickoff" report. **Product call needed:** either (a) change the decision (accept a live-moving estimate), or (b) make `computeLiveWeekEarned` count only FINAL games (drop the `isLiveStatus` branch). Not yet done.
- **Season-side Ladder blanking on game-advance — FIXED (app-side), UNVERIFIED on device.** Root cause was the `profiles!inner(is_super_admin)` ambiguous embed (PGRST201) swallowed → empty members → blank. Fixed in `503865b` (separate profiles query + surfaced `leaderboardError`). Verified by code read; not yet re-observed on a device running this bundle (same delivery gap as §5).
- **~9-second "settling churn" — NEEDS-CONFIRMATION, likely sim wave-pacing artifact, not a real-app bug.** The prior session's read was that this is the operator console/sim advancing waves + realtime re-renders, not a production loop. **Not reproduced this session** — do not assert it's benign without watching a realtime subscription during a real (non-sim) settle.

---

## 8. Deferred / horizon with deadlines

- **Preseason isolation (`nfl_2026_pre`) — SPECCED-NOT-BUILT — hard deadline early August 2026.**
  - **Verified:** there is **no `nfl_2026_pre` competition** in `competition_config`. `nfl_2026` is currently `OFF_SEASON`, week 1, provider `espn`.
  - Spec: `docs/PRESEASON_ISOLATION_SPEC.md` (v1.1). Register findings (LAUNCH_READINESS 0.11): `nfl_2026` weeks 1–3 conflate PRESEASON + REGULAR under one week integer (~30/32/31 games); **no gameplay query filters by `phase`**; the `nfl-rank-games` `rank = count − index` gate would assign ranks 1–30 in a 30-game week, breaking the HotPick rank-16 cap. **PRESEASON rows must be removed/isolated from `nfl_2026` before picks open** (NFL preseason 2026: Aug 6). This is the real time-box: if preseason games land in `nfl_2026` unscoped, they corrupt ranks.
  - **Next session:** treat this as a dated deliverable, not "someday." Decide the isolation mechanism (separate `nfl_2026_pre` competition vs. phase-filtered queries + rank gate fix) and land it before early August.
- **Other deferred (no near deadline):** Super Bowl enhanced scoring, playoffs-only competition, playoff-champion ladder tiebreaker (all → Nov 2026). Playoff rank double-count (register 0.6) is a separate pre-playoffs item. Do not build ahead of these.

---

## 9. Reconcile against `docs/LAUNCH_READINESS.md`

Entries that are now **stale vs. verified state** — update the register:
- **2.4 (dead simulator files):** already updated this session — `season-simulator-v4.html` retired (browsers block the `sb_secret_` key; `sim-runner.mjs` is the replacement incl. App-Review flow), operator console renamed `_v2`. If any register text still says "v4 stays — it's the live App-Review tool," it's stale.
- **2.7 (tie-handling drift, "live scorer differs from repo on ties"):** **partially resolved but re-opened by this session.** Production `nfl-calculate-scores` v30 = PUSH (matches the tested repo intent). BUT (a) `main`/this branch still hold tie-as-loss (`_shared/scoring.ts`), so repo≠live until #360 merges; and (b) `sim-operator` was **regressed to tie-as-loss** this session (§3). Register 2.7 should reflect: prod=push, repo=loss (unmerged), sandbox=loss (regressed, fix pending).
- **Title tiebreaker:** if any register/PR note implies the podium tiebreaker is unbuilt or "arbitrary," that's stale — it's **live in `compute-hardware` v14** (§2), just unmerged and unverified-by-rehearsal.
- **0.11 (preseason):** still open and now **dated** (early August) — see §8. Confirm it's flagged as a deadline, not a "later."
- **Migration-ledger reconciliation (2.1-adjacent):** `20260627120000` (tie-handling) and `20260630120000` (client_error_log) were **not found** in `supabase_migrations.schema_migrations` though their objects are live — add a register item to reconcile ledger vs. live so a `db reset`/baseline can rebuild them.

---

## TL;DR ordered next actions
1. **Fix the `sim-operator` tie-as-loss regression** (§3) → redeploy → so the sandbox mirrors prod push.
2. **Run the rehearsal in `nfl_2025_sim`** (§2 acceptance criteria: points-tie → co-rank "T-1"; title-tie → champion by HotPick points; co-champions; super-admin excluded; drawn game = push). First real use of the **Seed Bots** button (§4) — prove it works.
3. **Resolve device delivery** so the operator's phone actually runs this bundle (§5) and the Ladder/display fixes can be confirmed on-device.
4. **Land #360's server code into `main`** so repo == live (kills the redeploy-regression risk), then **merge #361**.
5. **Product call on client FINAL-only display** (§7) and **schedule preseason isolation** before early August (§8).
