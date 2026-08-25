-- ============================================================================
-- 260830_retire_nfl_2026_pre_cron_jobs.sql
--
-- Week-Prep Pipeline Hardening, §3 Cleanup. Deactivates ALL SEVEN of the
-- preseason competition's scheduled jobs — the five prep/score pollers (88, 90,
-- 91, 93, 95) and the two scoring finishers (89, 94) — once preseason week 3
-- has settled AND that settlement is shown to have produced scores.
--
-- *** DO NOT APPLY EARLY. *** As of 2026-08-25 preseason week 3 has NOT settled
-- — its last kickoff is 2026-08-29 22:00 UTC and 0 of 16 games are FINAL.
-- Retiring these jobs before then would strand the week un-scored and
-- un-finalized. The guards below enforce that: this file RAISES rather than
-- half-applying. It is safe to attempt any time; it will simply refuse until it
-- is genuinely safe.
--
-- Three guards, all outcome-based — nothing here trusts that a job "ran":
--   1. week 3 games exist at all (wrong competition / empty table)
--   2. every one of them is FINAL and is_finalized (nfl-finalize-week is done)
--   3. season_user_totals holds at least one week-3 row (the scorer actually
--      produced output). Guard 3 is what earns the right to switch off jobs 89
--      and 94: they ARE the scoring finishers, so retiring them on "the games
--      look done" would be inference. This waits for the scores themselves.
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
  v_scored    int;
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

  SELECT count(*) INTO v_scored
    FROM season_user_totals
   WHERE competition = 'nfl_2026_pre' AND season_year = 2026 AND week = 3;

  IF v_scored = 0 THEN
    RAISE EXCEPTION 'Refusing: nfl_2026_pre week 3 is FINAL but season_user_totals holds no week-3 rows — the scorer has not produced output. Jobs 89/94 are what would produce it, so they stay on. Let nfl-calculate-scores run, then re-apply.';
  END IF;

  -- Pollers first.
  PERFORM cron.alter_job(88, active := false);  -- nfl-pre-import-schedule
  PERFORM cron.alter_job(90, active := false);  -- nfl-pre-fetch-odds
  PERFORM cron.alter_job(91, active := false);  -- nfl-pre-rank-games
  PERFORM cron.alter_job(93, active := false);  -- nfl-pre-update-scores
  PERFORM cron.alter_job(95, active := false);  -- nfl-pre-consensus

  -- Scoring finishers last, now that guard 3 has shown their work is banked.
  -- Job 94 alone runs ~288 times a day; leaving it on all season is the single
  -- largest source of log noise once preseason is over.
  PERFORM cron.alter_job(89, active := false);  -- nfl-pre-finalize-week
  PERFORM cron.alter_job(94, active := false);  -- nfl-pre-calculate-scores

  RAISE NOTICE 'Retired nfl_2026_pre cron jobs 88, 89, 90, 91, 93, 94, 95 (% week-3 score rows banked).', v_scored;
END $$;

-- ---------------------------------------------------------------------------
-- Verify after applying:
--
--   SELECT jobid, jobname, schedule, active FROM cron.job
--    WHERE jobid IN (88,89,90,91,93,94,95) ORDER BY jobid;
--
-- Expect seven rows, all active = false. Any row still true means the DO block
-- raised before reaching it — read the exception, it names which guard failed.
-- ---------------------------------------------------------------------------
