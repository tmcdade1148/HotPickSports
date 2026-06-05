-- Weekly Engine §5d — in-week week_state ownership (260605_HotPick_WeeklyEngine_Spec v1.0).
--
-- IMPLEMENTATION NOTE / deliberate deviation from the spec table:
-- The spec assigns the in-week states to nfl-update-scores (locked/live) and
-- nfl-finalize-week (settling/complete). We instead drive ALL of them from a
-- single AFTER-UPDATE trigger on season_games. Rationale:
--   * It fires the instant a game's status / is_finalized flag changes (more
--     responsive than the 5-min poller — settling/complete appear immediately).
--   * It's self-contained (one migration, no edge-function deploy) and avoids
--     touching nfl-update-scores, whose deployed version depends on
--     _shared/scoring.ts (bundling risk + the function is ahead of this branch).
--   * Same firing conditions and the same "settling only when the LAST game is
--     final" rule the spec requires.
--
-- Ownership realised here:
--   locked    : a game in the current week has kicked off (kickoff_at <= now)
--   live      : at least one game in progress
--   settling  : EVERY game in the week is FINAL (fires on the last game only)
--   complete  : EVERY game in the week is is_finalized=true (i.e. scored +
--               finalized by finalize_latest_completed_week)
-- Forward-only (never regresses), in-cycle only (REGULAR/PLAYOFFS/SUPERBOWL),
-- and only for the competition's CURRENT week. picks_open remains owned by
-- admin_advance_week / open_week_picks (§5a/§5c) — the trigger never sets it.
--
-- Caveat: 'locked' (kicked-off but not yet in-progress) is a narrow window; in
-- practice the first status change is SCHEDULED->IN_PROGRESS, so the trigger
-- usually goes straight to 'live'. The Home Screen unifies picks_open/locked/
-- live into one hero, so this is cosmetic. A precise time-based 'locked' would
-- need a scheduled setter.

CREATE OR REPLACE FUNCTION public.sync_week_state_from_games()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_week int;
  v_phase        text;
  v_week_state   text;
  v_total        int;
  v_final        int;
  v_finalized    int;
  v_live         int;
  v_kicked       int;
  v_desired      text;
  v_order        jsonb := '{"idle":0,"picks_open":1,"locked":2,"live":3,"settling":4,"complete":5}'::jsonb;
BEGIN
  -- Only the competition's CURRENT week matters.
  SELECT (value #>> '{}')::int INTO v_current_week
    FROM competition_config WHERE competition = NEW.competition AND key = 'current_week';
  IF v_current_week IS NULL OR NEW.week <> v_current_week THEN
    RETURN NEW;
  END IF;

  -- Weekly cycle only runs inside these phases (Hard Rule #22).
  SELECT value #>> '{}' INTO v_phase
    FROM competition_config WHERE competition = NEW.competition AND key = 'current_phase';
  IF v_phase IS NULL OR v_phase NOT IN ('REGULAR','PLAYOFFS','SUPERBOWL') THEN
    RETURN NEW;
  END IF;

  SELECT value #>> '{}' INTO v_week_state
    FROM competition_config WHERE competition = NEW.competition AND key = 'week_state';

  -- Aggregate the current week's games.
  SELECT count(*),
         count(*) FILTER (WHERE status ILIKE '%final%'),
         count(*) FILTER (WHERE is_finalized = true),
         count(*) FILTER (WHERE status ILIKE '%progress%' OR upper(status) IN ('IN','IN_PROGRESS')),
         count(*) FILTER (WHERE kickoff_at IS NOT NULL AND kickoff_at <= now())
    INTO v_total, v_final, v_finalized, v_live, v_kicked
    FROM season_games
   WHERE competition = NEW.competition AND season_year = NEW.season_year AND week = v_current_week;

  IF v_total = 0 THEN RETURN NEW; END IF;

  IF      v_finalized = v_total THEN v_desired := 'complete';
  ELSIF   v_final     = v_total THEN v_desired := 'settling';
  ELSIF   v_live      > 0       THEN v_desired := 'live';
  ELSIF   v_kicked    > 0       THEN v_desired := 'locked';
  ELSE    v_desired := NULL;
  END IF;

  -- Forward-only, and only from an owned in-cycle state (>= picks_open). Never
  -- regress, never touch idle/off-cycle, never set picks_open.
  IF v_desired IS NOT NULL
     AND COALESCE((v_order ->> v_week_state)::int, 0) >= 1
     AND (v_order ->> v_desired)::int > COALESCE((v_order ->> v_week_state)::int, 0)
  THEN
    UPDATE competition_config SET value = to_jsonb(v_desired)
      WHERE competition = NEW.competition AND key = 'week_state';
    RAISE LOG 'sync_week_state_from_games: % week % % -> %',
      NEW.competition, v_current_week, v_week_state, v_desired;
  END IF;

  RETURN NEW;
END;
$function$;

-- Fire only when the fields that affect week_state change.
DROP TRIGGER IF EXISTS season_games_sync_week_state ON public.season_games;
CREATE TRIGGER season_games_sync_week_state
  AFTER UPDATE OF status, is_finalized ON public.season_games
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_week_state_from_games();
