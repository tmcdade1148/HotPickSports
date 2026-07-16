-- 260716_notification_queue_allow_system_and_armor_notify_week_ready.sql
--
-- Repo parity for three changes applied directly to prod on 2026-07-16.
-- ALREADY LIVE — this file records them; it does not introduce them.
-- All statements are idempotent and safe to re-run.
--
-- ===========================================================================
-- CHANGES 1 + 2 — the 'system' notification type
-- ===========================================================================
-- ROOT CAUSE (reproduced and verified in prod 2026-07-16):
-- 'system' was banned by notification_queue_type_check, so every insert of that
-- type raised 23514. Two live consequences:
--   1. notify_week_ready() fires AFTER INSERT OR UPDATE ON week_readiness and
--      reaches its notification_queue INSERT only at the moment readiness turns
--      green (all of games/odds/ranks ok + counts matched + timestamps ordered).
--      The 23514 propagated out of the AFTER trigger and aborted the statement
--      that made the row green -- i.e. nfl-rank-games' ranks stamp was rolled
--      back every time. markReadiness() wraps its upsert in try/catch, so the
--      failure was swallowed and the Tuesday chain still reported success. Net
--      effect: week_readiness could never reach green, _assert_week_ready kept
--      raising NOT_READY, and Season Control's Open Picks / Advance Week stayed
--      blocked -- silently.
--   2. espn-health-check's super-admin alert insert (notification_type='system')
--      failed silently for the same reason -- its result is never checked -- so
--      the ESPN degraded/down alarm had never delivered a push.
--
-- FIX: legalizing 'system' is the root-cause fix (change 1). Arming the nudge
-- (change 2) is defence in depth: a failed nudge must never roll back the
-- pipeline write that triggered it.
--
-- ===========================================================================
-- CHANGE 3 — nfl_2026_pre cron jobs *** TEMPORARY ***
-- ===========================================================================
-- Seven jobs created 2026-07-16 for the Aug 11 preseason window ONLY. Each is a
-- clone of its nfl_2026 counterpart with body competition='nfl_2026_pre'.
--
-- TEARDOWN AFTER SEPTEMBER — a separate migration, not this one:
--   SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname LIKE 'nfl-pre-%';
--
-- SAFETY:
--   * Inert until nfl_2026_pre.is_active flips true — every prep function checks
--     is_active and returns early (e.g. nfl-import-schedule:
--     `if (!cfg.is_active) return json({success:true, reason:"competition_inactive"})`).
--   * They target nfl_2026_pre EXCLUSIVELY and cannot touch nfl_2026 — the
--     competition is pinned in each job's body.
--
-- cron.schedule(name, schedule, command) upserts by name, so re-running this
-- file re-points the same seven jobs rather than duplicating them.

-- ---------------------------------------------------------------------------
-- Change 1 -- notification_queue type CHECK now includes 'system'.
-- ---------------------------------------------------------------------------
ALTER TABLE notification_queue DROP CONSTRAINT IF EXISTS notification_queue_type_check;
ALTER TABLE notification_queue ADD CONSTRAINT notification_queue_type_check
  CHECK (notification_type = ANY (ARRAY['picks_deadline'::text,'score_posted'::text,
  'leaderboard_change'::text,'smacktalk_mention'::text,'smacktalk_reply'::text,
  'organizer_broadcast'::text,'streak_milestone'::text,'new_member_joined'::text,
  'system'::text]));

-- ---------------------------------------------------------------------------
-- Change 2 -- notify_week_ready() is exception-armored. Same guards as the
-- 20260605230000_readiness_gate_helper.sql version; the ready_notified_at
-- UPDATE + notification_queue INSERT now sit inside BEGIN ... EXCEPTION WHEN
-- OTHERS THEN RAISE WARNING ... END, so a failed nudge logs and returns NEW
-- instead of rolling back the readiness write that fired it.
--
-- The trigger (week_readiness_notify_ready, AFTER INSERT OR UPDATE ON
-- week_readiness FOR EACH ROW) is UNCHANGED and is not re-created here.
--
-- Body transcribed from prod via pg_get_functiondef('notify_week_ready'::regproc)
-- on 2026-07-16 and pretty-printed to match this directory's style. Statements,
-- order, guards, format strings and SQLERRM handling are token-for-token
-- identical to the live definition; only whitespace differs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_week_ready()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._week_readiness_is_ready(NEW) THEN
    RETURN NEW;
  END IF;
  IF NEW.ready_notified_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND public._week_readiness_is_ready(OLD) THEN
    RETURN NEW;
  END IF;

  -- Armored: a failed nudge must never roll back the readiness write that
  -- fired this trigger (the ranks stamp). Log and carry on.
  BEGIN
    UPDATE week_readiness SET ready_notified_at = now()
     WHERE competition = NEW.competition AND week_number = NEW.week_number;

    INSERT INTO notification_queue (user_id, notification_type, title, body, status)
    SELECT p.id,
           'system',
           format('Week %s is ready to open', NEW.week_number),
           format('%s Week %s — games, odds and ranks are all set. Open picks in Season Control.',
                  NEW.competition, NEW.week_number),
           'pending'
    FROM profiles p
    WHERE p.is_super_admin = true;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_week_ready: nudge failed for % week % — pipeline write preserved: %',
      NEW.competition, NEW.week_number, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Change 3 -- the seven TEMPORARY nfl_2026_pre cron jobs (see header).
-- Commands are verbatim from cron.job as at 2026-07-16.
-- ---------------------------------------------------------------------------
SELECT cron.schedule('nfl-pre-import-schedule', '0 5 * * 2', $$ SELECT net.http_post(url := 'https://mzqtrpdiqhopjmxjccwy.supabase.co/functions/v1/nfl-import-schedule', headers := jsonb_build_object('x-cron-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_shared_secret'),'Content-Type','application/json'), body := jsonb_build_object('competition','nfl_2026_pre')); $$);

SELECT cron.schedule('nfl-pre-finalize-week', '0 6 * * 2', $$ SELECT net.http_post(url := 'https://mzqtrpdiqhopjmxjccwy.supabase.co/functions/v1/nfl-finalize-week', headers := jsonb_build_object('x-cron-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_shared_secret'),'Content-Type','application/json'), body := jsonb_build_object('competition','nfl_2026_pre')); $$);

SELECT cron.schedule('nfl-pre-fetch-odds', '0 10 * * 2', $$ SELECT net.http_post(url := 'https://mzqtrpdiqhopjmxjccwy.supabase.co/functions/v1/nfl-fetch-odds', headers := jsonb_build_object('x-cron-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_shared_secret'),'Content-Type','application/json'), body := jsonb_build_object('competition','nfl_2026_pre')); $$);

SELECT cron.schedule('nfl-pre-rank-games', '15 10 * * 2', $$ SELECT net.http_post(url := 'https://mzqtrpdiqhopjmxjccwy.supabase.co/functions/v1/nfl-rank-games', headers := jsonb_build_object('x-cron-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_shared_secret'),'Content-Type','application/json'), body := jsonb_build_object('competition','nfl_2026_pre')); $$);

SELECT cron.schedule('nfl-pre-open-picks', '0 11 * * 2', $$ SELECT net.http_post(url := 'https://mzqtrpdiqhopjmxjccwy.supabase.co/functions/v1/nfl-open-picks', headers := jsonb_build_object('x-cron-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_shared_secret'),'Content-Type','application/json'), body := jsonb_build_object('competition','nfl_2026_pre')); $$);

SELECT cron.schedule('nfl-pre-update-scores', '*/5 * * * *', $$ SELECT net.http_post(url := 'https://mzqtrpdiqhopjmxjccwy.supabase.co/functions/v1/nfl-update-scores', headers := jsonb_build_object('x-cron-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_shared_secret'),'Content-Type','application/json'), body := jsonb_build_object('competition','nfl_2026_pre')); $$);

SELECT cron.schedule('nfl-pre-calculate-scores', '*/30 * * * *', $$ SELECT net.http_post(url := 'https://mzqtrpdiqhopjmxjccwy.supabase.co/functions/v1/nfl-calculate-scores', headers := jsonb_build_object('x-cron-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_shared_secret'),'Content-Type','application/json'), body := jsonb_build_object('competition','nfl_2026_pre','auto_detect',true)); $$);
