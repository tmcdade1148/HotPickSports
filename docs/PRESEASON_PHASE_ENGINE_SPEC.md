HOTPICK SPORTS
Developer Handoff Specification

Preseason Phase-Aware Week Engine
Let the weekly engine run preseason weeks (open → pick → lock) without colliding with regular-season weeks of the same number.
Competition: nfl_2026   ·   Template: Season
Supabase project: mzqtrpdiqhopjmxjccwy
Prepared for: Tom McDade · Honey & Punch
Date: June 24, 2026   ·   Version 1.0

1. Purpose and Scope
Today the weekly engine — the readiness gate, the pick-open action, and per-game locking — keys on a bare week integer (current_week). Preseason and regular season share week numbers: nfl_2026 has PRESEASON weeks 1, 2, 3 and REGULAR weeks 1, 2, 3. Because nothing distinguishes phase, the engine cannot prepare or open a preseason week without colliding with the regular-season week of the same number. The single week_readiness row, the rank/odds/import game queries, and the lock_at stamp all reach across both phases.
This spec makes the readiness and pick-open path phase-aware so the three preseason weeks of nfl_2026 can be opened as real-world practice, and extends the server prep pipeline (import → odds → rank) to handle preseason on demand.
In scope
	•	Phase-aware week_readiness (new unique key on competition + phase + week).
	•	Phase-scoped prep: nfl-import-schedule, nfl-fetch-odds, nfl-rank-games filter games by phase and write readiness per phase.
	•	Phase-scoped open: open_week_picks (RPC), admin_advance_week, and the nfl-open-picks Edge Function only ever stamp lock_at on the current phase's games.
	•	Extend the server to rank preseason on demand (per Tom): nfl-rank-games ranks a preseason week when invoked with an explicit week.
Out of scope (explicit)
	•	Preseason scoring, settlement, standings, awards. Do not touch nfl-calculate-scores, nfl-finalize-week, or season_user_totals.
	•	Automatic cron prep for preseason — preseason prep is admin-triggered (explicit week) only.
	•	week_state auto-progression for preseason — sync_week_state_from_games stays REGULAR/PLAYOFFS/SUPERBOWL only. Picks still lock at kickoff via lock_at.
2. Locked Decisions
These are final. Do not re-open them during the build.
Decision
Answer
Why it's locked
Practice depth
Open → pick → lock only; no scoring/settlement
Tom, 2026-06-24. Preseason is a mechanics rehearsal; keeps blast radius small.
Rank source
Server is extended to rank preseason on demand
Tom, 2026-06-24.
Readiness key
Add phase; UNIQUE(competition, phase, week_number)
Root cause of the collision is the bare-week key.
No new tables
Reuse week_readiness + a phase column
Hard Rule #1 — mirror season_games.phase, don't add tables.
Cron stays out of preseason
Auto deriveWeek unchanged; preseason prep is explicit-week
Preseason odds are thin; auto-prep would freeze ranks on missing lines (Hard Rule #6).
Phase naming
Keep 'PRE_SEASON' (config) and 'PRESEASON' (season_games); map explicitly
Both already exist in live data; renaming would be a larger, riskier change.
3. Architecture Principles
What this reuses
	•	The week_readiness table and the three prep Edge Functions (import / odds / rank).
	•	The open_week_picks RPC and _assert_week_ready gate.
	•	The per-game lock mechanic: enforce_pick_lock keys on each game's lock_at, not on week_state. So locking works in preseason with no week_state changes.
What is new
	•	A phase column on week_readiness, threaded through the readiness key, the prep functions, the assert, and the open/lock path.
Canonical phase resolution (define once, reuse everywhere)
config current_phase  →  season_games.phase  (the value used to filter game rows):
config current_phase
season_games.phase
weeks
PRE_SEASON
PRESEASON
0–3 (ESPN seasontype=1)
REGULAR
REGULAR
1–18 (seasontype=2)
PLAYOFFS / SUPERBOWL
WILDCARD / DIVISIONAL / CONFERENCE / SUPERBOWL
19 / 20 / 21 / 22 (seasontype=3)
week_readiness.phase stores the config phase value (PRE_SEASON / REGULAR / PLAYOFFS / SUPERBOWL) — one row per cycle phase. The games phase (above) is used only to filter season_games rows.
Hard Rules that apply
	•	#1 no new tables (phase column reuses week_readiness).
	•	#6 frozen_rank immutable — preseason ranks are frozen only when odds are present; re-rank allowed before picks open.
	•	#7 all dates UTC. #8 RLS stays on. #17 admin_audit_log entry before the open write is preserved.
4. Schema Changes
Apply via apply_migration (DDL). The table is currently empty (0 rows), so no backfill is needed; the default covers future regular rows.
-- 1) add phase, default REGULAR so existing/future regular rows are unambiguous
alter table public.week_readiness
  add column if not exists phase text not null default 'REGULAR';
 
-- 2) move the unique key from (competition, week_number)
--    to (competition, phase, week_number)
alter table public.week_readiness
  drop constraint if exists week_readiness_competition_week_number_key;
 
alter table public.week_readiness
  add constraint week_readiness_comp_phase_week_key
  unique (competition, phase, week_number);
phase stores config-phase values: PRE_SEASON, REGULAR, PLAYOFFS, SUPERBOWL. RLS is unchanged — the table is written by service-role Edge Functions and read by the operator console through the Supabase MCP.
5. Edge Function Specification
5.1 All three prep functions — shared changes
Applies identically to nfl-import-schedule, nfl-fetch-odds, and nfl-rank-games. Each currently selects games by (competition, season_year, week) with no phase filter, and upserts readiness on (competition, week_number).
	•	Resolve phase. Read cfg.current_phase; compute configPhase and gamesPhase via the canonical resolution (§3).
	•	Filter the game query by phase: add .eq('phase', gamesPhase) to the season_games select. This is the core bug fix — a preseason week-N run must never pull regular week-N games, and vice-versa.
	•	Make markReadiness phase-aware: markReadiness(competition, configPhase, week, fields); upsert onConflict: "competition,phase,week_number".
	•	Leave deriveWeek unchanged (returns 0 for non REGULAR/PLAYOFFS/SUPERBOWL). Preseason prep is on-demand only — the caller passes body.week while the competition is in PRE_SEASON.

// markReadiness, updated signature (all three functions)
async function markReadiness(competition, phase, week, fields) {
  try {
    await supabase.from("week_readiness").upsert(
      { competition, phase, week_number: week,
        updated_at: new Date().toISOString(), ...fields },
      { onConflict: "competition,phase,week_number" },
    );
  } catch (_e) { /* best-effort */ }
}
5.2 Per-function specifics
	•	nfl-import-schedule: extend the week→phase map so PRE_SEASON sets phase='PRESEASON' and imports from ESPN seasontype=1 (espnWeek = week, weeks 0–3). Game rows are written with phase='PRESEASON'.
	•	nfl-fetch-odds: for preseason use the preseason odds key americanfootball_nfl_preseason with markets=spreads,h2h. Keep odds_expected = games.length; if lines are thin, odds_count < odds_expected and the gate stays closed until lines arrive (correct).
	•	nfl-rank-games: rank within the single-phase game set. Preseason takes no playoff offset (applyPlayoffEscalation already no-ops off-playoffs). Freeze guard: do not freeze a preseason game whose moneyline and spread are both null — skip it so ranks_count < games_count keeps the gate closed (Hard Rule #6).
5.3 nfl-open-picks Edge Function
	•	Add PRE_SEASON to the allowed phases (currently REGULAR / PLAYOFFS / SUPERBOWL).
	•	Compute gamesPhase and filter BOTH the game select and the lock_at update by .eq('phase', gamesPhase). This prevents stamping lock_at on regular week-N games during preseason.
	•	Everything else (picks_locked=false, SmackTalk broadcast) is unchanged.
6. Database Function Changes
Apply via apply_migration.
_assert_week_ready — add phase parameter
create or replace function public._assert_week_ready(
  p_competition text, p_phase text, p_week integer)
returns void language plpgsql security definer set search_path to 'public'
as $fn$
declare r week_readiness%rowtype;
begin
  select * into r from week_readiness
   where competition = p_competition
     and phase = p_phase
     and week_number = p_week;
  if not found then
    raise exception
      'NOT_READY: no readiness row for % % week % - run prep first',
      p_competition, p_phase, p_week using errcode = '23514';
  end if;
  if not public._week_readiness_is_ready(r) then
    raise exception 'NOT_READY: % % week % not all-green',
      p_competition, p_phase, p_week using errcode = '23514';
  end if;
end; $fn$;
open_week_picks — assert + lock by phase
	•	Read current_phase; call _assert_week_ready(comp, current_phase, current_week).
	•	Compute gamesPhase; change the lock_at update to ... and week = v_current_week and phase = v_games_phase.
	•	Keep the super-admin check for the in-app path. Note: the operator console replicates these writes via the Supabase MCP because the MCP connection has no auth.uid() — that is documented in the console, not changed here.
admin_advance_week — compatibility fix (required)
	•	Change its _assert_week_ready(comp, v_new_week) call to _assert_week_ready(comp, v_current_phase, v_new_week) (the signature changed).
	•	Filter its lock_at update by gamesPhase too. This function is regular/playoffs only; preseason week-stepping is not done here (see §7).
admin_advance_season_phase — no change
	•	It already accepts 'PRE_SEASON' as a valid phase and parks the cycle idle with picks closed. The operator drives the preseason run manually from there (see §7).
7. Client / Operator Behavior
The operator surface is the existing HotPick Engine Console (Cowork artifact). Once this ships, its preseason block is lifted — the console's open SQL already filters lock_at by phase and will work for preseason. That console change is a small follow-up, not part of this server spec.
Preseason practice run — operator sequence
	•	admin_advance_season_phase('nfl_2026','PRE_SEASON').
	•	Set current_week to the target preseason week (1, 2, or 3) via a direct config set. admin_advance_week is for in-cycle regular/playoff stepping and does not traverse preseason.
	•	Run prep on demand, in order: nfl-import-schedule → nfl-fetch-odds → nfl-rank-games, each with body {competition:'nfl_2026', week:N}. They detect PRE_SEASON and scope to PRESEASON games.
	•	Confirm the readiness gate is green (console, or the console's read-only readiness dry-run).
	•	Open picks (in-app open_week_picks, or the console's guarded open).
	•	Players pick; each game locks at its own kickoff via lock_at.
	•	When done, admin_advance_season_phase('nfl_2026','REGULAR') for the real season — no standings residue, since scoring is out of scope.
The client never computes scoring or locking — unchanged. Preseason has no leaderboard surface (out of scope). week_state will not auto-advance during preseason; if a visible locked/live state is later wanted, whitelist PRE_SEASON in sync_week_state_from_games — flagged as future, out of scope.
8. Red Flags
If the developer proposes any of these, stop and correct course.
“I'll just add .eq('phase', current_phase).”
WRONG. Config phase is 'PRE_SEASON' / 'PLAYOFFS' but season_games.phase is 'PRESEASON' / 'WILDCARD' / etc. Filtering by the raw config string returns zero rows. Always map config → games phase via the §3 resolution.
“I'll run preseason prep on the Tuesday cron too.”
NO. Keep deriveWeek returning 0 off-cycle. Preseason odds are thin; auto-prep would freeze ranks on missing lines (Hard Rule #6). Preseason prep is explicit-week only.
“I'll score preseason into the standings for a full test.”
OUT OF SCOPE (locked). Do not touch nfl-calculate-scores, nfl-finalize-week, or season_user_totals. This build is open → lock only.
“I'll keep UNIQUE(competition, week_number) and just add a phase column.”
NO. The unique key must move to (competition, phase, week_number), or preseason and regular week N overwrite each other's readiness row.
“open can set lock_at by week only — playoff weeks don't collide.”
True for playoffs, but you must still filter by phase for preseason/regular. Apply the gamesPhase filter uniformly; for playoff weeks it's a harmless no-op narrowing.
9. Simplicity Review (Spec Level)
Simplicity review passed.
The one cross-cutting change — the readiness key plus phase threading — is root-cause, not gold-plating: the bare-week assumption is shared by six call sites (the table key, three prep functions, the assert, and the open/advance/lock path).
What was kept minimal
	•	No new tables — a phase column on week_readiness mirrors season_games.phase (Hard Rule #1).
	•	No new config keys — current_phase already exists.
	•	No new Edge Functions — extend the four existing ones.
	•	Cron untouched — on-demand prep only, smaller blast radius and no thin-odds freeze risk.
	•	Scoring, settlement, standings, and week_state auto-progression all excluded.
Audits
	•	Table audit: no new tables; no duplicated columns. Config audit: no redundant keys. Edge Function audit: no new functions; no merges needed. YAGNI: no future features specced.
10. Code Simplicity Reminder
Before marking this work complete, the developer must apply a simplicity review to their implementation:
•  Is every new function doing exactly one thing?
•  Is there any code that could be removed without changing behavior?
•  Are there any database queries that could be combined or eliminated?
•  Is there any client-side logic that belongs server-side?
•  Would a competent developer reading this code in six months understand it without explanation?
If the answer to any of these is no: simplify before submitting. The goal is not the cleverest solution — it is the simplest solution that correctly implements this spec.
Completion Checklist
Each item is verifiable, not subjective.
	•	week_readiness has a phase column and the unique key is (competition, phase, week_number).
	•	_assert_week_ready signature is (text, text, int); open_week_picks and admin_advance_week updated and compile.
	•	All three prep functions filter season_games by the resolved games-phase and write readiness with the config phase.
	•	nfl-open-picks accepts PRE_SEASON and filters lock_at by games-phase.
	•	Dry run: with nfl_2026 in PRE_SEASON week 1, run import → odds → rank; exactly one (nfl_2026, PRE_SEASON, 1) readiness row exists and is all-green; the (nfl_2026, REGULAR, 1) row is untouched.
	•	Open preseason week 1: only PRESEASON week-1 games get lock_at; REGULAR week-1 games' lock_at is unchanged.
	•	No rows written to season_user_totals for preseason (scoring out of scope).
Verification queries
-- readiness rows are phase-separated and green
select phase, week_number, games_status, odds_status, ranks_status
from week_readiness where competition='nfl_2026'
order by phase, week_number;
 
-- only the opened phase's week-1 games are locked
select phase,
       count(*) filter (where lock_at is not null) as locked,
       count(*) as total
from season_games
where competition='nfl_2026' and season_year=2026 and week=1
group by phase;
