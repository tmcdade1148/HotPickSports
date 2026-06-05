-- Weekly Engine cleanup — single source of truth for the readiness gate
-- (addresses code-review #7 gate duplication + #5 nudge re-fire).
--
-- Before: the all-green gate boolean was hand-written in _assert_week_ready and
-- twice inside notify_week_ready (NEW/OLD). Now there is ONE IMMUTABLE helper,
-- _week_readiness_is_ready(week_readiness), that both call — no drift.
--
-- Also adds week_readiness.ready_notified_at so the "week ready" nudge fires
-- exactly once per (competition, week), even if readiness flaps red->green->red
-- ->green across prep re-runs.

-- 1. Dedupe column for the nudge.
ALTER TABLE public.week_readiness
  ADD COLUMN IF NOT EXISTS ready_notified_at timestamptz;

-- 2. The single gate. Pure function of the row (IMMUTABLE). Internal only.
CREATE OR REPLACE FUNCTION public._week_readiness_is_ready(r public.week_readiness)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT r.games_status = 'ok' AND r.odds_status = 'ok' AND r.ranks_status = 'ok'
     AND r.odds_count  IS NOT NULL AND r.odds_expected IS NOT NULL AND r.odds_count  = r.odds_expected
     AND r.ranks_count IS NOT NULL AND r.games_count   IS NOT NULL AND r.ranks_count = r.games_count;
$function$;

REVOKE ALL ON FUNCTION public._week_readiness_is_ready(public.week_readiness) FROM PUBLIC;

-- 3. _assert_week_ready now delegates the boolean to the helper; keeps its
--    detailed NOT_READY message for the open/advance paths.
CREATE OR REPLACE FUNCTION public._assert_week_ready(p_competition text, p_week int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r week_readiness%ROWTYPE;
BEGIN
  SELECT * INTO r FROM week_readiness
   WHERE competition = p_competition AND week_number = p_week;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_READY: no readiness row for % week % — run the prep steps (import/odds/rank) first', p_competition, p_week
      USING ERRCODE = '23514';
  END IF;

  IF NOT public._week_readiness_is_ready(r) THEN
    RAISE EXCEPTION 'NOT_READY: % week % — games=% (%), odds=%/% (%), ranks=%/% (%)',
      p_competition, p_week,
      r.games_count, r.games_status,
      r.odds_count, r.odds_expected, r.odds_status,
      r.ranks_count, r.games_count, r.ranks_status
      USING ERRCODE = '23514';
  END IF;
END;
$function$;

-- 4. notify_week_ready: same helper, plus once-per-week dedupe via
--    ready_notified_at. Stamps before enqueuing; the stamping UPDATE re-enters
--    the trigger but the ready_notified_at guard short-circuits it.
CREATE OR REPLACE FUNCTION public.notify_week_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Not green yet, or already nudged for this week -> nothing to do.
  IF NOT public._week_readiness_is_ready(NEW) THEN
    RETURN NEW;
  END IF;
  IF NEW.ready_notified_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  -- Fire only on the not-ready -> ready transition.
  IF TG_OP = 'UPDATE' AND public._week_readiness_is_ready(OLD) THEN
    RETURN NEW;
  END IF;

  -- Stamp first so a re-fire / concurrent write can't double-send.
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

  RETURN NEW;
END;
$function$;
