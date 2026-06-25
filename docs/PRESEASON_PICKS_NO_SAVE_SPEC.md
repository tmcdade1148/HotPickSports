> **⚠️ SUPERSEDED by [`PRESEASON_ISOLATION_SPEC.md`](./PRESEASON_ISOLATION_SPEC.md) (2026-06-25)** — the phase-within-`nfl_2026` "no-save" approach is replaced by running preseason as its own competition (`nfl_2026_pre`). Kept for history; do not implement.

# Preseason Picks — No Persistence Spec

**Status:** Spec only — implement before loading preseason games into `season_games`.
**Owner:** Tom (product).
**Last updated:** 2026-05-29.

---

## Problem

Per Tom's direction: preseason games are practice. Picks made during preseason should let a brand-new user feel how the picks UI runs, but the picks themselves and any "score" from them **must not persist to a user's season totals**. The regular season starts everyone at 0.

Today the picks flow writes user-level rows to `season_picks` with `competition + week`. Scoring functions then accumulate week scores into `season_user_totals`. If we load preseason games into `season_games` without a guard, every preseason pick the new "Make your picks" button submits would land in `season_picks` and roll into season totals — exactly the pollution we want to avoid.

## Goal

Preseason picks behave like a sandbox:

- User can hit "Make your picks", choose a winner per preseason game, see the picks UI render the way it will for the regular season.
- Picks are stored well enough that **inside a single session** the user can come back and see their selections (they didn't disappear when they navigated away).
- Nothing about a preseason pick contributes to: `season_user_totals`, weekly leaderboards, hardware/awards, pool ladders, career stats, the HotPick streak/hit-rate, or any analytics rollup.
- When `current_phase` advances from `PRE_SEASON` → `REGULAR`, all preseason picks are purged so the database state is clean for kickoff.

## Recommended approach

**Phase-on-the-game** as the source of truth, no new `is_practice` column on picks.

1. Preseason `season_games` rows are loaded with `phase = 'PRESEASON'` (the column already exists; today it holds `REGULAR`, `WILDCARD`, etc.).
2. Picks save to `season_picks` exactly like regular picks — same row shape, same RPC. No client branching.
3. Every scoring path that reads `season_picks` is gated on the joined `season_games.phase`. Preseason rows are filtered out of:
   - `compute_week_score` (or whatever weekly scorer runs)
   - `season_user_totals` aggregation
   - HotPick streak / hit-rate calculations
   - `game_pick_stats` rollups (or those get a `phase` filter so preseason stats live separately but don't merge)
   - Hardware / award computations
4. The phase-transition cron that flips `PRE_SEASON` → `REGULAR` triggers a purge: `DELETE FROM season_picks WHERE competition = current_competition AND week IN (preseason weeks)`. Logged to `admin_audit_log`.

Picks survive within preseason (session and across sessions while still in PRE_SEASON), then disappear cleanly at the cutover. No long-term DB pollution.

## Alternative considered

**Don't save preseason picks at all — local AsyncStorage only.**
Simpler in some ways (no scoring guards, no purge). Loses cross-session visibility — picks vanish on app restart even mid-preseason. Worse for the "feel how the regular season runs" demo since the regular season's picks definitely persist across sessions. Rejected.

**New `is_practice boolean` column on `season_picks`.**
Self-documenting at the row level. Adds schema where the game's `phase` already carries the same information. Rejected; phase-on-game is sufficient.

## Schema changes

None to add. Inventory of touch points:

| Surface | What changes |
|---|---|
| `season_games` | Preseason rows loaded with `phase = 'PRESEASON'` (column already exists, no migration). |
| `season_picks` | No schema change. Rows write normally. |
| `season_user_totals` | Aggregation joins to `season_games` and filters `WHERE phase != 'PRESEASON'`. |
| `game_pick_stats` | Same phase filter. |
| `compute_week_score` Edge Function | Skip rows where the joined game is preseason. |
| `compute_hardware` Edge Function | Same. |
| Streak / hit-rate computations | Same. |
| Phase transition (`PRE_SEASON` → `REGULAR`) | New step: purge `season_picks` for preseason weeks. Audit log entry. |

## Schedule loader

`nfl-import-schedule` Edge Function today handles ESPN `seasontype=2` (regular) and `=3` (playoffs). Add `=1` (preseason):

- Map preseason weeks to a stable week-number convention. Two cleanest options:
  - Negative numbers (`-2, -1, 0` for HOF / Week 1 / Week 2 / Week 3) — explicit but breaks existing `week int NOT NULL` assumptions.
  - Use weeks `1..3` with `phase = 'PRESEASON'` as the disambiguator. Simpler, matches existing schema, but means the `(competition, week)` pair is no longer unique without phase.

Recommend: **weeks 1..3 with phase column as disambiguator.** All existing scoring queries already filter by phase implicitly (or will once the no-save guard ships), so the regular-season Week 1 and preseason Week 1 don't collide in any user-facing read.

Open question: ESPN's preseason includes a Hall of Fame Game (often before regular preseason starts). Tom's hand-built schedule (template forthcoming) is the authoritative source for 2026 — if HoF is in, treat as `phase='PRESEASON', week=0` or fold into Week 1.

## UI

- "Make your picks" button on PreSeasonGamesHero (already shipped, PR #186) routes to PicksTab as today.
- PicksTab during PRE_SEASON renders preseason games. **Add a clear banner**: "Practice picks. Scores reset for the regular season." So a user landing on the picks screen doesn't think these count.
- Pick lock / kickoff cutoff still applies per-game (no editing once kickoff hits).

## Phase transition cron

Today the cron that flips phases is admin-initiated. Add to its `PRE_SEASON → REGULAR` path:

```sql
DELETE FROM public.season_picks
WHERE competition = current_competition
  AND game_id IN (
    SELECT game_id FROM public.season_games
    WHERE competition = current_competition AND phase = 'PRESEASON'
  );

INSERT INTO public.admin_audit_log (action, details, ...) VALUES (
  'preseason_picks_purged',
  jsonb_build_object('competition', current_competition, 'count', purged_count),
  ...
);
```

Then preseason games themselves can stay in `season_games` for historical reference, or be archived to a side table — open question.

## Out of scope

- Showing scores for preseason games anywhere on the homepage / picks UI. (Tom: "we'd only need to show scores in the 3 consecutive week pills on homescreen" — that's a separate spec for the in-Contest home variant.)
- 3-week preseason pill strip on homescreen.
- Awarding any kind of badge or recognition for preseason performance.

## What to keep in mind in the meantime

1. **Don't load preseason games into `nfl_2026.season_games` yet.** Once they're there, picks against them will write to `season_picks` without the no-save guard, polluting the data.
2. **Tom's hand-built preseason schedule** is the source of truth (NFL hasn't published a structured download for it). Excel template provided alongside this spec.
3. **Hold off on extending `nfl-import-schedule`** for `seasontype=1` until this spec ships. Direct insert from the hand-built sheet is fine for one-time loading once we're ready.
