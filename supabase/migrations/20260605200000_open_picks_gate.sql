-- Weekly Engine §5c — the open-picks readiness gate (260605_HotPick_WeeklyEngine_Spec v1.0).
--
-- Decision (Option 1): the gate lives INSIDE admin_advance_week (the locked single
-- clock-owner, §2), and a sibling open_week_picks handles the Week-1 initial open
-- WITHOUT incrementing the clock. Both paths call the SAME gate helper
-- (_assert_week_ready) — there is exactly one gate, no second ungated way to open —
-- and both write admin_audit_log BEFORE any state change (Hard Rule #17).
--
-- "Open mechanics" = lock each game at its own kickoff (lock_at = kickoff_at) and
-- clear picks_locked. ESPN polling still owns scores; this only opens the week.

-- ---------------------------------------------------------------------------
-- Shared gate. Raises NOT_READY unless every readiness check is green AND the
-- counts line up (odds_count = odds_expected, ranks_count = games_count).
-- NULL counts are treated as not-ready (COALESCE guard). Internal helper —
-- not granted to clients; the SECURITY DEFINER callers invoke it as owner.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._assert_week_ready(p_competition text, p_week int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r       week_readiness%ROWTYPE;
  v_ready boolean;
BEGIN
  SELECT * INTO r FROM week_readiness
   WHERE competition = p_competition AND week_number = p_week;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_READY: no readiness row for % week % — run the prep steps (import/odds/rank) first', p_competition, p_week
      USING ERRCODE = '23514';
  END IF;

  v_ready := (
        r.games_status = 'ok' AND r.odds_status = 'ok' AND r.ranks_status = 'ok'
    AND r.odds_count  IS NOT NULL AND r.odds_expected IS NOT NULL AND r.odds_count  = r.odds_expected
    AND r.ranks_count IS NOT NULL AND r.games_count   IS NOT NULL AND r.ranks_count = r.games_count
  );

  IF NOT COALESCE(v_ready, false) THEN
    RAISE EXCEPTION 'NOT_READY: % week % — games=% (%), odds=%/% (%), ranks=%/% (%)',
      p_competition, p_week,
      r.games_count, r.games_status,
      r.odds_count, r.odds_expected, r.odds_status,
      r.ranks_count, r.games_count, r.ranks_status
      USING ERRCODE = '23514';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public._assert_week_ready(text, int) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- admin_advance_week v2 — now gates on the NEW week's readiness and runs the
-- open mechanics. Otherwise unchanged from §5a: super-admin only, advance guard
-- (old week all-FINAL), bound at max week, audit first, atomic state writes,
-- phase deferred to admin_advance_season_phase.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_advance_week(
  p_competition        text,
  p_next_picks_open_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller         uuid := auth.uid();
  v_is_super       boolean;
  v_current_week   int;
  v_current_phase  text;
  v_season_year    int;
  v_phases         jsonb;
  v_max_week       int;
  v_new_week       int;
  v_total          int;
  v_not_final      int;
  v_not_finalized  int;
  v_from_phase     text;
  v_to_phase       text;
  v_phase_crossed  boolean;
  v_next_open      timestamptz;
BEGIN
  -- 1. Super-admin only.
  SELECT is_super_admin INTO v_is_super FROM profiles WHERE id = v_caller;
  IF NOT COALESCE(v_is_super, false) THEN
    RAISE EXCEPTION 'Not authorized: super admin only' USING ERRCODE = '42501';
  END IF;

  -- 2. Read clock + phase config.
  SELECT (value #>> '{}')::int INTO v_current_week
    FROM competition_config WHERE competition = p_competition AND key = 'current_week';
  SELECT  value #>> '{}'       INTO v_current_phase
    FROM competition_config WHERE competition = p_competition AND key = 'current_phase';
  SELECT (value #>> '{}')::int INTO v_season_year
    FROM competition_config WHERE competition = p_competition AND key = 'season_year';
  SELECT  value               INTO v_phases
    FROM competition_config WHERE competition = p_competition AND key = 'phases';

  IF v_current_week IS NULL OR v_season_year IS NULL THEN
    RAISE EXCEPTION 'Unknown or unconfigured competition: %', p_competition;
  END IF;

  -- 3. ADVANCE GUARD — the current week must be genuinely done.
  SELECT count(*),
         count(*) FILTER (WHERE status NOT ILIKE '%final%'),
         count(*) FILTER (WHERE is_finalized = false)
    INTO v_total, v_not_final, v_not_finalized
    FROM season_games
   WHERE competition = p_competition
     AND season_year = v_season_year
     AND week        = v_current_week;

  IF v_total = 0 OR v_not_final > 0 OR v_not_finalized > 0 THEN
    RAISE EXCEPTION
      'WEEK_NOT_COMPLETE: week % of % is not fully final/finalized (games=%, not_final=%, not_finalized=%)',
      v_current_week, p_competition, v_total, v_not_final, v_not_finalized
      USING ERRCODE = '23514';
  END IF;

  -- 4. Compute the new week, bounded by the season's last week.
  SELECT COALESCE(max((p->>'weekEnd')::int), 22) INTO v_max_week
    FROM jsonb_array_elements(COALESCE(v_phases, '[]'::jsonb)) p;

  v_new_week := v_current_week + 1;
  IF v_new_week > v_max_week THEN
    RAISE EXCEPTION
      'SEASON_ENDED: week % exceeds final week % for %. Use admin_advance_season_phase.',
      v_new_week, v_max_week, p_competition
      USING ERRCODE = '23514';
  END IF;

  -- 4b. READINESS GATE (§5c) — the NEW week's data must be all-green before picks
  --     open. Shared with open_week_picks; raises NOT_READY otherwise. Checked
  --     BEFORE the audit so failed attempts are not logged as advances.
  PERFORM _assert_week_ready(p_competition, v_new_week);

  -- Phase awareness (read-only).
  SELECT p->>'name' INTO v_from_phase
    FROM jsonb_array_elements(COALESCE(v_phases, '[]'::jsonb)) p
   WHERE v_current_week BETWEEN (p->>'weekStart')::int AND (p->>'weekEnd')::int
   LIMIT 1;
  SELECT p->>'name' INTO v_to_phase
    FROM jsonb_array_elements(COALESCE(v_phases, '[]'::jsonb)) p
   WHERE v_new_week BETWEEN (p->>'weekStart')::int AND (p->>'weekEnd')::int
   LIMIT 1;
  v_phase_crossed := (v_to_phase IS DISTINCT FROM v_from_phase);

  -- next_picks_open_at: caller-supplied wins; else next 11:00 UTC at/after now().
  IF p_next_picks_open_at IS NOT NULL THEN
    v_next_open := p_next_picks_open_at;
  ELSE
    v_next_open := date_trunc('day', now() AT TIME ZONE 'UTC') + interval '11 hours';
    IF v_next_open < now() THEN
      v_next_open := v_next_open + interval '1 day';
    END IF;
  END IF;

  -- 5. Audit FIRST (Hard Rule #17). Sandbox sim exempt.
  IF p_competition <> 'nfl_2025_sim' THEN
    INSERT INTO admin_audit_log (admin_id, action, target_table, target_id, metadata)
    VALUES (v_caller, 'WEEK_ADVANCED', 'competition_config', v_caller,
            jsonb_build_object(
              'competition', p_competition,
              'from_week', v_current_week,
              'to_week', v_new_week,
              'next_picks_open_at', v_next_open,
              'phase_boundary_crossed', v_phase_crossed));
  END IF;

  -- 6. Atomic state writes — current_week, week_state, next_picks_open_at.
  UPDATE competition_config SET value = to_jsonb(v_new_week)
    WHERE competition = p_competition AND key = 'current_week';
  UPDATE competition_config SET value = to_jsonb('picks_open'::text)
    WHERE competition = p_competition AND key = 'week_state';
  UPDATE competition_config SET value = to_jsonb(v_next_open)
    WHERE competition = p_competition AND key = 'next_picks_open_at';

  -- 6b. Open mechanics (§5c) — lock each new-week game at its own kickoff; clear
  --     the lock flag. ESPN polling still owns scores.
  UPDATE season_games SET lock_at = kickoff_at
    WHERE competition = p_competition AND season_year = v_season_year AND week = v_new_week;
  UPDATE competition_config SET value = to_jsonb(false)
    WHERE competition = p_competition AND key = 'picks_locked';

  -- 8. Return.
  RETURN jsonb_build_object(
    'success', true,
    'competition', p_competition,
    'from_week', v_current_week,
    'to_week', v_new_week,
    'week_state', 'picks_open',
    'next_picks_open_at', v_next_open,
    'phase_boundary_crossed', v_phase_crossed,
    'phase_hint', CASE WHEN v_phase_crossed
      THEN format('New week is in phase "%s" (was "%s"). Run admin_advance_season_phase to advance the phase.',
                  v_to_phase, v_from_phase)
      ELSE NULL END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_advance_week(text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_advance_week(text, timestamptz) TO authenticated;

-- ---------------------------------------------------------------------------
-- open_week_picks — the Week-1 initial open (and recovery re-open of the CURRENT
-- week). Does NOT increment the clock. Shares the exact same gate + audit-first
-- discipline as the advance path.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_week_picks(p_competition text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller       uuid := auth.uid();
  v_is_super     boolean;
  v_current_week int;
  v_season_year  int;
BEGIN
  -- Super-admin only.
  SELECT is_super_admin INTO v_is_super FROM profiles WHERE id = v_caller;
  IF NOT COALESCE(v_is_super, false) THEN
    RAISE EXCEPTION 'Not authorized: super admin only' USING ERRCODE = '42501';
  END IF;

  SELECT (value #>> '{}')::int INTO v_current_week
    FROM competition_config WHERE competition = p_competition AND key = 'current_week';
  SELECT (value #>> '{}')::int INTO v_season_year
    FROM competition_config WHERE competition = p_competition AND key = 'season_year';
  IF v_current_week IS NULL OR v_season_year IS NULL THEN
    RAISE EXCEPTION 'Unknown or unconfigured competition: %', p_competition;
  END IF;

  -- Same gate as the advance path — never an ungated open.
  PERFORM _assert_week_ready(p_competition, v_current_week);

  -- Audit FIRST (Hard Rule #17). Sandbox sim exempt.
  IF p_competition <> 'nfl_2025_sim' THEN
    INSERT INTO admin_audit_log (admin_id, action, target_table, target_id, metadata)
    VALUES (v_caller, 'WEEK_PICKS_OPENED', 'competition_config', v_caller,
            jsonb_build_object('competition', p_competition, 'week', v_current_week));
  END IF;

  -- Open: state + mechanics. No clock increment.
  UPDATE competition_config SET value = to_jsonb('picks_open'::text)
    WHERE competition = p_competition AND key = 'week_state';
  UPDATE competition_config SET value = to_jsonb(false)
    WHERE competition = p_competition AND key = 'picks_locked';
  UPDATE season_games SET lock_at = kickoff_at
    WHERE competition = p_competition AND season_year = v_season_year AND week = v_current_week;

  RETURN jsonb_build_object(
    'success', true,
    'competition', p_competition,
    'week', v_current_week,
    'week_state', 'picks_open'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.open_week_picks(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_week_picks(text) TO authenticated;
