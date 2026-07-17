-- 260717_pool_client_json_helper_and_join_repoint.sql
--
-- Repo parity for the pool-payload helper introduced in prod on 2026-07-17.
-- ALREADY LIVE — this file records it; it does not introduce it.
--
-- WHAT & WHY:
-- join_pool_by_invite is SECURITY DEFINER and returns a `pool` object to users
-- RLS forbids from reading pools directly (pools_select requires an ACTIVE
-- membership, so a pending applicant literally cannot read the row). That object
-- was hand-built with jsonb_build_object in two places. The two copies drifted:
-- organizer_id — which the onboarding "<Gaffer> has to wave you in" / "<Gaffer>
-- runs this one" copy reads — was silently missing, and a later blanket edit
-- patched only one of the two copies (their indentation differed). Root-cause
-- fix: ONE named projection, public._pool_client_json(pools), that both call.
--
-- public._pool_client_json IS a privilege boundary — see its COMMENT. Never add
-- a moderation field to it; never replace it with to_jsonb(p).
--
-- Applied via the Supabase MCP on 2026-07-17 and verified: join_pool_by_invite
-- makes 2 helper calls and 0 hand-built pool payloads; the projection carries
-- organizer_id and no moderation fields. Bodies below were pulled live with
-- pg_get_functiondef and pretty-printed — semantics match the live definitions
-- exactly; only whitespace differs. Both are CREATE OR REPLACE and safe to
-- re-run. Grants match the verified live ACLs.
--
-- Cross-ref: supabase/migrations-staged/20260714100500 (the held pending gate)
-- also calls this helper; when it is promoted to migrations/, it must be renamed
-- to sort AFTER this file (see its header) or a from-scratch rebuild calls a
-- function that does not exist yet.

-- ---------------------------------------------------------------------------
-- The canonical projection: what a non-member may see about a Contest.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._pool_client_json(p pools)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'id',           p.id,
    'name',         p.name,
    'competition',  p.competition,
    'is_global',    p.is_global,
    'is_public',    p.is_public,
    'invite_code',  p.invite_code,
    'brand_config', p.brand_config,
    'created_at',   p.created_at,
    'organizer_id', p.organizer_id
  );
$function$;

COMMENT ON FUNCTION public._pool_client_json(pools) IS
  'The ONE definition of what a non-member may see about a Contest. join_pool_by_invite is SECURITY DEFINER and hands this to users RLS forbids from reading pools (pools_select requires status=''active'', so pending applicants cannot read the row themselves). This projection IS a privilege boundary: never add suspension_reason, suspended_by, deleted_by, is_hidden_from_users, or any moderation field. Never replace with to_jsonb(p) — that would leak the whole row. Both join_pool_by_invite (live) and migrations-staged/20260714100500 (pending gate) must call this and nothing else. Added 2026-07-17 after organizer_id was silently missing from two hand-built copies of this projection.';

-- Privilege boundary: only the SECURITY DEFINER callers (running as owner) and
-- service_role may invoke it. NOT granted to anon/authenticated — a client must
-- never be able to call it directly to project arbitrary pool rows.
REVOKE ALL    ON FUNCTION public._pool_client_json(pools) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public._pool_client_json(pools) TO service_role;

-- ---------------------------------------------------------------------------
-- join_pool_by_invite (live / active-join path) — repointed to the helper.
-- Unchanged except both hand-built pool payloads now call _pool_client_json.
-- This is the LIVE function; the pending-gate variant is held in
-- migrations-staged/20260714100500 and is NOT applied by this file.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_pool_by_invite(p_invite_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pool             pools%ROWTYPE;
  v_user_id          uuid := auth.uid();
  v_member_count     bigint;
  v_existing_member  pool_members%ROWTYPE;
  v_normalized_code  text;
  v_pool_id          uuid;
  v_founding_active  boolean;
  v_show_wall        text := NULL;
BEGIN
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

  SELECT * INTO v_existing_member FROM pool_members
   WHERE pool_id = v_pool.id AND user_id = v_user_id AND status = 'active';

  IF v_existing_member.pool_id IS NOT NULL THEN
    IF v_pool.is_global AND v_existing_member.invite_code_used IS NULL THEN
      UPDATE pool_members SET invite_code_used = v_normalized_code
       WHERE pool_id = v_pool.id AND user_id = v_user_id;
      RETURN jsonb_build_object('pool', public._pool_client_json(v_pool));
    END IF;
    RETURN jsonb_build_object('error', 'ALREADY_MEMBER');
  END IF;

  IF v_pool.member_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_member_count FROM pool_members
     WHERE pool_id = v_pool.id AND status = 'active';
    IF v_member_count >= v_pool.member_limit THEN
      SELECT (value #>> '{}')::boolean INTO v_founding_active
      FROM competition_config WHERE competition = 'global' AND key = 'founding_season_active';

      IF COALESCE(v_founding_active, false) THEN
        v_show_wall := 'member_cap';
      ELSE
        RETURN jsonb_build_object('error', 'upgrade_required', 'cap', v_pool.member_limit);
      END IF;
    END IF;
  END IF;

  INSERT INTO pool_members (pool_id, user_id, role, status, invite_code_used)
  VALUES (v_pool.id, v_user_id, 'member', 'active', v_normalized_code)
  ON CONFLICT (pool_id, user_id) DO UPDATE
    SET status = 'active', left_at = NULL, joined_at = now(),
        invite_code_used = v_normalized_code;

  RETURN jsonb_build_object('show_wall', v_show_wall, 'pool', public._pool_client_json(v_pool));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.join_pool_by_invite(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.join_pool_by_invite(text) TO authenticated, service_role;
