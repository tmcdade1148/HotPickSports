-- Per-game locking: each game locks at its own kickoff. Remove the old
-- two-wave "Sunday anchor" config key (no longer written or read by anything)
-- and refresh the enforce_pick_lock comment. The trigger logic itself is
-- already correct — it reads each game's own lock_at, which nfl-open-picks now
-- sets to that game's kickoff.
DELETE FROM public.competition_config WHERE key = 'sunday_lock_anchor';

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

  -- Block if game is no longer scheduled (kicked off, live, or final)
  IF game_record.status != 'scheduled' THEN
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
