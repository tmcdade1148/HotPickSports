-- ============================================================================
-- 260830_retire_nfl_2026_pre_cron_jobs.sql
--
-- Week-Prep Pipeline Hardening, §3 Cleanup. Deactivates the preseason
-- competition's scheduled jobs once preseason week 3 has settled.
--
-- *** DO NOT APPLY EARLY. *** As of 2026-08-25 preseason week 3 has NOT settled
-- — its last kickoff is 2026-08-29 22:00 UTC and 0 of 16 games are FINAL.
-- Retiring these jobs before then would strand the week un-scored and
-- un-finalized. The guard below enforces that: this file RAISES rather than
-- half-applying if week 3 is not done. It is safe to attempt any time; it will
-- simply refuse until it is genuinely safe.
--
-- Why retire them at all: left running, they poll all season for preseason
-- weeks that do not exist. The writes are harmless, but the Odds API quota is
-- not free and — the real cost — the log noise erodes the signal you need when
-- something actually breaks during a live week.
--
-- Reversible: SELECT cron.alter_job(<jobid>, active := true);
-- ============================================================================

DO $$
DECLARE
  v_games     int;
  v_unsettled int;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE upper(status) <> 'FINAL' OR is_finalized IS NOT TRUE)
    INTO v_games, v_unsettled
    FROM season_games
   WHERE competition = 'nfl_2026_pre' AND week = 3;

  IF v_games = 0 THEN
    RAISE EXCEPTION 'Refusing: no nfl_2026_pre week 3 games found at all. Check the competition before retiring its jobs.';
  END IF;

  IF v_unsettled > 0 THEN
    RAISE EXCEPTION 'Refusing: nfl_2026_pre week 3 has not settled (% of % games not FINAL+finalized). Last kickoff is 2026-08-29 22:00 UTC — wait for nfl-finalize-week, then re-apply.', v_unsettled, v_games;
  END IF;

  PERFORM cron.alter_job(88, active := false);  -- nfl-pre-import-schedule
  PERFORM cron.alter_job(90, active := false);  -- nfl-pre-fetch-odds
  PERFORM cron.alter_job(91, active := false);  -- nfl-pre-rank-games
  PERFORM cron.alter_job(93, active := false);  -- nfl-pre-update-scores
  PERFORM cron.alter_job(95, active := false);  -- nfl-pre-consensus

  RAISE NOTICE 'Retired nfl_2026_pre cron jobs 88, 90, 91, 93, 95.';
END $$;

-- ---------------------------------------------------------------------------
-- NOT retired here, deliberately — flagged for a decision rather than assumed.
--
--   job 89  nfl-pre-finalize-week    every 30 min
--   job 94  nfl-pre-calculate-scores every 5 min  (~288 runs/day)
--
-- The spec's cleanup list names five jobs and these are not among them, so they
-- stay active. The same rationale for retiring the other five does apply to
-- them — 94 in particular is the single noisiest job on the box once preseason
-- is over — but these two are the scoring finishers, and turning a scoring job
-- off is not a change to make on inference. Retire them in the same way once
-- confirmed:
--
--   SELECT cron.alter_job(89, active := false);
--   SELECT cron.alter_job(94, active := false);
-- ---------------------------------------------------------------------------
