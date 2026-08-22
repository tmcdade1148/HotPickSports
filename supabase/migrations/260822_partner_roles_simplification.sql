-- ============================================================================
-- 260822_partner_roles_simplification.sql
--
-- Partner Roles Simplification & Club Contest Repair (spec v1.1, 2026-08-22).
--
-- Collapses the partner board to ONE role (Director) and repairs
-- create_partner_pool, which has never once succeeded in production (zero
-- admin_audit_log rows for action 'create_partner_pool', verified 2026-08-22).
--
-- Hard Rule #24 codified the Chairman model. Tom authorized amending it on
-- 2026-08-22; the replacement rule text ships in CLAUDE.md in this same PR.
-- Building this WITHOUT the rule change would be the violation.
--
-- NOT APPLIED BY THE AUTHORING SESSION. Applied via MCP at merge.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 4.1 Data migration -- chairman becomes director everywhere.
--
-- Live state at authoring time: 2 partner_members rows, BOTH 'chairman'
-- (zero directors existed), and 1 unclaimed 'chairman' grant (Brady's,
-- abradydmv@gmail.com). After this runs, every board row is a Director and
-- Brady still claims at signup through the surviving director branch.
-- ---------------------------------------------------------------------------
UPDATE partner_members SET role = 'director' WHERE role = 'chairman';

UPDATE pending_role_grants SET role = 'director'
  WHERE role = 'chairman' AND claimed_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4.2 grant_partner_director_by_email -- any board member may add a Director.
--
-- Gate was: super admin OR partner_members row with role = 'chairman'.
-- Gate is now: super admin OR ANY partner_members row for this partner.
--
-- Also removes the chairman-preserving CASE from the ON CONFLICT clause. The
-- spec's 4.2 only calls out the gate, but that CASE re-wrote 'chairman' back
-- onto a conflicting row -- leaving it would be a live path that reintroduces
-- the removed role (Red Flag #1). Post-4.1 it could only ever take the else
-- branch, so collapsing it to 'director' is behaviour-preserving and honest.
--
-- Error code renamed NOT_CHAIRMAN -> NOT_AUTHORIZED: the gate no longer has
-- anything to do with a Chairman. DelegateManager maps the new code.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_partner_director_by_email(p_partner_id uuid, p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_email  text := lower(trim(p_email));
  v_user   uuid;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('error', 'NOT_AUTHENTICATED');
  END IF;
  IF NOT (
    EXISTS (SELECT 1 FROM public.profiles
             WHERE id = v_caller AND is_super_admin = true)
    OR EXISTS (SELECT 1 FROM public.partner_members
                WHERE partner_id = p_partner_id AND user_id = v_caller)
  ) THEN
    RETURN jsonb_build_object('error', 'NOT_AUTHORIZED');
  END IF;
  IF v_email IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object('error', 'EMPTY_EMAIL');
  END IF;

  SELECT id INTO v_user FROM auth.users WHERE lower(email) = v_email LIMIT 1;

  IF v_user IS NOT NULL THEN
    INSERT INTO public.partner_members (partner_id, user_id, role, created_by)
      VALUES (p_partner_id, v_user, 'director', v_caller)
      ON CONFLICT (partner_id, user_id) DO UPDATE SET role = 'director';
    RETURN jsonb_build_object('ok', true, 'assigned', 'immediate', 'user_id', v_user);
  END IF;

  INSERT INTO public.pending_role_grants (email, partner_id, role, granted_by)
    VALUES (v_email, p_partner_id, 'director', v_caller)
    ON CONFLICT (email, partner_id) WHERE partner_id IS NOT NULL
    DO UPDATE SET role = 'director', granted_by = v_caller, created_at = now(),
                  claimed_at = NULL, claimed_by = NULL;
  RETURN jsonb_build_object('ok', true, 'assigned', 'pending', 'email', v_email);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4.3 revoke_partner_member -- same gate change, plus the last-Director guard.
--
-- The guard protects LIVE board rows only. Revoking a PENDING grant is always
-- allowed (p_user_id IS NULL on that path), so a partner can never be left
-- with an empty board by a Director's own action. Super admin is the backstop.
--
-- The old DELETE carried `AND role = 'director'`, which was a no-op filter
-- against a chairman row; post-4.1 every row is a director, so the filter is
-- dropped rather than left as a trap for the next person who adds a role.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_partner_member(p_partner_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
                WHERE partner_id = p_partner_id AND user_id = auth.uid())
  ) THEN
    RETURN jsonb_build_object('error', 'NOT_AUTHORIZED');
  END IF;

  -- A Club must keep at least one Director. Live rows only.
  IF p_user_id IS NOT NULL
     AND (SELECT count(*) FROM public.partner_members
           WHERE partner_id = p_partner_id) <= 1 THEN
    RETURN jsonb_build_object('error', 'LAST_DIRECTOR');
  END IF;

  IF p_user_id IS NOT NULL THEN
    DELETE FROM public.partner_members
      WHERE partner_id = p_partner_id AND user_id = p_user_id;
  END IF;
  IF v_email IS NOT NULL AND v_email <> '' THEN
    DELETE FROM public.pending_role_grants
      WHERE partner_id = p_partner_id AND lower(email) = v_email
        AND role = 'director' AND claimed_at IS NULL;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4.4 _claim_pending_role_grants -- the chairman branch goes away.
--
-- Removed: the IF g.role = 'chairman' branch and its demotion UPDATE (the
-- caretaker choreography), plus the chairman-preserving CASE in the director
-- branch's ON CONFLICT -- same reasoning as 4.2. The organizer and pool-admin
-- branches are untouched, byte for byte.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._claim_pending_role_grants()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      INSERT INTO public.partner_members (partner_id, user_id, role, created_by)
        VALUES (g.partner_id, NEW.id, 'director', g.granted_by)
        ON CONFLICT (partner_id, user_id) DO UPDATE SET role = 'director';
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
$function$;

-- ---------------------------------------------------------------------------
-- 4.5 Retire admin_set_league_chairman.
-- The super admin path is now grant_partner_director_by_email, whose gate
-- already admits super admins. One RPC deleted, zero added.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS admin_set_league_chairman(uuid, text);

-- ---------------------------------------------------------------------------
-- 4.6 create_partner_pool -- three live defects repaired, plus a Gaffer default.
--
--  (a) AMBIGUITY. invite_code / invite_slug are OUT params of the RETURNS
--      TABLE signature AND columns on pools, so the unqualified reference in
--      the collision loop raised "column reference is ambiguous" before the
--      function ever reached its first INSERT. This is why zero
--      'create_partner_pool' rows exist in admin_audit_log -- it failed ahead
--      of even the audit write. Every pools reference is now alias-qualified.
--
--  (b) THE SANDBOX TRAP. p_competition defaulted to 'nfl_2025_sim' and the
--      client never passed a value, so the first real Partner's Contest would
--      have been created inside the tester sandbox. The DEFAULT is removed
--      entirely -- callers must be explicit (Red Flag #3).
--
--  (c) pool_start_date was never set, riding the CURRENT_DATE column default.
--      Now written explicitly, so the value is visible at the call site rather
--      than inherited silently.
--
-- DEVIATION FROM THE SPEC'S REFERENCE BODY (stated per the handoff):
-- search_path stays 'public', 'extensions' -- the spec's corrected body used
-- `SET search_path = public` alone, which would have broken the function on
-- its very first call. gen_random_bytes() is pgcrypto, installed in the
-- `extensions` schema on this project (verified 2026-08-22); dropping that
-- entry raises "function gen_random_bytes(integer) does not exist".
-- gen_random_uuid() is pg_catalog and would have been fine either way.
--
-- Gaffer default (Decision 3): the longest-standing live Director, else the
-- caller. The Gaffer is a pool_members organizer seat as always -- no fused
-- role, no new table.
-- ---------------------------------------------------------------------------
-- DROP before CREATE, not CREATE OR REPLACE: Postgres refuses to remove a
-- parameter default from an existing function ("cannot remove parameter
-- defaults from existing function"), so replacing in place would fail on
-- defect (b). There is only one signature to drop -- create_partner_pool(uuid,
-- text) with one default; a defaulted parameter does not create a second
-- pg_proc entry (verified 2026-08-22).
DROP FUNCTION IF EXISTS public.create_partner_pool(uuid, text);

CREATE FUNCTION public.create_partner_pool(
  p_partner_id uuid,
  p_competition text                      -- no DEFAULT: caller must be explicit
) RETURNS TABLE(pool_id uuid, pool_name text, invite_code text, invite_slug text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_caller         uuid;
  v_is_super_admin boolean;
  v_partner        partners%ROWTYPE;
  v_pool_id        uuid;
  v_invite_code    text;
  v_gaffer         uuid;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT is_super_admin INTO v_is_super_admin FROM profiles WHERE id = v_caller;
  IF NOT COALESCE(v_is_super_admin, false) THEN RAISE EXCEPTION 'Super admin required'; END IF;

  SELECT * INTO v_partner FROM partners WHERE id = p_partner_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Partner not found'; END IF;
  IF NOT COALESCE(v_partner.can_run_pools, false) THEN
    RAISE EXCEPTION 'Partner is sponsor-only; cannot run pools'; END IF;
  IF v_partner.club_pool_id IS NOT NULL THEN
    RAISE EXCEPTION 'Partner already has a Club Contest (%)', v_partner.club_pool_id; END IF;
  IF NOT EXISTS (SELECT 1 FROM competition_config cc
                  WHERE cc.competition = p_competition AND cc.key = 'is_active') THEN
    RAISE EXCEPTION 'Unknown competition: %', p_competition; END IF;

  -- Gaffer default: a live Director if one exists, else the caller (Decision 3).
  SELECT pm.user_id INTO v_gaffer FROM partner_members pm
   WHERE pm.partner_id = p_partner_id ORDER BY pm.created_at ASC LIMIT 1;
  v_gaffer := COALESCE(v_gaffer, v_caller);

  v_pool_id := gen_random_uuid();
  v_invite_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));
  WHILE EXISTS (SELECT 1 FROM pools pl WHERE pl.invite_code = v_invite_code) LOOP
    v_invite_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));
  END LOOP;

  -- Rule #17: log first, then act.
  INSERT INTO admin_audit_log (admin_id, action, target_table, target_id, metadata)
  VALUES (v_caller, 'create_partner_pool', 'pools', v_pool_id,
          jsonb_build_object('partner_id', p_partner_id, 'partner_slug', v_partner.slug,
                             'competition', p_competition, 'invite_code', v_invite_code,
                             'gaffer', v_gaffer));

  INSERT INTO pools (id, name, created_by, organizer_id, competition, is_public,
                     invite_code, invite_slug, partner_id, brand_config, status,
                     pool_start_date)
  VALUES (v_pool_id, v_partner.name, v_caller, v_gaffer, p_competition, false,
          v_invite_code, v_partner.slug, v_partner.id, v_partner.brand_config, 'active',
          CURRENT_DATE);

  INSERT INTO pool_members (pool_id, user_id, role, status)
  VALUES (v_pool_id, v_gaffer, 'organizer', 'active');

  UPDATE partners SET club_pool_id = v_pool_id WHERE id = p_partner_id;

  RETURN QUERY SELECT pl.id, pl.name, pl.invite_code, pl.invite_slug
               FROM pools pl WHERE pl.id = v_pool_id;
END;
$function$;

-- DROP + CREATE resets the ACL to the default (EXECUTE to PUBLIC), which would
-- hand anon an execute grant it does not have today. Restore the exact grants
-- the dropped function carried: authenticated + service_role, no anon, no
-- PUBLIC (verified from proacl before the drop, 2026-08-22). The function
-- gates on super admin internally, but widening execute silently is how that
-- posture erodes -- see the repo's revoke_anon_execute migrations.
REVOKE ALL ON FUNCTION public.create_partner_pool(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_partner_pool(uuid, text) TO authenticated, service_role;
