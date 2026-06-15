-- Pivot: super-admins are HIDDEN MEMBERS of contests they create (per Tom,
-- 2026-06-15), replacing the creator-only/no-member model from 20260615170000.
--
-- A super-admin who creates a contest now gets a normal pool_members row
-- (role 'organizer', active) so the contest shows up in their list and
-- management works through membership like any owner. They remain forced
-- public + unlimited members. They are kept OFF public-facing surfaces
-- (ladder, roster, member count) by filtering on profiles.is_super_admin in
-- those read paths -- NOT by withholding the membership row.
--
-- join_pool_by_invite / join_public_contest still reject super-admins: they
-- only ever become members of contests they CREATE, never ones they join.

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
  v_founding_remaining INT;
  v_is_founding        BOOLEAN := false;
  v_free_max_pools     INT;
  v_active_pool_count  INT;
  v_member_limit       INT;
  v_free_max_members   INT;
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
    -- Super-admin: public contest, unlimited members, no founding/free accounting.
    v_member_limit    := NULL;
    v_is_founding     := false;
    v_is_public_final := true;
  ELSE
    v_is_public_final := COALESCE(p_is_public, false);
    SELECT (value)::int INTO v_founding_remaining
    FROM competition_config WHERE competition = 'global' AND key = 'founding_pools_remaining';

    IF v_founding_remaining IS NOT NULL AND v_founding_remaining > 0 THEN
      v_is_founding := true;
      v_member_limit := NULL;
      UPDATE competition_config
      SET value = to_jsonb(v_founding_remaining - 1), updated_at = NOW()
      WHERE competition = 'global' AND key = 'founding_pools_remaining';
    ELSE
      SELECT (value)::int INTO v_free_max_pools
      FROM competition_config WHERE competition = 'global' AND key = 'free_tier_max_pools';

      SELECT COUNT(*) INTO v_active_pool_count
      FROM pools
      WHERE (organizer_id = v_user_id OR created_by = v_user_id)
        AND is_archived = false AND deleted_at IS NULL;

      IF v_free_max_pools IS NOT NULL AND v_active_pool_count >= v_free_max_pools THEN
        RETURN jsonb_build_object(
          'error', 'pool_limit_reached', 'upgrade_required', true,
          'current_pools', v_active_pool_count, 'max_pools', v_free_max_pools);
      END IF;

      SELECT (value)::int INTO v_free_max_members
      FROM competition_config WHERE competition = 'global' AND key = 'free_tier_max_members';
      v_member_limit := COALESCE(v_free_max_members, 10);
    END IF;
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
        v_final_invite_code, v_is_founding, v_member_limit)
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

  -- Add the creator as an organizer member -- including super-admins, who are
  -- now HIDDEN members (kept off ladder/roster/count by is_super_admin filters
  -- in the read paths), not absent members.
  INSERT INTO pool_members (pool_id, user_id, role, status)
  VALUES (v_pool_id, v_user_id, 'organizer', 'active');

  INSERT INTO pool_events (pool_id, competition, user_id, event_type, metadata)
  VALUES (v_pool_id, p_competition, v_user_id, 'POOL_CREATED',
          jsonb_build_object('is_founding', v_is_founding, 'member_limit', v_member_limit,
                             'super_admin_owned', v_is_super, 'is_public', v_is_public_final));

  SELECT to_jsonb(p.*) INTO v_pool FROM pools p WHERE p.id = v_pool_id;
  RETURN jsonb_build_object('pool', v_pool);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_pool(text, text, boolean, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_pool(text, text, boolean, text) TO authenticated, service_role;

-- Backfill: re-activate hidden membership for contests a super-admin OWNS.
-- The earlier purge (20260615172000) set these to status='left'; new contests
-- created under the brief creator-only window have no row at all. Cover both:
--   * reactivate any 'left'/inactive row where they are the organizer_id
--   * insert a row for owned pools that have none
-- Scope: organizer_id = a super-admin, non-archived, not deleted. Pools they
-- merely JOINED (didn't create) stay purged -- super-admins can't be members
-- of contests they didn't create.
INSERT INTO public.pool_members (pool_id, user_id, role, status)
SELECT p.id, p.organizer_id, 'organizer', 'active'
FROM public.pools p
JOIN public.profiles pr ON pr.id = p.organizer_id AND pr.is_super_admin = true
WHERE p.is_archived = false AND p.deleted_at IS NULL
ON CONFLICT (pool_id, user_id) DO UPDATE
  SET status = 'active', left_at = NULL, role = 'organizer';
