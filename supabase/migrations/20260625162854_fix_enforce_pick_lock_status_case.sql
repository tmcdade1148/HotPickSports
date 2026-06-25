-- ============================================================================
-- LAUNCH BLOCKER FIX (item 0.0) — enforce_pick_lock status-case mismatch
-- ============================================================================
-- Symptom: every pick INSERT/UPDATE on the live nfl_2026 season is rejected with
--   "Picks are locked for this game (status: SCHEDULED)". No real user can submit
--   a single pick. (season_picks has zero nfl_2026 rows today.)
--
-- Root cause: enforce_pick_lock compared season_games.status to the lowercase
--   literal 'scheduled', but the ESPN importer (nfl-import-schedule) and the live
--   score poller (nfl-update-scores) BOTH write UPPERCASE
--   ('SCHEDULED' / 'IN_PROGRESS' / 'FINAL'). All 318 nfl_2026 rows are 'SCHEDULED',
--   so 'SCHEDULED' <> 'scheduled' is always TRUE -> the trigger raises on every pick.
--   It passed testing because the simulator (sim-operator) writes lowercase
--   ('scheduled'), which the old exact-match happened to accept.
--
-- Why this is a comparator fix, NOT a data/importer fix:
--   * Canonical status casing for ESPN-fed competitions is UPPERCASE. That is what
--     production (nfl_2026) already holds and what BOTH ESPN-fed writers produce —
--     so there is nothing to "normalize" and nothing to change in the importer.
--   * Lowercase is only the sim-operator (sandbox) convention.
--   * Every OTHER reader is already case-insensitive: nfl-calculate-scores
--     (ILIKE '%FINAL%'), refresh-game-pick-stats (ILIKE '%FINAL%'),
--     sync_week_state_from_games (ILIKE '%final%' / upper(status) ...), and the
--     client normalizer src/sports/nfl/utils/gameStatus.ts. enforce_pick_lock was
--     the lone exact-match outlier.
--   * Forcing the 318 rows to lowercase would instead BREAK the season-template
--     client screens that compare exact UPPERCASE (SeasonPicksScreen,
--     SeasonMatchCard, useSeasonSubmitState, seasonStore) — a much larger blast radius.
--
-- Fix: make the status check case-insensitive so the trigger is correct no matter
--   which writer produced the row. The per-game lock_at check and the exact RAISE
--   messages are preserved unchanged. CREATE OR REPLACE is idempotent and safe to
--   re-run. NO data migration is performed.
--
-- ⚠️ Take a MANUAL Supabase backup before applying (Project Settings -> Database ->
--    Backups -> Manual backup). Apply via apply_migration (trigger/function change,
--    RLS-adjacent), never execute_sql. This is a server-side DB change only — no app
--    build / EAS update is required to ship it.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_pick_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  game_record RECORD;
BEGIN
  SELECT status, lock_at INTO game_record
  FROM season_games
  WHERE game_id = NEW.game_id;

  IF game_record IS NULL THEN
    RAISE EXCEPTION 'Game not found: %', NEW.game_id;
  END IF;

  -- Block if the game is no longer scheduled (kicked off, live, or final).
  -- Case-insensitive: ESPN-fed writers store UPPERCASE ('SCHEDULED'), the
  -- simulator stores lowercase ('scheduled'). Compare on lower() so neither
  -- convention can wedge picks shut.
  IF lower(game_record.status) <> 'scheduled' THEN
    RAISE EXCEPTION 'Picks are locked for this game (status: %)', game_record.status;
  END IF;

  -- Block if this game's own lock_at has passed. Per-game locking: lock_at is
  -- set to the game's own kickoff by nfl-open-picks (no Sunday-wave anchor).
  IF game_record.lock_at IS NOT NULL AND game_record.lock_at <= NOW() THEN
    RAISE EXCEPTION 'Picks are locked for this game (lock_at: %)', game_record.lock_at;
  END IF;

  RETURN NEW;
END;
$function$;
