-- Weekly Engine §6c — "Week N is ready to open" nudge (260605_HotPick_WeeklyEngine_Spec v1.0).
--
-- When a week's readiness goes ALL-GREEN, enqueue a one-time push to every
-- super-admin via the existing notification_queue (no new infra) — delivered by
-- process-notification-queue. Implemented as an AFTER INSERT/UPDATE trigger on
-- week_readiness so it fires exactly on the green transition (compares OLD vs
-- NEW), not on every prep write. Mirrors the espn-health-check super-admin
-- 'system' alert shape.
--
-- Note: the spec's "tapping opens the readiness screen" needs a client deep-link
-- route that doesn't exist yet; deep_link is omitted here (matching the existing
-- 'system' alerts) and tap-to-navigate is a client follow-up.

CREATE OR REPLACE FUNCTION public.notify_week_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_ready boolean;
  v_old_ready boolean;
BEGIN
  -- Same gate as _assert_week_ready / the §5c open gate.
  v_new_ready := (
        NEW.games_status = 'ok' AND NEW.odds_status = 'ok' AND NEW.ranks_status = 'ok'
    AND NEW.odds_count  IS NOT NULL AND NEW.odds_expected IS NOT NULL AND NEW.odds_count  = NEW.odds_expected
    AND NEW.ranks_count IS NOT NULL AND NEW.games_count   IS NOT NULL AND NEW.ranks_count = NEW.games_count
  );
  IF NOT v_new_ready THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old_ready := (
          OLD.games_status = 'ok' AND OLD.odds_status = 'ok' AND OLD.ranks_status = 'ok'
      AND OLD.odds_count  IS NOT NULL AND OLD.odds_expected IS NOT NULL AND OLD.odds_count  = OLD.odds_expected
      AND OLD.ranks_count IS NOT NULL AND OLD.games_count   IS NOT NULL AND OLD.ranks_count = OLD.games_count
    );
  ELSE
    v_old_ready := false;
  END IF;

  -- Fire only on the not-ready -> ready transition.
  IF v_old_ready THEN
    RETURN NEW;
  END IF;

  INSERT INTO notification_queue (user_id, notification_type, title, body, status)
  SELECT p.id,
         'system',
         format('Week %s is ready to open', NEW.week_number),
         format('%s Week %s — games, odds and ranks are all set. Open picks in Season Control.',
                NEW.competition, NEW.week_number),
         'pending'
  FROM profiles p
  WHERE p.is_super_admin = true;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS week_readiness_notify_ready ON public.week_readiness;
CREATE TRIGGER week_readiness_notify_ready
  AFTER INSERT OR UPDATE ON public.week_readiness
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_week_ready();
