-- admin_set_club_pool_gaffer
--
-- Super-admin assigns the Gaffer (organizer) of a partner's own Club Pool by
-- email — separate from the Chairman (who oversees the partner). Often the
-- same person, but kept as distinct designations: the Chairman runs the
-- partner/League presence; the Gaffer runs the Contest. Only applies to a
-- partner that has a Club Pool (`partners.club_pool_id`).
--
-- Existing user → transfer the Club Pool organizer immediately. Not yet a
-- user → pending pool-level 'organizer' grant, materialized on signup by the
-- existing claim trigger.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_set_club_pool_gaffer(
  p_partner_id uuid,
  p_email      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin  uuid := auth.uid();
  v_email  text := lower(trim(p_email));
  v_pool   uuid;
  v_user   uuid;
  v_prev   uuid;
  v_result text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles
                  WHERE id = v_admin AND is_super_admin = true) THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;
  IF v_email IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object('error', 'EMPTY_EMAIL');
  END IF;

  SELECT club_pool_id INTO v_pool FROM public.partners WHERE id = p_partner_id;
  IF v_pool IS NULL THEN
    RETURN jsonb_build_object('error', 'NO_CLUB_POOL');
  END IF;

  SELECT id INTO v_user FROM auth.users WHERE lower(email) = v_email LIMIT 1;

  IF v_user IS NOT NULL THEN
    SELECT organizer_id INTO v_prev FROM public.pools WHERE id = v_pool;
    IF v_prev IS NOT NULL AND v_prev <> v_user THEN
      UPDATE public.pool_members SET role = 'member'
        WHERE pool_id = v_pool AND user_id = v_prev AND role = 'organizer';
    END IF;
    INSERT INTO public.pool_members (pool_id, user_id, role, status)
      VALUES (v_pool, v_user, 'organizer', 'active')
      ON CONFLICT (pool_id, user_id) DO UPDATE SET role = 'organizer', status = 'active';
    UPDATE public.pools SET organizer_id = v_user WHERE id = v_pool;
    v_result := 'immediate';
  ELSE
    INSERT INTO public.pending_role_grants (email, pool_id, role, granted_by)
      VALUES (v_email, v_pool, 'organizer', v_admin)
      ON CONFLICT (email, pool_id)
      DO UPDATE SET role = 'organizer', granted_by = v_admin, created_at = now(),
                    claimed_at = NULL, claimed_by = NULL;
    v_result := 'pending';
  END IF;

  INSERT INTO public.admin_audit_log (admin_id, action, target_table, target_id, metadata)
  VALUES (v_admin, 'CLUB_POOL_GAFFER_SET', 'pools', v_pool,
          jsonb_build_object('partner_id', p_partner_id, 'email', v_email,
                             'assigned', v_result, 'user_id', v_user));

  RETURN jsonb_build_object('ok', true, 'assigned', v_result,
                            'user_id', v_user, 'email', v_email);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_set_club_pool_gaffer(uuid, text) TO authenticated;

-- Allow the new audit action value.
DO $$
DECLARE v_constraint text;
BEGIN
  SELECT conname INTO v_constraint FROM pg_constraint
   WHERE conrelid = 'public.admin_audit_log'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%action%';
  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.admin_audit_log DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

ALTER TABLE public.admin_audit_log
  ADD CONSTRAINT admin_audit_log_action_check CHECK (
    action = ANY (ARRAY[
      'POOL_SUSPENDED', 'POOL_UNSUSPENDED',
      'USER_PLATFORM_SUSPENDED', 'USER_PLATFORM_UNSUSPENDED',
      'ADMIN_BROADCAST_SENT', 'MODERATION_ESCALATION_ACTIONED',
      'GAME_RESULT_OVERRIDDEN', 'ROSTER_PASS_REGENERATED',
      'PARTNER_CREATED', 'PARTNER_UPDATED', 'PARTNER_DEACTIVATED',
      'POOL_HARD_DELETED', 'POOL_ARCHIVED', 'POOL_CREATED',
      'MEMBER_REMOVED', 'ORGANIZER_BROADCAST', 'SMACKTALK_REMOVED',
      'BETA_TESTER_ADDED', 'BETA_TESTER_REMOVED',
      'SEASON_PHASE_ADVANCED', 'LEAGUE_CHAIRMAN_SET', 'CLUB_POOL_GAFFER_SET'
    ])
  ) NOT VALID;
