-- approve_pending_member  (Gaffer Approval Gate — Stage 1)
--
-- Organizer-gated. Flips a pending applicant to active, but FIRST re-checks the
-- member cap using the SAME source join_pool_by_invite reads: pools.member_limit
-- + competition_config 'founding_season_active' (never a hardcoded number).
-- Mirrors join's founding-season facade: during founding season an at-cap pool
-- still admits (facade parity with join); otherwise returns cap_exceeded and
-- does NOT activate. SECURITY DEFINER + search_path='' (all refs qualified).

CREATE OR REPLACE FUNCTION public.approve_pending_member(
  p_pool_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  v_caller          uuid := auth.uid();
  v_member_limit    int;
  v_active_count    int;
  v_founding_active boolean;
  v_updated         int;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('error', 'NOT_AUTHENTICATED');
  END IF;

  -- Organizer-gate: caller must be an ACTIVE organizer of this pool.
  IF NOT EXISTS (
    SELECT 1 FROM public.pool_members
     WHERE pool_id = p_pool_id AND user_id = v_caller
       AND role = 'organizer' AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('error', 'NOT_AUTHORIZED');
  END IF;

  -- Target must exist AND be pending.
  IF NOT EXISTS (
    SELECT 1 FROM public.pool_members
     WHERE pool_id = p_pool_id AND user_id = p_user_id AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object('error', 'NOT_PENDING');
  END IF;

  -- Cap re-check — same source + facade as join_pool_by_invite (lines 220-234).
  SELECT member_limit INTO v_member_limit
    FROM public.pools WHERE id = p_pool_id;

  IF v_member_limit IS NOT NULL THEN
    SELECT count(*) INTO v_active_count
      FROM public.pool_members
     WHERE pool_id = p_pool_id AND status = 'active';

    IF v_active_count >= v_member_limit THEN
      SELECT (value #>> '{}')::boolean INTO v_founding_active
        FROM public.competition_config
       WHERE competition = 'global' AND key = 'founding_season_active';

      IF NOT COALESCE(v_founding_active, false) THEN
        RETURN jsonb_build_object(
          'error', 'cap_exceeded', 'cap', v_member_limit, 'active_count', v_active_count);
      END IF;
      -- founding season → facade allows growth (parity with join).
    END IF;
  END IF;

  UPDATE public.pool_members
     SET status = 'active'
   WHERE pool_id = p_pool_id AND user_id = p_user_id AND status = 'pending';
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN jsonb_build_object('error', 'NOT_PENDING');
  END IF;

  RETURN jsonb_build_object('ok', true, 'user_id', p_user_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.approve_pending_member(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.approve_pending_member(uuid, uuid) TO authenticated, service_role;
