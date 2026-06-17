-- fix_beta_tester_audit_target_id
--
-- admin_add_beta_tester_by_email / admin_remove_beta_tester wrote NULL into
-- admin_audit_log.target_id, which is NOT NULL — so the audit insert (and the
-- whole RPC) rolled back with a constraint violation and the tester was never
-- added/removed. Set target_id to the affected user's id (the natural target).
--
-- CREATE OR REPLACE preserves existing privileges, so the anon revoke +
-- authenticated/service_role grants from 20260608153000 stay intact — no GRANT
-- statements here on purpose.

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
    v_user_id,
    jsonb_build_object('competition', p_competition, 'user_id', v_user_id, 'email', lower(trim(p_email)))
  );

  RETURN v_user_id;
END;
$$;

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
    p_user_id,
    jsonb_build_object('competition', p_competition, 'user_id', p_user_id)
  );
END;
$$;
