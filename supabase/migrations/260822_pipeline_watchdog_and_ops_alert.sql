-- ============================================================================
-- 260822_pipeline_watchdog_and_ops_alert.sql
--
-- GIT SYNC of already-applied production state -- DO NOT re-apply unless
-- rebuilding the project from scratch. Everything here is live in production
-- as of 2026-08-22 (applied via MCP migrations:
--   create_pipeline_watchdog_outcome_monitoring,
--   watchdog_only_monitor_espn_fed_competitions,
--   set_ops_alert_email_to_admin_address).
-- The file is idempotent (IF NOT EXISTS / OR REPLACE / ON CONFLICT), so an
-- accidental re-run is harmless.
--
-- PIPELINE WATCHDOG -- outcome-based freshness monitoring.
-- Born from 2026-08-20/21: the ESPN scoring pipeline died twice (12h of 403s,
-- then empty-body responses) while every layer reported success. pg_cron said
-- "succeeded" (net.http_post only queues), functions returned 200, the old
-- espn-health-check alerted into an undelivered push queue.
--
-- This watchdog checks the OUTCOME, not the process: if any game in a
-- monitored competition's current week is past kickoff and not FINAL, and no
-- season_games row for that week has been written within the threshold,
-- something is wrong -- regardless of what any job or function claims.
--
-- Scope: only competitions with data_provider = 'espn' (mirrors
-- nfl-import-schedule's guard). Sim/demo sandboxes are operator-driven and sit
-- "stale" between sessions by design -- monitoring them produces false alarms
-- (observed on the first real pass, nfl_2025_sim).
--
-- Alerts fire on TRANSITIONS only (fresh->stale, stale->fresh) with a 6h
-- reminder while stale -- never the 222-duplicate pattern of the old health
-- check. Delivery = email via the ops-alert Edge Function (Resend), NOT the
-- app's push pipeline (that is the system being monitored). Every transition
-- also lands in system_logs as a trail independent of email delivery.
-- scoring_locked=true suppresses alerts: an intentional pause is not an
-- incident.
-- ============================================================================

INSERT INTO competition_config (competition, key, value, description)
VALUES
  ('global', 'ops_alert_email', '"admin@hotpicksports.com"'::jsonb,
   'Recipient for pipeline watchdog / ops alerts (ops-alert Edge Function). Monitored business address -- must be somewhere alerts are actually seen.'),
  ('global', 'watchdog_stale_minutes', '15'::jsonb,
   'Minutes without a season_games write (while games are in flight) before the pipeline is declared stale. 15 = tolerates ~2 consecutive failed 5-min ticks; tighten to 12 now that nfl-update-scores has retry logic (PR: fix/update-scores-retry).')
ON CONFLICT (competition, key) DO NOTHING;

CREATE TABLE IF NOT EXISTS pipeline_watchdog_state (
  competition   text PRIMARY KEY,
  is_stale      boolean NOT NULL DEFAULT false,
  stale_since   timestamptz,
  last_alert_at timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE pipeline_watchdog_state ENABLE ROW LEVEL SECURITY;
-- No policies: SECURITY DEFINER access only. Clients never touch this table.

CREATE OR REPLACE FUNCTION run_pipeline_watchdog(p_force_test boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault, cron
AS $$
DECLARE
  comp            record;
  v_now           timestamptz := now();
  v_threshold_min int;
  v_games_due     int;
  v_last_write    timestamptz;
  v_is_stale      boolean;
  v_prev          record;
  v_action        text;
  v_stale_mins    numeric;
  v_subject       text;
  v_body          text;
  v_results       jsonb := '[]'::jsonb;
BEGIN
  SELECT COALESCE((value #>> '{}')::int, 15) INTO v_threshold_min
  FROM competition_config
  WHERE competition = 'global' AND key = 'watchdog_stale_minutes';
  v_threshold_min := COALESCE(v_threshold_min, 15);

  IF p_force_test THEN
    PERFORM net.http_post(
      url := 'https://mzqtrpdiqhopjmxjccwy.supabase.co/functions/v1/ops-alert',
      headers := jsonb_build_object(
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret'),
        'Content-Type', 'application/json'),
      body := jsonb_build_object(
        'subject', 'HotPick watchdog armed (test)',
        'body_text',
          'This is a live test of the pipeline watchdog delivery chain: '
          || 'Postgres -> ops-alert -> Resend -> this inbox. '
          || 'Threshold: ' || v_threshold_min || ' minutes. Checked every 5 minutes. '
          || 'You will only hear from it again on a real staleness transition, '
          || 'a 6-hour reminder while stale, or recovery.'));
    RETURN jsonb_build_object('test_alert_sent', true, 'threshold_minutes', v_threshold_min);
  END IF;

  FOR comp IN
    SELECT
      cc.competition,
      (SELECT (c2.value #>> '{}')::int FROM competition_config c2
        WHERE c2.competition = cc.competition AND c2.key = 'current_week') AS current_week,
      EXISTS (SELECT 1 FROM competition_config c3
        WHERE c3.competition = cc.competition AND c3.key = 'scoring_locked'
          AND c3.value = 'true'::jsonb) AS scoring_locked
    FROM competition_config cc
    WHERE cc.key = 'is_active' AND cc.value = 'true'::jsonb
      AND EXISTS (SELECT 1 FROM competition_config c4
        WHERE c4.competition = cc.competition AND c4.key = 'data_provider'
          AND c4.value = '"espn"'::jsonb)
  LOOP
    CONTINUE WHEN comp.current_week IS NULL;

    -- Outcome check. Case-insensitive status per repo convention (sim rows are
    -- lowercase). Freshness = the newest write across the whole current week:
    -- any write proves the pipeline is alive.
    SELECT
      COUNT(*) FILTER (WHERE g.kickoff_at <= v_now AND upper(g.status) <> 'FINAL'),
      MAX(g.updated_at)
    INTO v_games_due, v_last_write
    FROM season_games g
    WHERE g.competition = comp.competition AND g.week = comp.current_week;

    v_is_stale := v_games_due > 0
      AND NOT comp.scoring_locked
      AND (v_last_write IS NULL
           OR v_last_write < v_now - make_interval(mins => v_threshold_min));

    SELECT * INTO v_prev FROM pipeline_watchdog_state WHERE competition = comp.competition;

    v_action := CASE
      WHEN v_is_stale AND (v_prev IS NULL OR NOT v_prev.is_stale) THEN 'alert_stale'
      WHEN v_is_stale AND v_prev.is_stale
           AND v_prev.last_alert_at < v_now - interval '6 hours' THEN 'realert'
      WHEN NOT v_is_stale AND v_prev IS NOT NULL AND v_prev.is_stale THEN 'alert_recovered'
      ELSE 'none'
    END;

    IF v_action IN ('alert_stale', 'realert') THEN
      v_stale_mins := round(EXTRACT(epoch FROM (v_now - COALESCE(v_last_write, COALESCE(v_prev.stale_since, v_now))))/60);
      v_subject := '[STALE] HotPick pipeline: ' || comp.competition
                   || ' -- no writes for ' || v_stale_mins || ' min';
      v_body := 'Competition: ' || comp.competition
        || E'\nWeek: ' || comp.current_week
        || E'\nGames past kickoff and not FINAL: ' || v_games_due
        || E'\nLast season_games write: ' || COALESCE(v_last_write::text, 'never')
        || E'\nStale threshold: ' || v_threshold_min || ' min'
        || E'\n\nScores in the app are frozen. The scheduled jobs may still be reporting success -- that is why this watchdog exists.'
        || E'\n\nFirst diagnostic (Claude can run it):'
        || E'\nselect created, status_code, left(content,200) from net._http_response order by created desc limit 10;';
    ELSIF v_action = 'alert_recovered' THEN
      v_stale_mins := round(EXTRACT(epoch FROM (v_now - COALESCE(v_prev.stale_since, v_now)))/60);
      v_subject := '[RECOVERED] HotPick pipeline: ' || comp.competition
                   || ' -- fresh again after ' || v_stale_mins || ' min';
      v_body := 'Competition: ' || comp.competition
        || E'\nStale since: ' || COALESCE(v_prev.stale_since::text, 'unknown')
        || E'\nLast write: ' || COALESCE(v_last_write::text, 'unknown')
        || E'\n\nNo action needed. Worth asking Claude what the gap was.';
    END IF;

    IF v_action <> 'none' THEN
      PERFORM net.http_post(
        url := 'https://mzqtrpdiqhopjmxjccwy.supabase.co/functions/v1/ops-alert',
        headers := jsonb_build_object(
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret'),
          'Content-Type', 'application/json'),
        body := jsonb_build_object('subject', v_subject, 'body_text', v_body));

      INSERT INTO system_logs (event_type, event_data)
      VALUES ('pipeline_watchdog', jsonb_build_object(
        'action', v_action,
        'competition', comp.competition,
        'week', comp.current_week,
        'games_due', v_games_due,
        'last_write', v_last_write,
        'threshold_minutes', v_threshold_min));
    END IF;

    INSERT INTO pipeline_watchdog_state (competition, is_stale, stale_since, last_alert_at, updated_at)
    VALUES (
      comp.competition,
      v_is_stale,
      CASE WHEN v_is_stale THEN COALESCE(v_prev.stale_since, v_now) END,
      CASE WHEN v_action <> 'none' THEN v_now ELSE v_prev.last_alert_at END,
      v_now)
    ON CONFLICT (competition) DO UPDATE SET
      is_stale      = EXCLUDED.is_stale,
      stale_since   = EXCLUDED.stale_since,
      last_alert_at = COALESCE(EXCLUDED.last_alert_at, pipeline_watchdog_state.last_alert_at),
      updated_at    = EXCLUDED.updated_at;

    v_results := v_results || jsonb_build_object(
      'competition', comp.competition,
      'week', comp.current_week,
      'games_due', v_games_due,
      'last_write', v_last_write,
      'is_stale', v_is_stale,
      'action', v_action);
  END LOOP;

  -- Clear lingering state rows for competitions no longer monitored so they
  -- cannot confuse future transition logic.
  DELETE FROM pipeline_watchdog_state s
  WHERE NOT EXISTS (
    SELECT 1 FROM competition_config cc
    WHERE cc.competition = s.competition AND cc.key = 'data_provider'
      AND cc.value = '"espn"'::jsonb);

  RETURN jsonb_build_object('checked_at', v_now, 'threshold_minutes', v_threshold_min, 'competitions', v_results);
END;
$$;

REVOKE EXECUTE ON FUNCTION run_pipeline_watchdog(boolean) FROM PUBLIC, anon, authenticated;

-- Every 5 minutes at :03/:08/... -- offset so it observes AFTER the :00/:01
-- score ticks and the :02 calculate tick have had their chance to write.
SELECT cron.schedule('pipeline-watchdog', '3-59/5 * * * *', $$SELECT run_pipeline_watchdog();$$);

-- espn-health-check (cron job 70) retired 2026-08-22: it monitored the
-- abandoned site.api.espn.com host (false "down" every hour since the Aug 21
-- host swap) and delivered into notification_queue, whose push delivery is
-- unproven -- the 222-identical-alerts incident. Superseded by this watchdog.
-- Re-enable if ever needed: SELECT cron.alter_job(70, active := true);
SELECT cron.alter_job(70, active := false);
