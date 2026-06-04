-- partner_level_chairman_directors
--
-- Decouples partner administration from the Club Pool (revises Hard Rule #24).
-- A partner's board now lives in `partner_members` (chairman + directors),
-- independent of whether the partner runs a Club Pool. This lets sponsor-only
-- partners have a Chairman + Directors who manage the perk, broadcasts, and
-- directory/roster presence — no Contest required.
--
--   • Chairman  — partner-level overseer, seeded by HotPick staff (by email).
--   • Director  — added by the Chairman; same League Tools minus adding others.
--
-- The Club Pool, if a partner has one, is just a Contest the board also runs.
-- Pool-level delegation (Gaffer / Assistant Gaffer) is unchanged.
-- ---------------------------------------------------------------------------

-- 1. partner_members ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_members (
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('chairman', 'director')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  PRIMARY KEY (partner_id, user_id)
);

-- At most one Chairman per partner.
CREATE UNIQUE INDEX IF NOT EXISTS partner_members_one_chairman
  ON public.partner_members (partner_id) WHERE role = 'chairman';

ALTER TABLE public.partner_members ENABLE ROW LEVEL SECURITY;

-- A user can see their own memberships (drives "League I manage"); super-admins
-- see all. Writes go only through the SECURITY DEFINER RPCs below.
DROP POLICY IF EXISTS partner_members_select_self ON public.partner_members;
CREATE POLICY partner_members_select_self ON public.partner_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles
                WHERE id = auth.uid() AND is_super_admin = true)
  );

-- 2. Extend pending_role_grants to hold partner-level invites -----------------
ALTER TABLE public.pending_role_grants
  ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.partners(id) ON DELETE CASCADE;
ALTER TABLE public.pending_role_grants
  ALTER COLUMN pool_id DROP NOT NULL;

-- Replace the old role CHECK with one that ties role to the target type:
--   pool grant    → organizer | admin
--   partner grant → chairman  | director  (exactly one of pool_id / partner_id)
ALTER TABLE public.pending_role_grants
  DROP CONSTRAINT IF EXISTS pending_role_grants_role_check;
ALTER TABLE public.pending_role_grants
  ADD CONSTRAINT pending_role_grants_target_role_chk CHECK (
    (pool_id IS NOT NULL AND partner_id IS NULL AND role IN ('organizer', 'admin'))
    OR (partner_id IS NOT NULL AND pool_id IS NULL AND role IN ('chairman', 'director'))
  );

-- Dedupe partner invites by (email, partner_id). Pool invites keep their
-- existing UNIQUE (email, pool_id).
CREATE UNIQUE INDEX IF NOT EXISTS pending_role_grants_email_partner_uniq
  ON public.pending_role_grants (email, partner_id) WHERE partner_id IS NOT NULL;

-- 3. _caller_can_manage_partner → gate on partner_members ---------------------
--    (Drops the Club-Pool-organizer dependency; works for sponsor-only too.)
CREATE OR REPLACE FUNCTION public._caller_can_manage_partner(p_partner_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles
              WHERE id = v_caller AND is_super_admin = true) THEN
    RETURN true;
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.partner_members
                  WHERE partner_id = p_partner_id AND user_id = v_caller);
END;
$$;

-- 4. Seed the Chairman (HotPick staff, by email) ------------------------------
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
  v_user   uuid;
  v_result text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles
                  WHERE id = v_admin AND is_super_admin = true) THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;
  IF v_email IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object('error', 'EMPTY_EMAIL');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.partners WHERE id = p_partner_id) THEN
    RETURN jsonb_build_object('error', 'NO_PARTNER');
  END IF;

  SELECT id INTO v_user FROM auth.users WHERE lower(email) = v_email LIMIT 1;

  IF v_user IS NOT NULL THEN
    -- Demote any existing chairman (other than this user) to director first.
    UPDATE public.partner_members SET role = 'director'
      WHERE partner_id = p_partner_id AND role = 'chairman' AND user_id <> v_user;
    INSERT INTO public.partner_members (partner_id, user_id, role, created_by)
      VALUES (p_partner_id, v_user, 'chairman', v_admin)
      ON CONFLICT (partner_id, user_id) DO UPDATE SET role = 'chairman';
    v_result := 'immediate';
  ELSE
    INSERT INTO public.pending_role_grants (email, partner_id, role, granted_by)
      VALUES (v_email, p_partner_id, 'chairman', v_admin)
      ON CONFLICT (email, partner_id) WHERE partner_id IS NOT NULL
      DO UPDATE SET role = 'chairman', granted_by = v_admin, created_at = now(),
                    claimed_at = NULL, claimed_by = NULL;
    v_result := 'pending';
  END IF;

  INSERT INTO public.admin_audit_log (admin_id, action, target_table, target_id, metadata)
  VALUES (v_admin, 'LEAGUE_CHAIRMAN_SET', 'partners', p_partner_id,
          jsonb_build_object('email', v_email, 'assigned', v_result, 'user_id', v_user));

  RETURN jsonb_build_object('ok', true, 'assigned', v_result,
                            'user_id', v_user, 'email', v_email);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_set_league_chairman(uuid, text) TO authenticated;

-- 5. Chairman adds a Director by email ----------------------------------------
CREATE OR REPLACE FUNCTION public.grant_partner_director_by_email(
  p_partner_id uuid,
  p_email      text
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
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('error', 'NOT_AUTHENTICATED');
  END IF;
  -- Only the Chairman (or a super-admin) may add Directors.
  IF NOT (
    EXISTS (SELECT 1 FROM public.profiles
             WHERE id = v_caller AND is_super_admin = true)
    OR EXISTS (SELECT 1 FROM public.partner_members
                WHERE partner_id = p_partner_id AND user_id = v_caller AND role = 'chairman')
  ) THEN
    RETURN jsonb_build_object('error', 'NOT_CHAIRMAN');
  END IF;
  IF v_email IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object('error', 'EMPTY_EMAIL');
  END IF;

  SELECT id INTO v_user FROM auth.users WHERE lower(email) = v_email LIMIT 1;

  IF v_user IS NOT NULL THEN
    INSERT INTO public.partner_members (partner_id, user_id, role, created_by)
      VALUES (p_partner_id, v_user, 'director', v_caller)
      ON CONFLICT (partner_id, user_id) DO UPDATE SET role =
        CASE WHEN public.partner_members.role = 'chairman' THEN 'chairman' ELSE 'director' END;
    RETURN jsonb_build_object('ok', true, 'assigned', 'immediate', 'user_id', v_user);
  END IF;

  INSERT INTO public.pending_role_grants (email, partner_id, role, granted_by)
    VALUES (v_email, p_partner_id, 'director', v_caller)
    ON CONFLICT (email, partner_id) WHERE partner_id IS NOT NULL
    DO UPDATE SET role = 'director', granted_by = v_caller, created_at = now(),
                  claimed_at = NULL, claimed_by = NULL;
  RETURN jsonb_build_object('ok', true, 'assigned', 'pending', 'email', v_email);
END;
$$;
GRANT EXECUTE ON FUNCTION public.grant_partner_director_by_email(uuid, text) TO authenticated;

-- 6. Revoke a Director (active or pending) ------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_partner_member(
  p_partner_id uuid,
  p_user_id    uuid DEFAULT NULL,
  p_email      text DEFAULT NULL
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
  IF NOT (
    EXISTS (SELECT 1 FROM public.profiles
             WHERE id = auth.uid() AND is_super_admin = true)
    OR EXISTS (SELECT 1 FROM public.partner_members
                WHERE partner_id = p_partner_id AND user_id = auth.uid() AND role = 'chairman')
  ) THEN
    RETURN jsonb_build_object('error', 'NOT_CHAIRMAN');
  END IF;

  IF p_user_id IS NOT NULL THEN
    DELETE FROM public.partner_members
      WHERE partner_id = p_partner_id AND user_id = p_user_id AND role = 'director';
  END IF;
  IF v_email IS NOT NULL AND v_email <> '' THEN
    DELETE FROM public.pending_role_grants
      WHERE partner_id = p_partner_id AND lower(email) = v_email
        AND role = 'director' AND claimed_at IS NULL;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.revoke_partner_member(uuid, uuid, text) TO authenticated;

-- 7. List a partner's board (chairman + directors + pending) ------------------
CREATE OR REPLACE FUNCTION public.list_partner_members(p_partner_id uuid)
RETURNS TABLE (user_id uuid, email text, role text, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Qualify all columns so they don't collide with the RETURNS TABLE outputs.
  IF NOT (
    EXISTS (SELECT 1 FROM public.profiles pr
             WHERE pr.id = auth.uid() AND pr.is_super_admin = true)
    OR EXISTS (SELECT 1 FROM public.partner_members pmx
                WHERE pmx.partner_id = p_partner_id AND pmx.user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
    SELECT pm.user_id, u.email::text, pm.role, 'active'::text
      FROM public.partner_members pm
      JOIN auth.users u ON u.id = pm.user_id
     WHERE pm.partner_id = p_partner_id
    UNION ALL
    SELECT NULL::uuid, prg.email, prg.role, 'pending'::text
      FROM public.pending_role_grants prg
     WHERE prg.partner_id = p_partner_id
       AND prg.claimed_at IS NULL
     ORDER BY 4, 3, 2;
END;
$$;
GRANT EXECUTE ON FUNCTION public.list_partner_members(uuid) TO authenticated;

-- 8. Claim trigger — also materialize partner-level grants --------------------
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
    IF g.partner_id IS NOT NULL THEN
      -- Partner-level grant → partner_members.
      IF g.role = 'chairman' THEN
        UPDATE public.partner_members SET role = 'director'
          WHERE partner_id = g.partner_id AND role = 'chairman' AND user_id <> NEW.id;
        INSERT INTO public.partner_members (partner_id, user_id, role, created_by)
          VALUES (g.partner_id, NEW.id, 'chairman', g.granted_by)
          ON CONFLICT (partner_id, user_id) DO UPDATE SET role = 'chairman';
      ELSE
        INSERT INTO public.partner_members (partner_id, user_id, role, created_by)
          VALUES (g.partner_id, NEW.id, 'director', g.granted_by)
          ON CONFLICT (partner_id, user_id) DO UPDATE SET role =
            CASE WHEN public.partner_members.role = 'chairman' THEN 'chairman' ELSE 'director' END;
      END IF;
    ELSIF g.role = 'organizer' THEN
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

-- 9. Backfill — keep today's Club-Pool admins working -------------------------
--    Existing Club Pool organizer → Chairman, admins → Director, so current
--    operators retain their League Tools access after the decoupling.
INSERT INTO public.partner_members (partner_id, user_id, role)
SELECT pt.id, pm.user_id,
       CASE WHEN pm.role = 'organizer' THEN 'chairman' ELSE 'director' END
  FROM public.partners pt
  JOIN public.pool_members pm ON pm.pool_id = pt.club_pool_id
 WHERE pt.club_pool_id IS NOT NULL
   AND pm.role IN ('organizer', 'admin')
   AND pm.status = 'active'
ON CONFLICT (partner_id, user_id) DO NOTHING;
