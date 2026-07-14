-- join_pool_by_invite → pending gate  (Gaffer Approval Gate — Stage 1)
--
-- ⚠️ HELD — DO NOT APPLY TO THE SHARED (prod) DB.
-- This changes the LIVE join flow: a new join becomes status='pending' instead
-- of 'active'. Applied alone, real users would join into limbo with no Stage 2
-- client UI to approve them. It ships ONLY with the coordinated Stage 2 build.
-- Kept in supabase/migrations-staged/ (outside the auto-applied path) on purpose;
-- move into supabase/migrations/ when Stage 2 lands. Verify on an EPHEMERAL
-- Supabase branch, never here.
--
-- Changes vs the current function (20260616120200):
--   1. New join / re-application now creates status='pending' (was 'active').
--   2. Demotion guard (FIX A): the ON CONFLICT DO UPDATE carries
--      `WHERE pool_members.status <> 'active'` so an active member who re-enters
--      the code is never knocked back to pending. (The existing active-member
--      early-return at the top is the first line of defense; this is race-safe
--      belt-and-suspenders at the write itself.)
--   3. The member-cap / founding-wall block is REMOVED from join — a pending
--      applicant consumes no slot; the cap is enforced at approve_pending_member
--      (admission-at-approve). v_member_count / v_founding_active / v_show_wall
--      are dropped with it.
--   4. Returns {'status':'pending', ...} so the Stage 2 client shows the waiting
--      room instead of dropping the user into the pool.

CREATE OR REPLACE FUNCTION public.join_pool_by_invite(p_invite_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pool             pools%ROWTYPE;
  v_user_id          uuid := auth.uid();
  v_existing_member  pool_members%ROWTYPE;
  v_normalized_code  text;
  v_pool_id          uuid;
BEGIN
  -- Super-admins are creators-only and never join contests.
  IF EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id AND is_super_admin = true) THEN
    RETURN jsonb_build_object('error', 'SUPER_ADMIN_CANNOT_JOIN');
  END IF;

  v_normalized_code := upper(regexp_replace(coalesce(p_invite_code, ''), '[\s\-]', '', 'g'));
  IF v_normalized_code = '' THEN RETURN jsonb_build_object('error', 'NOT_FOUND'); END IF;

  SELECT pool_id INTO v_pool_id FROM pool_invite_codes
   WHERE code = v_normalized_code AND is_active = true LIMIT 1;

  IF v_pool_id IS NULL THEN
    SELECT id INTO v_pool_id FROM pools
     WHERE (upper(invite_code) = v_normalized_code
            OR upper(regexp_replace(coalesce(invite_slug, ''), '[^0-9A-Za-z]', '', 'g')) = v_normalized_code)
       AND is_archived = false AND deleted_at IS NULL
     LIMIT 1;
  END IF;

  IF v_pool_id IS NULL THEN RETURN jsonb_build_object('error', 'NOT_FOUND'); END IF;

  SELECT * INTO v_pool FROM pools WHERE id = v_pool_id;
  IF v_pool.is_archived OR v_pool.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'NOT_FOUND');
  END IF;

  -- Already an ACTIVE member? Early-return unchanged. First line of defense
  -- against demotion: an active member never reaches the INSERT below.
  SELECT * INTO v_existing_member FROM pool_members
   WHERE pool_id = v_pool.id AND user_id = v_user_id AND status = 'active';

  IF v_existing_member.pool_id IS NOT NULL THEN
    IF v_pool.is_global AND v_existing_member.invite_code_used IS NULL THEN
      UPDATE pool_members SET invite_code_used = v_normalized_code
       WHERE pool_id = v_pool.id AND user_id = v_user_id;
      RETURN jsonb_build_object('pool', jsonb_build_object(
        'id', v_pool.id, 'name', v_pool.name, 'competition', v_pool.competition,
        'is_global', v_pool.is_global, 'is_public', v_pool.is_public,
        'invite_code', v_pool.invite_code, 'brand_config', v_pool.brand_config,
        'created_at', v_pool.created_at));
    END IF;
    RETURN jsonb_build_object('error', 'ALREADY_MEMBER');
  END IF;

  -- GATE: a new join becomes a PENDING applicant, not an active member. No cap
  -- check here — pending consumes no slot; the cap is enforced at approve.
  INSERT INTO pool_members (pool_id, user_id, role, status, invite_code_used)
  VALUES (v_pool.id, v_user_id, 'member', 'pending', v_normalized_code)
  ON CONFLICT (pool_id, user_id) DO UPDATE
    SET status = 'pending', left_at = NULL, joined_at = now(),
        invite_code_used = v_normalized_code
    WHERE pool_members.status <> 'active';   -- FIX A: never demote an active member

  RETURN jsonb_build_object('status', 'pending', 'pool', jsonb_build_object(
    'id', v_pool.id, 'name', v_pool.name, 'competition', v_pool.competition,
    'is_global', v_pool.is_global, 'is_public', v_pool.is_public,
    'invite_code', v_pool.invite_code, 'brand_config', v_pool.brand_config,
    'created_at', v_pool.created_at));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.join_pool_by_invite(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.join_pool_by_invite(text) TO authenticated, service_role;
