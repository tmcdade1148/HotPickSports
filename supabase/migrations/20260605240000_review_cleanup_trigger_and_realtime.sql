-- Review cleanup: #8 (trigger fires only on real transitions) + #6 (publish
-- week_readiness so the admin Season Control screen can subscribe to it).

-- #8 — sync_week_state_from_games previously ran its full body on EVERY
-- status/is_finalized write, including the 5-min poller re-writing the same
-- value. A WHEN clause restricts it to actual value changes, so it runs only on
-- the SCHEDULED->IN_PROGRESS->FINAL transitions and is_finalized flips that can
-- move week_state.
DROP TRIGGER IF EXISTS season_games_sync_week_state ON public.season_games;
CREATE TRIGGER season_games_sync_week_state
  AFTER UPDATE OF status, is_finalized ON public.season_games
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status
        OR OLD.is_finalized IS DISTINCT FROM NEW.is_finalized)
  EXECUTE FUNCTION public.sync_week_state_from_games();

-- #6 — week_readiness wasn't in the realtime publication (competition_config and
-- season_games already are). Publish it so the Season Control screen gets live
-- readiness updates. RLS still applies: only super-admins can SELECT
-- week_readiness, so only they receive the change events.
ALTER PUBLICATION supabase_realtime ADD TABLE public.week_readiness;
