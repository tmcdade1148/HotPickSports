# Weekly Engine — Code-Internals Review: Findings

Static review against **260605_HotPick_WeeklyEngine_Spec v1.0**, per the checklist in
**260606_HotPick_WeeklyEngineCodeReview**. Read-only; nothing was run. The sim test is
**not** cleared to run yet — see the blocker below.

**Reviewed:** all 8 `20260605*` migrations, the 3 prep Edge Functions
(`nfl-import-schedule`, `nfl-fetch-odds`, `nfl-rank-games`), `season-simulator`,
`admin_advance_season_phase`, and `AdminSeasonControlScreen.tsx`. Also confirmed against
the **live `nfl_2026` project** (`mzqtrpdiqhopjmxjccwy`): all 8 migrations applied;
RPC, table, config keys, and corrected value all present.

---

## ⛔ DO-NOT-SHIP BLOCKER (top, per review §7)

### E5 / D1 — `season-simulator` is still hardwired to **production** `nfl_2026`

**Verdict: WRONG.** This is the exact landmine the entire spec exists to defuse, unmitigated.

`supabase/functions/season-simulator/index.ts:4`
```ts
const COMPETITION = "nfl_2026";   // ← the production competition
```

- It is a module constant with **no request-body override** — every command (`setup`,
  `run_week`, `run_range`, `run_full_season`, `run_playoffs`, `cleanup`) operates against
  `nfl_2026` (`index.ts:18-56`).
- It performs all the destructive writes the spec forbids on production, against `nfl_2026`:
  - fabricates picks / deletes sim picks (`:73`)
  - writes `week_state` through the full cycle (`:127,168,219,223,251,305,364`)
  - writes config via the sim `JSON.stringify` pattern with `description: 'Set by season-simulator'` (`:371`)
- `setup()` copies `nfl_2025` → `nfl_2026` and seeds sim data into production (`:5-7,71-75`).

**Why this is the blocker, not a nit:** the spec's premise (§"READ FIRST", §2 "Simulator
never touches production", §8 Red Flag 1) and the completion checklist item
*"season-simulator confirmed scoped to `nfl_2025_sim` only — never writes `nfl_2026`"* are
**not satisfied**. The spec is explicit that there is *no flag that disables the destructive
steps* — the only safe state is for the simulator to be bound to `nfl_2025_sim`. It is not.
Any manual (or stray cron) invocation corrupts the live season.

**Recommended fix (needs your sign-off — it's design-sensitive, see notes):** rebind the
simulator's target to `nfl_2025_sim` (and its source/year accordingly), **and** add a hard
guard that raises if the resolved competition is ever `nfl_2026`. I did **not** apply this
overnight: it touches the sim's `setup()` data-copy semantics (source `nfl_2025` → target),
and per the deployment rules an Edge Function change needs a feature branch + preview + a
backup, not an unsupervised late-night deploy. Flagged for your call in the morning.

> Note: this blocker is **not** in the merged code being *wrong about advancing/scoring* —
> the production weekly engine itself (below) is sound. The blocker is that the old landmine
> was never re-pointed away from prod as the checklist required.

---

## Findings table

Legend: ✅ CORRECT · ⚠️ INCOMPLETE/PARTIAL · ⛔ WRONG (blocker) · ➖ deviation (reconciled)

### §2 — `admin_advance_week` (the clock)
| # | Verdict | Evidence |
|---|---------|----------|
| A1 Super-admin gate is the **first** guard | ✅ | `20260605200000_open_picks_gate.sql:87-91` — `is_super_admin` check precedes every read/write |
| A2 Advance guard: **every** current-week game FINAL + `is_finalized` | ✅ | `:108-122` — counts `not_final` & `not_finalized`, rejects if `>0` (ALL-semantics, not ANY); raises `WEEK_NOT_COMPLETE` |
| A3 `current_week` **incremented** (n+1), bounded | ✅ | `:128-134` — `v_new_week := v_current_week + 1`; `> v_max_week` (max `weekEnd`, fallback 22) → `SEASON_ENDED` |
| A4 Audit **before** state change | ✅ | audit insert `:163-172` precedes config UPDATEs `:175-180`; gate checked before audit `:139` so failed attempts aren't logged |
| A5 Atomic writes via `to_jsonb` | ✅ | `:175-180` — `to_jsonb(...)`, single function body; no `JSON.stringify` |
| A6 State only — no picks/scores/game-status writes | ✅ (➖) | No writes to `season_picks`/`season_user_totals`/scores/status. **Does** write `season_games.lock_at` `:184-185` — but that is the §5c-sanctioned *open mechanic* (`lock_at = kickoff_at`), not simulator behavior. See Deviation D-A6 below. |
| A7 Phase deferred to `admin_advance_season_phase`; reads `phases` from config | ✅ | `:142-150` computes `v_phase_crossed` read-only; never writes `current_phase`; no hardcoded ternary |
| A8 `next_picks_open_at` = 7am ET (11:00 UTC) of the **new week** | ⚠️ | Offset is correct (11:00 UTC) `:156`. But the precise *date* is only right if the caller passes `p_next_picks_open_at` — and **the client doesn't** (see C-client). No-arg fallback is "next 11:00 UTC at/after now()" `:156-159`, explicitly flagged as the one open §5a item (`20260605170000:126-127`). |

### §3 — Readiness gate
| # | Verdict | Evidence |
|---|---------|----------|
| B1 Each prep step writes status/count/timestamp | ✅ | import `nfl-import-schedule/index.ts:102,97,116`; odds `nfl-fetch-odds/index.ts:113-119,54,124`; ranks `nfl-rank-games/index.ts:141,82,145` |
| B2 Gate requires 3×ok **AND** `odds_count=odds_expected` **AND** `ranks_count=games_count` | ✅ | `_week_readiness_is_ready` `20260605230000:22-24`; counts enforced |
| B3 `rank-games` refuses when `odds_status != ok` | ⛔→⚠️ | **MISSING.** `nfl-rank-games/index.ts` never reads `odds_status`; it ranks whatever games exist and `homeWinProb` falls back to `0.5` for missing odds (`:30-34`), then **freezes** `frozen_rank` (`:104`). Dependency chain unenforced — wrong ranks can freeze on incomplete odds. Not in the §7 blocker list, but a real correctness gap. |
| B4 Re-runs idempotent (overwrite, not duplicate) | ✅ | readiness `upsert onConflict` (all three `markReadiness`); odds update-by-`game_id`; import upsert+stale-delete `nfl-import-schedule:83-95` |
| B5 Re-running ranks doesn't alter `frozen_rank` after open (Rule #6 / COALESCE) | ⚠️ | Default path is safe — `alreadyFrozen && !force` short-circuits (`nfl-rank-games:90-96`). But **`force=true` overwrites `frozen_rank` unconditionally** (`:102-107`) — no `COALESCE`, no un-frozen-only filter, no before-open guard. Violates Rule #6 / Red Flag 4 if forced after picks open. |
| B6 Provider-down writes a reason, not silent pending | ✅ | `odds_error` `nfl-fetch-odds:60,124`; `ranks_error` `nfl-rank-games:82,86,145`. (Table has no `games_error` — consistent with spec §4c.) |

### §4 — Open-picks path
| # | Verdict | Evidence |
|---|---------|----------|
| C1 Open blocked unless gate passes — manual **and** auto | ✅ | server-side `PERFORM _assert_week_ready(...)` in both paths: advance `20260605200000:139`, `open_week_picks:241`. Not UI-gated only. |
| C2 Manual open requires confirmation + audit | ✅ | confirm `AdminSeasonControlScreen.tsx:223,247`; audit `open_week_picks:245`, advance `:164` |
| C3 Auto-open **rejected** for `nfl_2026` regardless of mode | ⚠️ | **MISSING** defense-in-depth guard. `open_picks_mode` key exists (`20260605170000:26`) but **no code reads it**; neither RPC rejects auto for `nfl_2026`. Low real risk *today* (no auto-open path exists at all), but it's the named **sim Test 9** must-pass and a spec §5c requirement. |
| C4 Mode flip allowed only when `week_state=complete` | ⚠️ | **Not enforced** anywhere (would be a raw config UPDATE). Low risk — nothing consumes the mode yet. |
| C5 Open sets `lock_at=kickoff_at` per game + `picks_locked=false` | ✅ | advance `:184-187`; `open_week_picks:251-256` |

### §5 — In-week `week_state` ownership (the silent-failure zone)
| # | Verdict | Evidence |
|---|---------|----------|
| D1 Exactly the right writers, no rogue 5th | ⛔ | Legit writers OK: `picks_open` ← advance/open; `locked/live/settling/complete` ← trigger `20260605210000:91`; `idle` ← `admin_advance_season_phase` (sanctioned phase-boundary, Rule #22, `260601:41-61`). **But the rogue 5th writer is `season-simulator` → all states on `nfl_2026`** (see blocker). Legacy `nfl-finalize-week`/`nfl-open-picks`/`nfl-weekly-transition` write `week_state` → **none** (grep clean). |
| D2 `settling` fires **only** when the LAST game is FINAL | ✅ | `20260605210000:78-79` — `ELSIF v_final = v_total THEN 'settling'` (ALL-final, not ANY). The critical bug is **absent**. |
| D3 `live` persists across the window | ✅ | forward-only guard `:87-89` — never regresses to `locked` once `live` |
| D4 `complete` waits on `is_finalized` (scoring done) | ✅ | `:78` — `v_finalized = v_total` (set by `finalize_latest_completed_week`) |
| D5 Each writer logs when it fires | ✅ | trigger `RAISE LOG :93`; picks_open via `admin_audit_log`. (In-week logs land in Postgres logs / `get_logs`.) |
| D6 No inline scorer (Rule #3) | ✅ | trigger reads `is_finalized`, computes no scores; scoring stays in `nfl-calculate-scores`/`nfl-finalize-week`. No extracted scorer. |

### §6 — Config + cross-cutting
| # | Verdict | Evidence |
|---|---------|----------|
| E1 `season_picks_open_at = 2026-09-02T11:00:00Z` | ✅ | migration `20260605180000:7-10`; **live value confirmed** `…T11:00:00Z` (corrected from `13:00`) |
| E2 `next_picks_open_at` + `open_picks_mode` exist with descriptions | ✅ | `20260605170000:23-28`; live rows confirmed with descriptions |
| E3 No new per-sport/event tables (Rule #1) | ✅ | only `week_readiness` added (`20260605190000`) — template-shaped, keyed by `(competition, week_number)` |
| E4 No `pool_id` on scoring rows (Rule #2) | ✅ | none introduced. (`nfl-rank-games` uses `pool_id` only for SmackTalk `post_system_message` `:122-137` — messaging, not scoring.) |
| E5 Simulator scoped to `nfl_2025_sim` only | ⛔ | **WRONG — see blocker.** `season-simulator/index.ts:4` `COMPETITION = "nfl_2026"`. |

### §6a — Readiness indicator (client)
| Item | Verdict | Evidence |
|------|---------|----------|
| 3 checks in dependency order, counts + timestamps | ✅ | `AdminSeasonControlScreen.tsx:360-388` (Games/Odds/Ranks `CheckRow`s, "14 of 16" detail, `fmtTime`) |
| Open/Advance gated on all-green (server-mirrored) + realtime | ✅ | `isReady :90-97`; `canOpen/canAdvanceWeek :293-297`; realtime `:167-187` |
| Per-step **re-run buttons** (§6a) | ⚠️ | **MISSING.** `CheckRow`s are display-only; no `[Re-run odds]`/`[Re-run ranks]`. Operator must invoke the prep functions from the Supabase console. Error reason *is* surfaced as row detail (`:373,384`). Recovery-UX gap, not a logic blocker. |

---

## Deviations from spec (conscious, reconciled — not failures)

- **D-A6 — `admin_advance_week` writes `season_games.lock_at`.** §5a says the advance RPC
  writes "exactly four things" and "never `season_games`." §5c then folds the *open mechanics*
  (`lock_at = kickoff_at`, clear `picks_locked`) **into** `admin_advance_week` (documented
  decision, `20260605200000:1-10`). The write is the legitimate per-game lock mechanic, not
  simulator score/pick/status fabrication. §5c supersedes §5a's literal wording. **Accept.**
- **D-states ownership — single trigger vs two Edge Functions.** Spec assigns `locked/live`
  to `nfl-update-scores` and `settling/complete` to `nfl-finalize-week`. Implementation drives
  all four from one `AFTER UPDATE` trigger on `season_games` (`20260605210000:1-29`). Same
  firing conditions and the same LAST-game-final rule; more responsive than the 5-min poller;
  avoids a risky `nfl-update-scores` redeploy. **Accept** (arguably better).

---

## Summary

**Blockers (do-not-ship):**
1. **E5 / D1 — `season-simulator` hardwired to `nfl_2026`.** The original landmine was never
   re-scoped. Must be bound to `nfl_2025_sim` + guarded before the sim test and before launch.

**Incomplete (fix before launch; none individually catastrophic):**
- **B3** — `rank-games` doesn't refuse on red odds; can freeze ranks on incomplete odds.
- **B5** — `force=true` re-rank overwrites `frozen_rank` with no COALESCE / before-open guard (Rule #6).
- **C3** — no `nfl_2026` auto-open rejection (defense-in-depth; **sim Test 9** expects it).
- **C4** — `open_picks_mode` flip-only-when-complete unenforced (low risk; mode is currently inert).
- **A8 / client** — client calls `admin_advance_week` without `p_next_picks_open_at`; server
  fallback time may not be the schedule-anchored 7am ET of the new week. The exact derivation
  is the known-open §5a item.
- **§6a** — no in-app per-step re-run buttons.

**Found that the spec didn't anticipate / worth noting:**
- Minor edge case: if `import-schedule` returns **0 games** it marks `games_status=ok, count=0`
  (`nfl-import-schedule:48`); with odds/ranks also 0 the gate's count-equality could pass with a
  zero-game week. Theoretical (real weeks have games) but the gate doesn't assert `games_count > 0`.

**Correct and solid (the high-risk items the spec cared most about):** the advance guard
(A2, ALL-final), audit-before-state (A4), atomic `to_jsonb` writes (A5), the count-based gate
(B2), `settling`-only-on-last-game (D2), `complete`-waits-on-`is_finalized` (D4), no inline
scorer (D6), and the `season_picks_open_at` correction (E1) are all implemented correctly.

**Recommendation:** the production weekly engine itself is sound and production-ready for
manual operation. **Do not run the sim test until E5 is fixed** (the sim runs against
`nfl_2025_sim`, but the simulator function it would exercise is pointed at `nfl_2026` — running
it as-is would drive production state). Fix E5 first (with your sign-off on the re-scope), then
ideally B3/B5/C3, then run **260606_HotPick_WeeklyEngineSimTest**.

---
*260606 · Weekly Engine Code-Internals Review · static pass, no execution · HotPick Sports — Confidential*
