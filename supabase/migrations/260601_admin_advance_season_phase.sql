-- Super-admin "advance the season" action. Sets a competition's current_phase
-- (+ week_state / picks_open / is_season_complete to match), server-side and
-- audited, instead of hand-editing the database. Setting REGULAR_COMPLETE here
-- fires the announce_regular_winners trigger automatically. Mirrors the proven
-- simulator setPhaseOnly behaviour; the weekly cycle (nfl-open-picks) still
-- owns opening a specific week's picks.
CREATE OR REPLACE FUNCTION public.admin_advance_season_phase(
  p_competition text,
  p_phase text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller     uuid := auth.uid();
  v_is_super   boolean;
  v_current    text;
  v_week_state text;
  v_picks_open boolean;
  v_valid      text[] := ARRAY['OFF_SEASON','PRE_SEASON','REGULAR','REGULAR_COMPLETE',
                               'PLAYOFFS','SUPERBOWL_INTRO','SUPERBOWL','SEASON_COMPLETE'];
BEGIN
  SELECT is_super_admin INTO v_is_super FROM profiles WHERE id = v_caller;
  IF NOT COALESCE(v_is_super, false) THEN
    RAISE EXCEPTION 'Not authorized: super admin only';
  END IF;

  IF NOT (p_phase = ANY(v_valid)) THEN
    RAISE EXCEPTION 'Invalid phase: %', p_phase;
  END IF;

  SELECT value #>> '{}' INTO v_current
  FROM competition_config WHERE competition = p_competition AND key = 'current_phase';
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'Unknown competition: %', p_competition;
  END IF;

  -- Off-cycle / bridge phases are idle with picks closed; in-cycle phases keep
  -- whatever the weekly cycle has set (the weekly transition owns picks_open).
  IF p_phase IN ('OFF_SEASON','PRE_SEASON','REGULAR_COMPLETE','SUPERBOWL_INTRO','SEASON_COMPLETE') THEN
    v_week_state := 'idle';
    v_picks_open := false;
  ELSE
    SELECT COALESCE(value #>> '{}', 'picks_open') INTO v_week_state
      FROM competition_config WHERE competition = p_competition AND key = 'week_state';
    SELECT COALESCE((value #>> '{}')::boolean, true) INTO v_picks_open
      FROM competition_config WHERE competition = p_competition AND key = 'picks_open';
  END IF;

  -- Audit FIRST (Hard Rule #17), unless the sandbox sim (exempt).
  IF p_competition <> 'nfl_2025_sim' THEN
    INSERT INTO admin_audit_log (admin_id, action, target_table, target_id, metadata)
    VALUES (v_caller, 'SEASON_PHASE_ADVANCED', 'competition_config', v_caller,
      jsonb_build_object('competition', p_competition, 'from_phase', v_current, 'to_phase', p_phase));
  END IF;

  UPDATE competition_config SET value = to_jsonb(p_phase)
    WHERE competition = p_competition AND key = 'current_phase';
  UPDATE competition_config SET value = to_jsonb(v_week_state)
    WHERE competition = p_competition AND key = 'week_state';
  UPDATE competition_config SET value = to_jsonb(v_picks_open)
    WHERE competition = p_competition AND key = 'picks_open';
  UPDATE competition_config SET value = to_jsonb(p_phase = 'SEASON_COMPLETE')
    WHERE competition = p_competition AND key = 'is_season_complete';

  RETURN jsonb_build_object('success', true, 'competition', p_competition,
                            'from_phase', v_current, 'to_phase', p_phase);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_advance_season_phase(text, text) TO authenticated;
