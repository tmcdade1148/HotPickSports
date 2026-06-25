# HotPick — Preseason Isolation Spec

**Developer handoff · v1.1 (supersedes v1.0 and `PRESEASON_PICKS_NO_SAVE_SPEC.md`)**
Document: `PRESEASON_ISOLATION_SPEC.md` · 2026-06-25 · Supabase project `mzqtrpdiqhopjmxjccwy` · Audience: Claude Code · Owner: Tom McDade · Template: Season

> **What changed in v1.1 (read first).** v1.0 declared `nfl_2026` out of scope and assumed the importer could pull preseason. Both were wrong:
> 1. `nfl_2026` already holds the August preseason games, stacked onto regular weeks 1–3 (30 / 32 / 31 games per week). They must be removed — now in scope.
> 2. The importer has no preseason path (`week <= 18` always pulls ESPN `seasontype=2`). It needs a config-driven seasontype branch to populate `nfl_2026_pre`.
> 3. Verified 2026-06-25 (code trace): no gameplay query filters by the games' `phase` column, so a phase label cannot isolate preseason. The competition string is the only isolation that works.

---

## 1. Purpose and Scope

Run the NFL preseason (Aug 6 – Sept 8, 2026) as a full, scored, real-world end-to-end test — real ESPN games, odds, ranking, scoring, the Ladder, push, real devices — inside its own competition, `nfl_2026_pre`, with none of it touching the production `nfl_2026` season. Separately, remove the preseason games currently mislabeled inside `nfl_2026` so the real season's weeks 1–3 are clean 16-game weeks before `nfl_2026` ever opens for picks.

- **Competitions affected:** NEW `nfl_2026_pre` (created + populated); `nfl_2026` (cleanup of existing preseason rows — new in v1.1).
- **Out of scope:** the phase-within-`nfl_2026` "no-save" approach (superseded by this); any new tables; any `pool_id` or flag on scores; changing how regular-season scoring works.

---

## 2. Locked Decisions

| Decision | Answer | Why it is locked |
|---|---|---|
| Isolation mechanism | Preseason runs as its OWN competition (`nfl_2026_pre`), never a phase or week-range inside `nfl_2026`. | Verified 2026-06-25: rank/score/pick queries scope by `(competition, week)` with NO phase filter, so a phase tag cannot isolate preseason. Competition string is the only working boundary. Hard Rule #1. |
| Preseason scoring | Scores COUNT during the August window inside `nfl_2026_pre`. | A scored preseason exercises the real pipeline end-to-end; the competition boundary keeps it safe. |
| **`nfl_2026` must be cleaned** | The existing `PRESEASON`-phase rows in `nfl_2026` (weeks 0–3) are removed before `nfl_2026` opens. (New in v1.1.) | `nfl-rank-games` selects all games for `(competition, week)` and assigns `rank = count − index`. With 30 games in Week 1 it assigns ranks 1–30 and freezes them — breaking the HotPick (caps at 16) and scoring. Hard Rule #6 makes a bad freeze hard to undo. |
| Cutover | Sept 2: a single `active_competition` flip from `nfl_2026_pre` to `nfl_2026`. No data wipe. | `nfl_2026_pre` is preserved; the flip just points the app at the real season. |

---

## 3. Architecture Principles

- **Reuses:** the competition string as the isolation boundary; the existing Season-template tables; the existing NFL Edge Functions; `competition_config`.
- **New (kept to the minimum):** one set of `competition_config` rows for `nfl_2026_pre`; exactly ONE new config key (`espn_season_type`) so the ESPN-facing functions pull `seasontype=1` for the preseason competition — config-driven, never hardcoded; and a single targeted, backed-up DELETE of the existing preseason rows from `nfl_2026`.
- **Hard Rules in force:** #1 (no new tables per event), #2 (no `pool_id` on scores), #3 (scoring server-side only), #6 (`frozen_rank` immutable), #8 (RLS always on).

---

## 4. Schema Changes

No new tables (Hard Rule #1). Two data operations, both via `apply_migration` (DML on RLS-protected tables; `execute_sql` runs as anon and is silently filtered).

### 4a. Seed the preseason competition

One config key differs from a normal Season competition: `espn_season_type = '1'`. The importer defaults to `seasontype 2` when the key is absent, so existing competitions are unaffected.

```sql
INSERT INTO competition_config (competition, key, value, description) VALUES
  ('nfl_2026_pre','template','season','Season template'),
  ('nfl_2026_pre','sport','nfl','NFL'),
  ('nfl_2026_pre','season_year','2026','Reuses 2026 schedule year'),
  ('nfl_2026_pre','data_provider','espn','Real ESPN games — importer runs'),
  ('nfl_2026_pre','espn_season_type','1','Pull ESPN seasontype=1 (preseason)'),
  ('nfl_2026_pre','current_phase','REGULAR','Scored like a regular week'),
  ('nfl_2026_pre','current_week','1','Preseason week 1'),
  ('nfl_2026_pre','week_state','idle','Weekly cycle drives the rest'),
  ('nfl_2026_pre','is_active','true','Active during the August window'),
  ('nfl_2026_pre','scoring_locked','false','Emergency brake — required key'),
  ('nfl_2026_pre','playoff_start_week','99','No playoffs in preseason')
ON CONFLICT (competition,key) DO NOTHING;
```

### 4b. Clean `nfl_2026` (after 4a + the preseason import are verified)

Take a manual Supabase backup first (Project Settings → Database → Backups). The preseason rows are distinguishable by phase, so the delete is exact:

```sql
-- Backup taken? Then:
DELETE FROM season_games
WHERE competition = 'nfl_2026' AND phase = 'PRESEASON';

-- Verify (expect: weeks 1-3 = 16 rows each, week 0 = 0, all kickoffs Sep+):
SELECT week, COUNT(*) AS games,
       MIN(kickoff_at)::date AS first, MAX(kickoff_at)::date AS last
FROM season_games WHERE competition='nfl_2026' AND week IN (0,1,2,3)
GROUP BY week ORDER BY week;
```

> **Sequence matters.** Do NOT delete from `nfl_2026` until `nfl_2026_pre` is seeded AND the preseason games are confirmed present in `nfl_2026_pre`. The existing `nfl_2026` `PRESEASON` rows are the reference for what the import should produce — don't destroy the reference before the copy exists.

---

## 5. Edge Function Specification

No new functions. The change is a config-driven seasontype branch in the ESPN-facing functions.

### 5a. Required pre-build inventory (read-only)

Before writing code, list every Edge Function that calls the ESPN API with a `seasontype`/`week`. Confirmed so far: `nfl-import-schedule` passes `seasontype` to ESPN; `nfl-rank-games` does NOT (it ranks whatever rows already exist for the week, so it needs no change). Inventory `nfl-update-scores` and `nfl-fetch-odds` for ESPN `seasontype` usage and apply the same config-driven branch wherever found.

### 5b. `nfl-import-schedule` change

Today: `if (week <= 18) { seasonType = 2; espnWeek = week; phase = "REGULAR"; }`. This is why pointing it at `nfl_2026_pre` would wrongly pull regular-season games.

- Read `espn_season_type` from `competition_config` for the competition. If `'1'`, set `seasonType = 1` and `phase = "PRESEASON"`; otherwise keep the existing `seasontype-2` (regular) / `seasontype-3` (playoff) behavior unchanged.
- Map the internal week to ESPN's preseason week index. Code must confirm ESPN's exact preseason indices (HOF game vs preseason weeks 1–3). The existing `nfl_2026` `PRESEASON` rows — their `game_id` values and kickoff dates — are the authoritative reference for the correct mapping.
- Keep the existing guardrail: the importer must target `nfl_2026_pre`, never `nfl_2026`, for preseason. `data_provider` already drives the refuse-non-espn guard; do not weaken it.

---

## 6. Client Behavior

No client changes. The app renders whatever `active_competition` points to — `nfl_2026_pre` during August, `nfl_2026` from September 2. The client never computes scores (Hard Rule #3); it displays only. Pools are per-competition, so preseason pools do not carry into `nfl_2026` — that is expected, not a bug.

---

## 7. Red Flags

- **"Just relabel the preseason weeks (week 0/-1/-2 or 100+) inside `nfl_2026` to differentiate them."** → No. Verified: gameplay queries don't filter by the phase column, so no week label isolates preseason. Use the separate competition.
- **"Add a `pool_id` or preseason flag to scores so we can filter or wipe them."** → No. Hard Rule #2 — scores are user-scoped; isolation is the competition string, never a column on scores.
- **"Run the regular importer against `nfl_2026` to grab or clean the preseason games."** → No. Its stale-id cleanup keys on `(competition, week)` without phase and would churn/delete rows unpredictably, and it can't pull `seasontype=1`. Clean `nfl_2026` with the targeted DELETE in 4b; import preseason into `nfl_2026_pre`.
- **"The delete is tiny, skip the backup."** → No. It's production data. Manual Supabase backup first — deployment rule, non-negotiable.

---

## 8. Build Order & Completion Checklist

**Build order**

1. Pre-build inventory (5a): list ESPN-facing functions that use `seasontype`.
2. Add the config-driven seasontype branch to the importer (and any others found).
3. Seed `nfl_2026_pre` config (4a).
4. Import preseason into `nfl_2026_pre`; rank it; confirm ~14–16 games/week, `phase=PRESEASON`, ranks 1..N (N≤16).
5. Manual backup, then clean `nfl_2026` (4b); run the verify query.
6. Confirm `active_competition`; document the Sept 2 flip.

**Done means**

- `nfl_2026_pre` config seeded, including `espn_season_type='1'` and `scoring_locked`.
- Preseason games present in `nfl_2026_pre` with `phase=PRESEASON` and correct ESPN preseason dates; ranks frozen 1..N, N≤16.
- Manual backup taken before the `nfl_2026` delete.
- `nfl_2026` verify query returns: weeks 1–3 = 16 games each, week 0 = 0 rows, all kickoffs September or later, no `PRESEASON` rows remain.
- No new tables created; no `pool_id`/flag added to any scoring table.
- `active_competition` behaviour for the August window vs the Sept 2 cutover is documented.

---

## 9. Simplicity Review

**Simplicity review passed.**

- Tables: none added (Hard Rule #1) — `nfl_2026_pre` is rows in existing template tables.
- Edge Functions: none added — the seasontype branch is a parameter on existing functions, driven by one config key.
- Config: one new key (`espn_season_type`), backward-compatible (defaults to 2 when absent).
- Complexity: the `nfl_2026` cleanup is a single phase-scoped DELETE plus a verify query. No YAGNI.

---

## 10. Code Simplicity Reminder

Before marking this work complete, the developer must apply a simplicity review to their implementation:

- Is every new function doing exactly one thing?
- Is there any code that could be removed without changing behavior?
- Are there any database queries that could be combined or eliminated?
- Is there any client-side logic that belongs server-side?
- Would a competent developer reading this code six months from now understand it without explanation?

If the answer to any of these is no: simplify before submitting. The goal is not the cleverest solution. It is the simplest solution that correctly implements this spec.
