-- create_pool_retry_invite_code_collision
--
-- Make invite_code collisions impossible to surface to the user:
--   • If the client passes an invite_code, try it; if it collides
--     (32⁶ ≈ 1B space, so vanishingly rare in practice), the server
--     regenerates instead of throwing.
--   • Wrap the actual INSERT in EXCEPTION WHEN unique_violation so a
--     race between the EXISTS pre-check and the INSERT (microsecond
--     window) is also handled — regenerate and retry.
--   • Bounded retry (max 5 attempts) so a pathological case can't
--     loop forever — at which point we return a structured error
--     and let the caller report it.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_pool(
  p_name        text,
  p_competition text,
  p_is_public   boolean DEFAULT false,
  p_invite_code text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id            UUID := auth.uid();
  v_pool_id            UUID;
  v_pool               JSONB;
  v_founding_remaining INT;
  v_is_founding        BOOLEAN := false;
  v_free_max_pools     INT;
  v_active_pool_count  INT;
  v_member_limit       INT;
  v_free_max_members   INT;
  v_final_invite_code  TEXT;
  v_attempts           INT := 0;
  v_max_attempts       CONSTANT INT := 5;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  IF LENGTH(TRIM(p_name)) < 3 OR LENGTH(TRIM(p_name)) > 30 THEN
    RETURN jsonb_build_object('error', 'Pool name must be 3-30 characters');
  END IF;

  SELECT (value)::int INTO v_founding_remaining
  FROM competition_config
  WHERE competition = 'global' AND key = 'founding_pools_remaining';

  IF v_founding_remaining IS NOT NULL AND v_founding_remaining > 0 THEN
    v_is_founding := true;
    v_member_limit := NULL;
    UPDATE competition_config
    SET value = to_jsonb(v_founding_remaining - 1), updated_at = NOW()
    WHERE competition = 'global' AND key = 'founding_pools_remaining';
  ELSE
    SELECT (value)::int INTO v_free_max_pools
    FROM competition_config
    WHERE competition = 'global' AND key = 'free_tier_max_pools';

    SELECT COUNT(*) INTO v_active_pool_count
    FROM pools
    WHERE (organizer_id = v_user_id OR created_by = v_user_id)
      AND is_archived = false
      AND deleted_at IS NULL;

    IF v_free_max_pools IS NOT NULL AND v_active_pool_count >= v_free_max_pools THEN
      RETURN jsonb_build_object(
        'error', 'pool_limit_reached',
        'upgrade_required', true,
        'current_pools', v_active_pool_count,
        'max_pools', v_free_max_pools
      );
    END IF;

    SELECT (value)::int INTO v_free_max_members
    FROM competition_config
    WHERE competition = 'global' AND key = 'free_tier_max_members';

    v_member_limit := COALESCE(v_free_max_members, 10);
  END IF;

  v_final_invite_code := COALESCE(
    NULLIF(p_invite_code, ''),
    upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6))
  );

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
        invite_code, is_founding_pool, member_limit
      )
      VALUES (
        TRIM(p_name), p_competition, v_user_id, v_user_id, p_is_public,
        v_final_invite_code, v_is_founding, v_member_limit
      )
      RETURNING id INTO v_pool_id;
      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        IF SQLERRM NOT ILIKE '%invite_code%' THEN
          RAISE;
        END IF;
        IF v_attempts >= v_max_attempts THEN
          RETURN jsonb_build_object('error', 'invite_code_generation_failed');
        END IF;
        v_final_invite_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));
    END;
  END LOOP;

  INSERT INTO pool_members (pool_id, user_id, role, status)
  VALUES (v_pool_id, v_user_id, 'organizer', 'active');

  INSERT INTO pool_events (pool_id, competition, user_id, event_type, metadata)
  VALUES (v_pool_id, p_competition, v_user_id, 'POOL_CREATED',
          jsonb_build_object('is_founding', v_is_founding, 'member_limit', v_member_limit));

  SELECT to_jsonb(p.*) INTO v_pool
  FROM pools p WHERE p.id = v_pool_id;

  RETURN jsonb_build_object('pool', v_pool);
END;
$function$;
