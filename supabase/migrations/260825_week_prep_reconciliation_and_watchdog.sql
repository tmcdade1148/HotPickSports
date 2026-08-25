-- ============================================================================
-- 260825_week_prep_reconciliation_and_watchdog.sql
--
-- Week-Prep Pipeline Hardening, §9. Two changes, one idea:
--
--   1. The four nfl_2026 prep steps stop being a Tuesday single shot and become
--      an hourly Tuesday reconciliation loop.
--   2. A negative alert fires on Tuesday evening if the week still is not ready.
--
-- WHY. On 2026-08-25 the 05:00 importer returned 500 (Akamai 403) and preseason
-- week 3 could not be opened without a manual override. On the SAME morning the
-- preseason odds / rank / consensus jobs — which run every 4 hours — sailed
-- through the identical outage. The only step that failed was the only step
-- scheduled as a single shot. The self-healing pattern was already running in
-- production and already proven; it just did not cover the importer.
--
-- ORDERING. Apply this only AFTER nfl-import-schedule v29 is deployed. Under
-- v28 this migration converts one 403 per Tuesday into nineteen.
--
-- SAFE TO REPEAT, all four steps, verified against the live function bodies:
--   import    upserts on game_id, COALESCEs odds it did not fetch, and OMITS the
--             rank columns from the payload entirely (Hard Rule #6).
--   odds      updates in place.
--   rank      writes provisional `rank` only in pencil mode, and refuses
--             outright once frozen_rank is set.
--   consensus rewrites its audit blob.
-- After open_week_picks, frozen_rank is immutable and a re-import only refreshes
-- kickoff times — which is exactly what schedule flexing needs anyway.
--
-- COST: ~18 extra Odds API calls on Tuesdays. The preseason competition has run
-- 6/day for weeks without issue.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Hourly Tuesday reconciliation (05:00–23:00 UTC).
--
-- Ordered WITHIN each hour so the readiness timestamps always finish ordered.
-- _week_readiness_is_ready() requires odds_at >= games_at AND ranks_at >=
-- odds_at, so the sequence is load-bearing, not cosmetic: import :05, odds :10,
-- rank :15, consensus :25. A cycle where a middle step fails simply is not
-- ready until the next full cycle repairs it — which is the whole point.
--
-- cron.alter_job, never a direct UPDATE on cron.job (which is rejected).
--
-- Jobs 60 / 61 / 96 get a schedule change ONLY. Their commands carry embedded
-- Authorization bearer tokens; rewriting a command here would mean retyping a
-- JWT, so don't.
-- ---------------------------------------------------------------------------

-- Job 58 — nfl-import-schedule. Command IS rewritten, for one reason:
-- timeout_milliseconds. net.http_post defaults to 5000ms (12 real timeouts
-- recorded in a single 24h window on 2026-08-25), while v29's spaced attempt
-- ladder can legitimately run ~55s before it gives up. Left at the default,
-- every cron import would land in net._http_response as a bare
-- "Timeout of 5000 ms reached" with no status code and no body — destroying the
-- one place the pipeline's truth is actually visible, which is the exact
-- blindness the Aug 20 incident was about. 90s clears the worst case.
SELECT cron.alter_job(
  58,
  schedule := '5 5-23 * * 2',
  command := $cmd$
  SELECT net.http_post(
    url := 'https://mzqtrpdiqhopjmxjccwy.supabase.co/functions/v1/nfl-import-schedule',
    headers := jsonb_build_object(
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_shared_secret'),
      'Content-Type', 'application/json'),
    body := jsonb_build_object('competition','nfl_2026'),
    timeout_milliseconds := 90000);
  $cmd$);

SELECT cron.alter_job(60, schedule := '10 5-23 * * 2');  -- nfl-fetch-odds
SELECT cron.alter_job(61, schedule := '15 5-23 * * 2');  -- nfl-rank-games
SELECT cron.alter_job(96, schedule := '25 5-23 * * 2');  -- nfl-consensus-ranks

-- ---------------------------------------------------------------------------
-- 2. Prep watchdog — outcome monitoring for the Tuesday chain.
--
-- Same design principle as run_pipeline_watchdog(): monitor the OUTCOME (is the
-- week ready?), never the process (did cron say succeeded?). pg_cron reports
-- success when net.http_post merely queues; the truth lives in week_readiness.
--
-- Transition-only alerting, so a stuck week does not mail twice an evening:
-- an email goes out when the verdict CHANGES from the last one logged for that
-- (competition, week). The first sighting of an already-ready week logs a
-- silent baseline so a later regression still reads as a change. State lives in
-- system_logs — zero new tables.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION run_week_prep_watchdog(p_dry_run boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault, cron
AS $$
DECLARE
  comp      record;
  r         week_readiness%ROWTYPE;
  v_target  int;
  v_found   boolean;
  v_ready   boolean;
  v_verdict text;
  v_prev    text;
  v_changed boolean;
  v_notify  boolean;
  v_detail  text;
  v_subject text;
  v_body    text;
  v_results jsonb := '[]'::jsonb;
BEGIN
  FOR comp IN
    SELECT
      cc.competition,
      (SELECT (c2.value #>> '{}')::int FROM competition_config c2
        WHERE c2.competition = cc.competition AND c2.key = 'current_week')   AS current_week,
      (SELECT  c3.value #>> '{}'        FROM competition_config c3
        WHERE c3.competition = cc.competition AND c3.key = 'week_state')     AS week_state,
      (SELECT  c4.value #>> '{}'        FROM competition_config c4
        WHERE c4.competition = cc.competition AND c4.key = 'current_phase')  AS current_phase
    FROM competition_config cc
    WHERE cc.key = 'is_active' AND cc.value = 'true'::jsonb
      AND EXISTS (SELECT 1 FROM competition_config c5
        WHERE c5.competition = cc.competition AND c5.key = 'data_provider'
          AND c5.value = '"espn"'::jsonb)
  LOOP
    -- Which week SHOULD be ready? This reproduces deriveWeek() from the prep
    -- Edge Functions line for line, deliberately. The watchdog's question is
    -- "did the chain that was supposed to run, work?", so it has to target the
    -- same week the chain targets — including the phase test, which is here to
    -- mirror deriveWeek's own early return, NOT to ask whether a week is
    -- running (Hard Rule #22 corollary: week_state answers that, and it does,
    -- below).
    --
    -- The spec's condition (alert only while week_state is settling/complete)
    -- would have skipped Tuesday Sept 1 entirely: nfl_2026 sits at week_state
    -- 'idle' with current_week 1, so the single most launch-critical prep
    -- Tuesday of the season would go unwatched. Mirroring deriveWeek covers it.
    CONTINUE WHEN comp.current_week IS NULL OR comp.current_week = 0;
    CONTINUE WHEN COALESCE(comp.current_phase, '') NOT IN ('REGULAR', 'PLAYOFFS', 'SUPERBOWL');

    v_target := CASE
      WHEN comp.week_state IN ('settling', 'complete') THEN comp.current_week + 1
      ELSE comp.current_week
    END;

    SELECT * INTO r FROM week_readiness
     WHERE competition = comp.competition AND week_number = v_target;
    v_found := FOUND;

    IF NOT v_found THEN
      v_ready  := false;
      v_detail := 'no week_readiness row — the import step has never written one for this week';
    ELSE
      v_ready  := public._week_readiness_is_ready(r);
      -- Names which slice failed, in the same shape _assert_week_ready reports.
      v_detail := format('games=%s (%s), odds=%s/%s (%s), ranks=%s/%s (%s)',
        COALESCE(r.games_count::text, '-'),   r.games_status,
        COALESCE(r.odds_count::text, '-'),    COALESCE(r.odds_expected::text, '-'), r.odds_status,
        COALESCE(r.ranks_count::text, '-'),   COALESCE(r.games_count::text, '-'),   r.ranks_status);
    END IF;

    v_verdict := CASE WHEN v_ready THEN 'ready' ELSE 'not_ready' END;

    SELECT sl.event_data ->> 'verdict' INTO v_prev
      FROM system_logs sl
     WHERE sl.event_type = 'week_prep_watchdog'
       AND sl.event_data ->> 'competition' = comp.competition
       AND (sl.event_data ->> 'week')::int = v_target
     ORDER BY sl.created_at DESC
     LIMIT 1;

    v_changed := v_prev IS DISTINCT FROM v_verdict;
    -- First sighting of a healthy week is a baseline, not news.
    v_notify  := v_changed AND NOT (v_prev IS NULL AND v_ready);

    v_results := v_results || jsonb_build_object(
      'competition',      comp.competition,
      'week',             v_target,
      'week_state',       comp.week_state,
      'is_ready',         v_ready,
      'detail',           v_detail,
      'previous_verdict', v_prev,
      'would_email',      v_notify);

    CONTINUE WHEN p_dry_run OR NOT v_changed;

    IF v_notify AND NOT v_ready THEN
      v_subject := format('[NOT READY] HotPick week prep: %s week %s', comp.competition, v_target);
      v_body := 'Competition: ' || comp.competition
        || E'\nWeek that should be ready: ' || v_target
        || E'\nCurrent week_state: ' || COALESCE(comp.week_state, 'unknown')
        || E'\nReadiness: ' || v_detail
        || E'\n\nPicks for this week cannot be opened until every slice reads ok.'
        || E'\nThe hourly Tuesday chain (import :05, odds :10, rank :15, consensus :25)'
        || E'\nwill keep retrying until 23:00 UTC on its own.'
        || E'\n\nFirst diagnostic (Claude can run it):'
        || E'\nselect created, status_code, left(content,300) from net._http_response order by created desc limit 20;';
    ELSIF v_notify THEN
      v_subject := format('[READY] HotPick week prep: %s week %s', comp.competition, v_target);
      v_body := 'Competition: ' || comp.competition
        || E'\nWeek: ' || v_target
        || E'\nReadiness: ' || v_detail
        || E'\n\nThe chain repaired itself — no action needed. Open picks when you are ready.';
    END IF;

    IF v_notify THEN
      PERFORM net.http_post(
        url := 'https://mzqtrpdiqhopjmxjccwy.supabase.co/functions/v1/ops-alert',
        headers := jsonb_build_object(
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret'),
          'Content-Type', 'application/json'),
        body := jsonb_build_object('subject', v_subject, 'body_text', v_body));
    END IF;

    INSERT INTO system_logs (event_type, event_data)
    VALUES ('week_prep_watchdog', jsonb_build_object(
      'verdict',     v_verdict,
      'competition', comp.competition,
      'week',        v_target,
      'week_state',  comp.week_state,
      'detail',      v_detail,
      'emailed',     v_notify));
  END LOOP;

  RETURN jsonb_build_object('checked_at', now(), 'dry_run', p_dry_run, 'competitions', v_results);
END;
$$;

REVOKE EXECUTE ON FUNCTION run_week_prep_watchdog(boolean) FROM PUBLIC, anon, authenticated;

-- Tuesday 18:00 and 22:00 UTC. ONE cron entry, not two: same function, same
-- arguments, and a single job is one thing to find and one thing to disable.
SELECT cron.schedule('week-prep-watchdog', '0 18,22 * * 2', $$SELECT run_week_prep_watchdog();$$);
