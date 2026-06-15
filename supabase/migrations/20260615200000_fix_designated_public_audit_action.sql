-- Fix: set_designated_public_contest logged action 'POOL_UPDATED', which is not
-- in the admin_audit_log_action_check allowlist → the toggle failed with a
-- check-constraint violation. Add a descriptive action and switch the RPC to it.

ALTER TABLE public.admin_audit_log
  DROP CONSTRAINT IF EXISTS admin_audit_log_action_check;

ALTER TABLE public.admin_audit_log
  ADD CONSTRAINT admin_audit_log_action_check CHECK (action = ANY (ARRAY[
    'POOL_SUSPENDED', 'POOL_UNSUSPENDED', 'USER_PLATFORM_SUSPENDED',
    'USER_PLATFORM_UNSUSPENDED', 'ADMIN_BROADCAST_SENT',
    'MODERATION_ESCALATION_ACTIONED', 'GAME_RESULT_OVERRIDDEN',
    'ROSTER_PASS_REGENERATED', 'PARTNER_CREATED', 'PARTNER_UPDATED',
    'PARTNER_DEACTIVATED', 'POOL_HARD_DELETED', 'POOL_ARCHIVED', 'POOL_CREATED',
    'MEMBER_REMOVED', 'ORGANIZER_BROADCAST', 'SMACKTALK_REMOVED',
    'BETA_TESTER_ADDED', 'BETA_TESTER_REMOVED', 'SEASON_PHASE_ADVANCED',
    'LEAGUE_CHAIRMAN_SET', 'CLUB_POOL_GAFFER_SET', 'SIMULATOR_RESET',
    'TESTER_SIGNUP_PROFILE_FAILED', 'WEEK_ADVANCED',
    'POOL_DESIGNATED_PUBLIC'
  ])) NOT VALID;

CREATE OR REPLACE FUNCTION public.set_designated_public_contest(p_pool_id uuid, p_designated boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_comp   text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_caller AND is_super_admin = true) THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;
  SELECT competition INTO v_comp FROM pools WHERE id = p_pool_id AND deleted_at IS NULL;
  IF v_comp IS NULL THEN RETURN jsonb_build_object('error', 'NO_POOL'); END IF;

  IF p_designated THEN
    UPDATE pools SET is_designated_public = false
      WHERE competition = v_comp AND is_designated_public = true AND id <> p_pool_id;
    UPDATE pools SET is_designated_public = true, is_public = true WHERE id = p_pool_id;
  ELSE
    UPDATE pools SET is_designated_public = false WHERE id = p_pool_id;
  END IF;

  INSERT INTO admin_audit_log (admin_id, action, target_table, target_id, metadata)
  VALUES (v_caller, 'POOL_DESIGNATED_PUBLIC', 'pools', p_pool_id,
          jsonb_build_object('is_designated_public', p_designated, 'competition', v_comp));

  RETURN jsonb_build_object('ok', true, 'pool_id', p_pool_id, 'designated', p_designated);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.set_designated_public_contest(uuid, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_designated_public_contest(uuid, boolean) TO authenticated, service_role;
