-- protect_frozen_rank
--
-- Finding T1-1 (260611_HotPick_FrozenRankImmutability_Spec): the weekly import
-- (nfl-import-schedule) overwrote frozen_rank on every upsert, so re-importing
-- an already-ranked week wiped its frozen HotPick ranks to null — silent score
-- corruption after the pick deadline. The import-side fix removes the rank
-- columns from the upsert payload; this trigger enforces Hard Rule #6 at the
-- data layer so the invariant holds regardless of which code path writes the
-- column (belt-and-suspenders, per the spec's Simplicity Review).
--
-- Deliberately narrow — blocks only the bug:
--   null  -> value  : allowed (the legitimate first freeze by nfl-rank-games)
--   value -> value' : allowed (the authorized force re-rank path)
--   value -> NULL   : blocked (the import clobber)
--
-- Verified before applying: no legitimate path anywhere sets frozen_rank=NULL
-- (checked all pg_proc bodies + season-simulator + reset_reviewer_sim).

CREATE OR REPLACE FUNCTION public.protect_frozen_rank()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- A frozen_rank, once set, may never be reset to NULL.
  --   null  -> value  : allowed (the legitimate first freeze by nfl-rank-games)
  --   value -> value' : allowed (the authorized force re-rank path)
  --   value -> NULL   : blocked (the bug — import clobber)
  IF OLD.frozen_rank IS NOT NULL AND NEW.frozen_rank IS NULL THEN
    NEW.frozen_rank := OLD.frozen_rank;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_frozen_rank ON public.season_games;

CREATE TRIGGER trg_protect_frozen_rank
BEFORE UPDATE ON public.season_games
FOR EACH ROW
EXECUTE FUNCTION public.protect_frozen_rank();

-- ---------------------------------------------------------------------------
-- Self-verification (sandbox-scoped, net-zero residue). Exercises the trigger
-- on a transient synthetic row INSIDE this transaction: the row is inserted,
-- tested, and deleted before commit, so the sim never sees it. Any assertion
-- failure raises and rolls the entire migration back (trigger included).
-- Covers spec checklist Test B (null->value allowed), Test D (value->NULL
-- blocked), and the force re-rank path (value->value' allowed).
-- Week 999 keeps it away from the sim's current week; updates here touch only
-- frozen_rank, so the season_games_sync_week_state trigger (UPDATE OF
-- status/is_finalized) never fires.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v int;
BEGIN
  INSERT INTO public.season_games
    (game_id, competition, season_year, week, home_team, away_team, kickoff_at)
  VALUES
    ('trg-selftest-frozen-rank', 'nfl_2025_sim', 2025, 999, 'TST', 'TS2', now());

  -- Test B: first freeze (null -> value) must pass through.
  UPDATE public.season_games SET frozen_rank = 16 WHERE game_id = 'trg-selftest-frozen-rank';
  SELECT frozen_rank INTO v FROM public.season_games WHERE game_id = 'trg-selftest-frozen-rank';
  IF v IS DISTINCT FROM 16 THEN
    RAISE EXCEPTION 'protect_frozen_rank self-test FAILED: first freeze (null->16) blocked, got %', v;
  END IF;

  -- Force re-rank path (value -> value'') must pass through.
  UPDATE public.season_games SET frozen_rank = 12 WHERE game_id = 'trg-selftest-frozen-rank';
  SELECT frozen_rank INTO v FROM public.season_games WHERE game_id = 'trg-selftest-frozen-rank';
  IF v IS DISTINCT FROM 12 THEN
    RAISE EXCEPTION 'protect_frozen_rank self-test FAILED: re-rank (16->12) blocked, got %', v;
  END IF;

  -- Test D: un-freezing (value -> NULL) must be prevented.
  UPDATE public.season_games SET frozen_rank = NULL WHERE game_id = 'trg-selftest-frozen-rank';
  SELECT frozen_rank INTO v FROM public.season_games WHERE game_id = 'trg-selftest-frozen-rank';
  IF v IS DISTINCT FROM 12 THEN
    RAISE EXCEPTION 'protect_frozen_rank self-test FAILED: value->NULL not blocked, got %', v;
  END IF;

  DELETE FROM public.season_games WHERE game_id = 'trg-selftest-frozen-rank';
END
$$;
