-- Super-admin RPCs backing the Beta Testers admin screen.
-- All three gate on profiles.is_super_admin and run SECURITY DEFINER
-- so the caller (admin client) can resolve auth.users.email without
-- needing direct read access to the auth schema.

CREATE OR REPLACE FUNCTION public.admin_list_beta_testers(p_competition text)
RETURNS TABLE (user_id uuid, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true) THEN
    RAISE EXCEPTION 'Forbidden: super_admin only';
  END IF;

  RETURN QUERY
    SELECT u.id, u.email::text
    FROM public.competition_access ca,
         unnest(ca.beta_user_ids) AS bid
    JOIN auth.users u ON u.id = bid
    WHERE ca.competition = p_competition
    ORDER BY u.email;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_beta_testers(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_add_beta_tester_by_email(p_competition text, p_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_admin uuid := auth.uid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_admin AND is_super_admin = true) THEN
    RAISE EXCEPTION 'Forbidden: super_admin only';
  END IF;

  SELECT u.id INTO v_user_id
  FROM auth.users u
  WHERE lower(u.email) = lower(trim(p_email))
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No user found for email %', p_email;
  END IF;

  INSERT INTO public.competition_access (competition, is_public, beta_user_ids, notes, updated_by, updated_at)
  VALUES (p_competition, false, ARRAY[v_user_id]::uuid[], 'Auto-created by admin_add_beta_tester_by_email', v_admin, now())
  ON CONFLICT (competition) DO UPDATE
    SET beta_user_ids = CASE
          WHEN v_user_id = ANY(public.competition_access.beta_user_ids)
            THEN public.competition_access.beta_user_ids
          ELSE public.competition_access.beta_user_ids || v_user_id
        END,
        updated_by = v_admin,
        updated_at = now();

  INSERT INTO public.admin_audit_log (admin_id, action, target_table, target_id, metadata)
  VALUES (
    v_admin,
    'BETA_TESTER_ADDED',
    'competition_access',
    NULL,
    jsonb_build_object('competition', p_competition, 'user_id', v_user_id, 'email', lower(trim(p_email)))
  );

  RETURN v_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_add_beta_tester_by_email(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_remove_beta_tester(p_competition text, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_admin AND is_super_admin = true) THEN
    RAISE EXCEPTION 'Forbidden: super_admin only';
  END IF;

  UPDATE public.competition_access
  SET beta_user_ids = array_remove(beta_user_ids, p_user_id),
      updated_by = v_admin,
      updated_at = now()
  WHERE competition = p_competition;

  INSERT INTO public.admin_audit_log (admin_id, action, target_table, target_id, metadata)
  VALUES (
    v_admin,
    'BETA_TESTER_REMOVED',
    'competition_access',
    NULL,
    jsonb_build_object('competition', p_competition, 'user_id', p_user_id)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_remove_beta_tester(text, uuid) TO authenticated;
