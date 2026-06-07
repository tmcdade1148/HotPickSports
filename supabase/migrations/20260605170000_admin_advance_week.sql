-- Phase 1 of the Production Weekly Engine — 260605_HotPick_WeeklyEngine_Spec v1.0 (§5a).
--
-- admin_advance_week is the SINGLE production owner of the weekly clock. It advances
-- current_week by exactly 1, opens picks for the new week (week_state = 'picks_open'),
-- and writes the rolling next_picks_open_at — all in one atomic, super-admin-gated,
-- audited call, guarded so it refuses to advance unless the current week is genuinely
-- complete.
--
-- It writes STATE ONLY. It never touches season_picks, season_games, or
-- season_user_totals — those are simulator behaviours and stay out of production
-- (Hard Rule #3; spec §8 Red Flag 1). Phase transitions (REGULAR -> PLAYOFFS, etc.)
-- are NOT done here — they remain admin_advance_season_phase's job (spec §5a step 7);
-- this RPC only reports whether the new week crosses a phase boundary.
--
-- Deliberately parallel to admin_advance_season_phase (different ownership: phase vs
-- weekly clock), mirroring its auth + audit shape.

-- ---------------------------------------------------------------------------
-- §4a — ensure the rolling-clock config keys exist (idempotent; descriptions
-- required by the guardrail). season_picks_open_at (§4b correction) and the
-- week_readiness table (§4c) are intentionally NOT in this migration.
-- ---------------------------------------------------------------------------
INSERT INTO competition_config (competition, key, value, description) VALUES
  ('nfl_2026', 'next_picks_open_at', to_jsonb('2026-09-02T11:00:00Z'::text),
   'Rolling timestamp: when the NEXT week''s picks open (7am ET / 11:00 UTC during football season). Written atomically by admin_advance_week. Drives the welcome toast + live-week countdown.'),
  ('nfl_2026', 'open_picks_mode', to_jsonb('manual'::text),
   'manual | auto. Production (nfl_2026) is manual and enforced server-side. Sim may be auto. Flip allowed only when week_state=complete.')
ON CONFLICT (competition, key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- §5a — the RPC
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

  -- 2. Read the clock + phase config for the passed competition (never hardcoded).
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

  -- 3. ADVANCE GUARD — the current week must be genuinely done: games exist, every
  --    one is FINAL, and every one is finalized. Mirrors finalize_latest_completed_week.
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

  -- 4. Compute the new week, bounded by the season's last week (max weekEnd from the
  --    canonical phases config; fallback 22). Phase transition past the end is handled
  --    by admin_advance_season_phase, not here.
  SELECT COALESCE(max((p->>'weekEnd')::int), 22) INTO v_max_week
    FROM jsonb_array_elements(COALESCE(v_phases, '[]'::jsonb)) p;

  v_new_week := v_current_week + 1;
  IF v_new_week > v_max_week THEN
    RAISE EXCEPTION
      'SEASON_ENDED: week % exceeds final week % for %. Use admin_advance_season_phase.',
      v_new_week, v_max_week, p_competition
      USING ERRCODE = '23514';
  END IF;

  -- Phase awareness (read-only): does the new week cross into a different phase?
  -- We DO NOT write current_phase here (spec §5a step 7) — only report it.
  SELECT p->>'name' INTO v_from_phase
    FROM jsonb_array_elements(COALESCE(v_phases, '[]'::jsonb)) p
   WHERE v_current_week BETWEEN (p->>'weekStart')::int AND (p->>'weekEnd')::int
   LIMIT 1;
  SELECT p->>'name' INTO v_to_phase
    FROM jsonb_array_elements(COALESCE(v_phases, '[]'::jsonb)) p
   WHERE v_new_week BETWEEN (p->>'weekStart')::int AND (p->>'weekEnd')::int
   LIMIT 1;
  v_phase_crossed := (v_to_phase IS DISTINCT FROM v_from_phase);

  -- next_picks_open_at: a caller-supplied value wins (the admin screen can derive the
  -- exact schedule-anchored time and pass it). Otherwise default to the next 11:00:00
  -- UTC (= 7am ET in football season) at or after now().
  -- NOTE: the precise date-derivation rule is the one open item in §5a — see the
  -- migration commit message / spec for the decision still to confirm.
  IF p_next_picks_open_at IS NOT NULL THEN
    v_next_open := p_next_picks_open_at;
  ELSE
    v_next_open := date_trunc('day', now() AT TIME ZONE 'UTC') + interval '11 hours';
    IF v_next_open < now() THEN
      v_next_open := v_next_open + interval '1 day';
    END IF;
  END IF;

  -- 5. Audit FIRST (Hard Rule #17), before any state change. Sandbox sim is exempt,
  --    consistent with the rule and admin_advance_season_phase.
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

  -- 6. Atomic state writes — current_week, week_state, next_picks_open_at. State only.
  UPDATE competition_config SET value = to_jsonb(v_new_week)
    WHERE competition = p_competition AND key = 'current_week';
  UPDATE competition_config SET value = to_jsonb('picks_open'::text)
    WHERE competition = p_competition AND key = 'week_state';
  UPDATE competition_config SET value = to_jsonb(v_next_open)
    WHERE competition = p_competition AND key = 'next_picks_open_at';

  -- 8. Return success + the phase hint (so the admin UI can prompt to run the phase
  --    tool when a boundary is crossed).
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

-- Lock execution down. The body self-checks super_admin, but revoke the default
-- PUBLIC grant as defence in depth and grant only to authenticated.
REVOKE ALL ON FUNCTION public.admin_advance_week(text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_advance_week(text, timestamptz) TO authenticated;
