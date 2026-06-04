-- role_delegation_and_pending_grants
--
-- Email-based delegation on-ramps for the role model. An organizer grants a
-- (pool_id, role) to an email address:
--   • HotPick staff assign a League's Chairman (Club Pool organizer) from
--     Partner Admin.
--   • A Chairman adds Directors (Club Pool admins) from League Tools.
--   • A Gaffer adds Assistant Gaffers (Contest admins) from Gaffer Tools.
-- "Add delegates" is organizer-only; Directors / Assistant Gaffers get the
-- same tools minus that one control.
--
-- If the email isn't a registered user yet, the grant is parked in
-- pending_role_grants keyed by the (lowercased) email and materialized when
-- that person signs up with that exact email — see the claim trigger on
-- public.profiles. No new role values: reuses pool_members member/admin/
-- organizer.
-- ---------------------------------------------------------------------------

-- 1. Pending grants table -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pending_role_grants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL,                       -- stored lower(trim())
  pool_id    uuid NOT NULL REFERENCES public.pools(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('organizer', 'admin')),
  granted_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  claimed_by uuid REFERENCES public.profiles(id),
  UNIQUE (email, pool_id)
);

COMMENT ON TABLE public.pending_role_grants IS
  'Email-keyed role grants awaiting signup. Email stored lower(trim()). '
  'Materialized into pool_members by _claim_pending_role_grants() when a '
  'matching profile is created.';

-- Emails are sensitive: RLS on, no client policies. All access is via the
-- SECURITY DEFINER RPCs below.
ALTER TABLE public.pending_role_grants ENABLE ROW LEVEL SECURITY;

-- 2. Helper: caller is the organizer of a pool (or a super_admin) -------------
CREATE OR REPLACE FUNCTION public._caller_is_pool_organizer(p_pool_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.profiles
             WHERE id = auth.uid() AND is_super_admin = true)
    OR EXISTS (SELECT 1 FROM public.pool_members
                WHERE pool_id = p_pool_id AND user_id = auth.uid()
                  AND role = 'organizer' AND status = 'active');
$$;

-- 3. Organizer adds a delegate (admin) by email -------------------------------
--    Powers BOTH "Chairman adds Director" and "Gaffer adds Assistant Gaffer".
CREATE OR REPLACE FUNCTION public.grant_pool_delegate_by_email(
  p_pool_id uuid,
  p_email   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_email  text := lower(trim(p_email));
  v_user   uuid;
  v_role   text;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('error', 'NOT_AUTHENTICATED');
  END IF;
  IF NOT public._caller_is_pool_organizer(p_pool_id) THEN
    RETURN jsonb_build_object('error', 'NOT_ORGANIZER');
  END IF;
  IF v_email IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object('error', 'EMPTY_EMAIL');
  END IF;

  SELECT id INTO v_user FROM auth.users WHERE lower(email) = v_email LIMIT 1;

  IF v_user IS NOT NULL THEN
    SELECT role INTO v_role FROM public.pool_members
      WHERE pool_id = p_pool_id AND user_id = v_user;
    IF v_role = 'organizer' THEN
      RETURN jsonb_build_object('error', 'ALREADY_ORGANIZER');
    END IF;
    INSERT INTO public.pool_members (pool_id, user_id, role, status)
      VALUES (p_pool_id, v_user, 'admin', 'active')
      ON CONFLICT (pool_id, user_id)
      DO UPDATE SET role = 'admin', status = 'active'
        WHERE public.pool_members.role <> 'organizer';
    RETURN jsonb_build_object('ok', true, 'assigned', 'immediate', 'user_id', v_user);
  END IF;

  INSERT INTO public.pending_role_grants (email, pool_id, role, granted_by)
    VALUES (v_email, p_pool_id, 'admin', v_caller)
    ON CONFLICT (email, pool_id)
    DO UPDATE SET role = 'admin', granted_by = v_caller, created_at = now(),
                  claimed_at = NULL, claimed_by = NULL;
  RETURN jsonb_build_object('ok', true, 'assigned', 'pending', 'email', v_email);
END;
$$;
GRANT EXECUTE ON FUNCTION public.grant_pool_delegate_by_email(uuid, text) TO authenticated;

-- 4. Organizer revokes a delegate (active admin or a pending grant) -----------
CREATE OR REPLACE FUNCTION public.revoke_pool_delegate(
  p_pool_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_email   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(p_email));
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'NOT_AUTHENTICATED');
  END IF;
  IF NOT public._caller_is_pool_organizer(p_pool_id) THEN
    RETURN jsonb_build_object('error', 'NOT_ORGANIZER');
  END IF;

  IF p_user_id IS NOT NULL THEN
    -- Demote the admin back to member; they keep picks + standings. Never
    -- touch an organizer here.
    UPDATE public.pool_members SET role = 'member'
      WHERE pool_id = p_pool_id AND user_id = p_user_id AND role = 'admin';
  END IF;

  IF v_email IS NOT NULL AND v_email <> '' THEN
    DELETE FROM public.pending_role_grants
      WHERE pool_id = p_pool_id AND lower(email) = v_email AND claimed_at IS NULL;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.revoke_pool_delegate(uuid, uuid, text) TO authenticated;

-- 5. HotPick staff assign a League's Chairman (Club Pool organizer) ------------
CREATE OR REPLACE FUNCTION public.admin_set_league_chairman(
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
    -- Transfer organizer to the Chairman; downgrade the caretaker organizer.
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
  VALUES (v_admin, 'LEAGUE_CHAIRMAN_SET', 'partners', p_partner_id,
          jsonb_build_object('club_pool_id', v_pool, 'email', v_email,
                             'assigned', v_result, 'user_id', v_user));

  RETURN jsonb_build_object('ok', true, 'assigned', v_result,
                            'user_id', v_user, 'email', v_email);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_set_league_chairman(uuid, text) TO authenticated;

-- 6. List a pool's board (active organizer/admins + pending grants) -----------
CREATE OR REPLACE FUNCTION public.list_pool_delegates(p_pool_id uuid)
RETURNS TABLE (user_id uuid, email text, role text, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    EXISTS (SELECT 1 FROM public.profiles
             WHERE id = auth.uid() AND is_super_admin = true)
    OR EXISTS (SELECT 1 FROM public.pool_members
                WHERE pool_id = p_pool_id AND user_id = auth.uid()
                  AND role IN ('organizer', 'admin') AND status = 'active')
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
    SELECT pm.user_id, u.email::text, pm.role, 'active'::text
      FROM public.pool_members pm
      JOIN auth.users u ON u.id = pm.user_id
     WHERE pm.pool_id = p_pool_id
       AND pm.role IN ('organizer', 'admin')
       AND pm.status = 'active'
    UNION ALL
    SELECT NULL::uuid, prg.email, prg.role, 'pending'::text
      FROM public.pending_role_grants prg
     WHERE prg.pool_id = p_pool_id
       AND prg.claimed_at IS NULL
     ORDER BY 4, 3, 2;
END;
$$;
GRANT EXECUTE ON FUNCTION public.list_pool_delegates(uuid) TO authenticated;

-- 7. Claim pending grants when the invited person signs up --------------------
--    Fires on profile creation (profiles row is inserted by the dashboard
--    handle_new_user trigger at signup). Matches on the auth email of the
--    new user — this is the "must sign up with that exact email" rule.
CREATE OR REPLACE FUNCTION public._claim_pending_role_grants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  g       record;
  v_prev  uuid;
BEGIN
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = NEW.id;
  IF v_email IS NULL THEN
    RETURN NEW;
  END IF;

  FOR g IN
    SELECT * FROM public.pending_role_grants
     WHERE lower(email) = v_email AND claimed_at IS NULL
  LOOP
    IF g.role = 'organizer' THEN
      SELECT organizer_id INTO v_prev FROM public.pools WHERE id = g.pool_id;
      IF v_prev IS NOT NULL AND v_prev <> NEW.id THEN
        UPDATE public.pool_members SET role = 'member'
          WHERE pool_id = g.pool_id AND user_id = v_prev AND role = 'organizer';
      END IF;
      INSERT INTO public.pool_members (pool_id, user_id, role, status)
        VALUES (g.pool_id, NEW.id, 'organizer', 'active')
        ON CONFLICT (pool_id, user_id) DO UPDATE SET role = 'organizer', status = 'active';
      UPDATE public.pools SET organizer_id = NEW.id WHERE id = g.pool_id;
    ELSE
      INSERT INTO public.pool_members (pool_id, user_id, role, status)
        VALUES (g.pool_id, NEW.id, 'admin', 'active')
        ON CONFLICT (pool_id, user_id)
        DO UPDATE SET role = 'admin', status = 'active'
          WHERE public.pool_members.role <> 'organizer';
    END IF;

    UPDATE public.pending_role_grants
       SET claimed_at = now(), claimed_by = NEW.id
     WHERE id = g.id;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS claim_pending_role_grants_after_profile_insert ON public.profiles;
CREATE TRIGGER claim_pending_role_grants_after_profile_insert
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public._claim_pending_role_grants();

-- 8. Allow the new audit action value -----------------------------------------
--    Recreate the admin_audit_log action CHECK as a generous superset (so no
--    existing insert site breaks) plus LEAGUE_CHAIRMAN_SET. NOT VALID skips
--    re-checking historical rows.
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
      'SEASON_PHASE_ADVANCED', 'LEAGUE_CHAIRMAN_SET'
    ])
  ) NOT VALID;
