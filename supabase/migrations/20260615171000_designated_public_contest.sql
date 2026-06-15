-- Designated public contest + public-join path.
-- A super-admin marks ONE pool per competition as "the public contest". New users
-- (no contests yet) can join it from the Home screen WITHOUT an invite code.
-- This is a deliberate, single-target departure from the invite-only model
-- (REFERENCE §5) — scoped to the one designated pool per competition.

ALTER TABLE public.pools
  ADD COLUMN IF NOT EXISTS is_designated_public boolean NOT NULL DEFAULT false;

-- At most one designated public contest per competition.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_designated_public_per_competition
  ON public.pools (competition)
  WHERE is_designated_public = true;

-- ── set_designated_public_contest — super-admin only ──────────────────────────
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
    -- Clear any existing designation in this competition, then set this one.
    UPDATE pools SET is_designated_public = false
      WHERE competition = v_comp AND is_designated_public = true AND id <> p_pool_id;
    UPDATE pools SET is_designated_public = true, is_public = true WHERE id = p_pool_id;
  ELSE
    UPDATE pools SET is_designated_public = false WHERE id = p_pool_id;
  END IF;

  INSERT INTO admin_audit_log (admin_id, action, target_table, target_id, metadata)
  VALUES (v_caller, 'POOL_UPDATED', 'pools', p_pool_id,
          jsonb_build_object('is_designated_public', p_designated, 'competition', v_comp));

  RETURN jsonb_build_object('ok', true, 'pool_id', p_pool_id, 'designated', p_designated);
END;
$function$;

-- ── join_public_contest — add the caller to the competition's designated pool ──
CREATE OR REPLACE FUNCTION public.join_public_contest(p_competition text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id      uuid := auth.uid();
  v_pool         pools%ROWTYPE;
  v_member_count bigint;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('error', 'NOT_AUTHENTICATED'); END IF;
  -- Super-admins are creators-only and never join contests.
  IF EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id AND is_super_admin = true) THEN
    RETURN jsonb_build_object('error', 'SUPER_ADMIN_CANNOT_JOIN');
  END IF;

  SELECT * INTO v_pool FROM pools
   WHERE competition = p_competition AND is_designated_public = true
     AND is_archived = false AND deleted_at IS NULL
   LIMIT 1;
  IF v_pool.id IS NULL THEN RETURN jsonb_build_object('error', 'NO_PUBLIC_CONTEST'); END IF;

  IF EXISTS (SELECT 1 FROM pool_members
              WHERE pool_id = v_pool.id AND user_id = v_user_id AND status = 'active') THEN
    RETURN jsonb_build_object('error', 'ALREADY_MEMBER');
  END IF;

  IF v_pool.member_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_member_count FROM pool_members
     WHERE pool_id = v_pool.id AND status = 'active';
    IF v_member_count >= v_pool.member_limit THEN
      RETURN jsonb_build_object('error', 'pool_full');
    END IF;
  END IF;

  INSERT INTO pool_members (pool_id, user_id, role, status, invite_code_used)
  VALUES (v_pool.id, v_user_id, 'member', 'active', 'PUBLIC')
  ON CONFLICT (pool_id, user_id) DO UPDATE
    SET status = 'active', left_at = NULL, joined_at = now();

  RETURN jsonb_build_object('pool', jsonb_build_object(
    'id', v_pool.id, 'name', v_pool.name, 'competition', v_pool.competition,
    'is_global', v_pool.is_global, 'is_public', v_pool.is_public,
    'invite_code', v_pool.invite_code, 'brand_config', v_pool.brand_config,
    'created_at', v_pool.created_at));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.set_designated_public_contest(uuid, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_designated_public_contest(uuid, boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.join_public_contest(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.join_public_contest(text) TO authenticated, service_role;
