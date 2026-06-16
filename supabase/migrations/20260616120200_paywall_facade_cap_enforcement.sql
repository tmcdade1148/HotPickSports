-- Organizer Paywall Facade (v1.1) — Part 3/3: cap enforcement
-- Spec: docs/ORGANIZER_PAYWALL_FACADE_SPEC.md §5a
--
-- Modifies the EXISTING create/join RPCs (no new function). Built on the latest
-- live bodies:
--   create_pool            <- 20260615180000 (super-admin = hidden member)
--   join_pool_by_invite    <- 20260615170000 (latest; 180000 did not redefine it)
--   join_public_contest    <- 20260615171000
--
-- THREE behavioural changes, all gated on competition_config.founding_season_active:
--   Step 0  create_pool: RETIRE the founding short-circuit. New free pools now get
--           member_limit = COALESCE(free_tier_max_members,10) instead of NULL, and
--           founding_pools_remaining is NO LONGER decremented. The is_founding_pool
--           column and the founding_pools_remaining config key are LEFT IN PLACE
--           (no DROP — Hard Rule #16). Without this, founding pools stay unlimited
--           (counter live at 82) and the wall can never fire.
--   Trigger B  create_pool: a 2nd-or-later Contest past free_tier_max_pools is
--           ALLOWED while founding_season_active=true (returns show_wall='pool_cap');
--           otherwise the existing pool_limit_reached/upgrade_required response.
--   Trigger A  join paths: growth past the pool's stored member_limit is ALLOWED
--           while founding_season_active=true (returns show_wall='member_cap');
--           otherwise upgrade_required (replaces the old hard 'pool_full').
--
-- Effective cap = the pool's STORED member_limit (no live-config re-read at
-- enforcement, no subscription lookup — the table is empty this season). This is
-- what grandfathers existing pools automatically: their stored member_limit is
-- never touched, so founding/over-cap/legacy-50 pools are never re-capped.
--
-- Boolean config read uses the codebase-canonical (value #>> '{}')::boolean.
--
-- NOTE (flag for Tom): join_public_contest is included for consistency so a
-- designated-public *free* pool walls instead of dead-ending at 'pool_full'.
-- Today the designated public contest is super-admin-owned (member_limit = NULL),
-- so this path is inert in practice; the change just removes a latent dead-end.

-- ════════════════════════════════════════════════════════════════════════════
-- create_pool — Step 0 (retire founding) + Trigger B (2nd Contest facade)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_pool(
  p_name text, p_competition text, p_is_public boolean DEFAULT false, p_invite_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_user_id            UUID := auth.uid();
  v_is_super           BOOLEAN := false;
  v_pool_id            UUID;
  v_pool               JSONB;
  v_free_max_pools     INT;
  v_active_pool_count  INT;
  v_member_limit       INT;
  v_free_max_members   INT;
  v_founding_active    BOOLEAN;
  v_show_wall          TEXT := NULL;          -- 'pool_cap' when Trigger B fires
  v_final_invite_code  TEXT;
  v_is_public_final    BOOLEAN;
  v_attempts           INT := 0;
  v_max_attempts       CONSTANT INT := 5;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  IF LENGTH(TRIM(p_name)) < 3 OR LENGTH(TRIM(p_name)) > 30 THEN
    RETURN jsonb_build_object('error', 'Pool name must be 3-30 characters');
  END IF;

  SELECT COALESCE(is_super_admin, false) INTO v_is_super FROM profiles WHERE id = v_user_id;

  IF v_is_super THEN
    -- Super-admin: public contest, unlimited members, no free-tier accounting.
    v_member_limit    := NULL;
    v_is_public_final := true;
  ELSE
    v_is_public_final := COALESCE(p_is_public, false);

    -- Trigger B: free-tier pool-count limit. (Founding short-circuit retired.)
    SELECT (value #>> '{}')::int INTO v_free_max_pools
    FROM competition_config WHERE competition = 'global' AND key = 'free_tier_max_pools';

    SELECT COUNT(*) INTO v_active_pool_count
    FROM pools
    WHERE (organizer_id = v_user_id OR created_by = v_user_id)
      AND is_archived = false AND deleted_at IS NULL;

    IF v_free_max_pools IS NOT NULL AND v_active_pool_count >= v_free_max_pools THEN
      SELECT (value #>> '{}')::boolean INTO v_founding_active
      FROM competition_config WHERE competition = 'global' AND key = 'founding_season_active';

      IF COALESCE(v_founding_active, false) THEN
        v_show_wall := 'pool_cap';          -- allow growth, prime the wall
      ELSE
        RETURN jsonb_build_object(
          'error', 'pool_limit_reached', 'upgrade_required', true,
          'current_pools', v_active_pool_count, 'max_pools', v_free_max_pools);
      END IF;
    END IF;

    SELECT (value #>> '{}')::int INTO v_free_max_members
    FROM competition_config WHERE competition = 'global' AND key = 'free_tier_max_members';
    v_member_limit := COALESCE(v_free_max_members, 10);
  END IF;

  v_final_invite_code := COALESCE(
    NULLIF(p_invite_code, ''),
    upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6)));

  WHILE EXISTS (SELECT 1 FROM pools WHERE pools.invite_code = v_final_invite_code) LOOP
    v_final_invite_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));
    v_attempts := v_attempts + 1;
    IF v_attempts >= v_max_attempts THEN
      RETURN jsonb_build_object('error', 'invite_code_generation_failed');
    END IF;
  END LOOP;

  v_attempts := 0;
  LOOP
    v_attempts := v_attempts + 1;
    BEGIN
      INSERT INTO pools (
        name, competition, created_by, organizer_id, is_public,
        invite_code, is_founding_pool, member_limit)
      VALUES (
        TRIM(p_name), p_competition, v_user_id, v_user_id, v_is_public_final,
        v_final_invite_code, false, v_member_limit)   -- is_founding_pool retired -> always false
      RETURNING id INTO v_pool_id;
      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        IF SQLERRM NOT ILIKE '%invite_code%' THEN RAISE; END IF;
        IF v_attempts >= v_max_attempts THEN
          RETURN jsonb_build_object('error', 'invite_code_generation_failed');
        END IF;
        v_final_invite_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));
    END;
  END LOOP;

  -- Creator becomes organizer member (super-admins are HIDDEN members — kept off
  -- ladder/roster/count by is_super_admin filters in read paths, not absent).
  INSERT INTO pool_members (pool_id, user_id, role, status)
  VALUES (v_pool_id, v_user_id, 'organizer', 'active');

  INSERT INTO pool_events (pool_id, competition, user_id, event_type, metadata)
  VALUES (v_pool_id, p_competition, v_user_id, 'POOL_CREATED',
          jsonb_build_object('is_founding', false, 'member_limit', v_member_limit,
                             'super_admin_owned', v_is_super, 'is_public', v_is_public_final,
                             'show_wall', v_show_wall));

  SELECT to_jsonb(p.*) INTO v_pool FROM pools p WHERE p.id = v_pool_id;
  RETURN jsonb_build_object('pool', v_pool, 'show_wall', v_show_wall);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_pool(text, text, boolean, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_pool(text, text, boolean, text) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- join_pool_by_invite — Trigger A (member-cap facade)
-- ════════════════════════════════════════════════════════════════════════════
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
  v_show_wall        text := NULL;           -- 'member_cap' when Trigger A fires
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

  -- Trigger A: growth past the stored member_limit.
  IF v_pool.member_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_member_count FROM pool_members
     WHERE pool_id = v_pool.id AND status = 'active';
    IF v_member_count >= v_pool.member_limit THEN
      SELECT (value #>> '{}')::boolean INTO v_founding_active
      FROM competition_config WHERE competition = 'global' AND key = 'founding_season_active';

      IF COALESCE(v_founding_active, false) THEN
        v_show_wall := 'member_cap';        -- allow growth, prime the wall
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

  RETURN jsonb_build_object('show_wall', v_show_wall, 'pool', jsonb_build_object(
    'id', v_pool.id, 'name', v_pool.name, 'competition', v_pool.competition,
    'is_global', v_pool.is_global, 'is_public', v_pool.is_public,
    'invite_code', v_pool.invite_code, 'brand_config', v_pool.brand_config,
    'created_at', v_pool.created_at));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.join_pool_by_invite(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.join_pool_by_invite(text) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- join_public_contest — same Trigger A facade (consistency; see header note)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.join_public_contest(p_competition text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id         uuid := auth.uid();
  v_pool            pools%ROWTYPE;
  v_member_count    bigint;
  v_founding_active boolean;
  v_show_wall       text := NULL;
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
  VALUES (v_pool.id, v_user_id, 'member', 'active', 'PUBLIC')
  ON CONFLICT (pool_id, user_id) DO UPDATE
    SET status = 'active', left_at = NULL, joined_at = now();

  RETURN jsonb_build_object('show_wall', v_show_wall, 'pool', jsonb_build_object(
    'id', v_pool.id, 'name', v_pool.name, 'competition', v_pool.competition,
    'is_global', v_pool.is_global, 'is_public', v_pool.is_public,
    'invite_code', v_pool.invite_code, 'brand_config', v_pool.brand_config,
    'created_at', v_pool.created_at));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.join_public_contest(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.join_public_contest(text) TO authenticated, service_role;
