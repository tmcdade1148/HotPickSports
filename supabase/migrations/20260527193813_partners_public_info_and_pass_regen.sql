-- partners_public_info_and_pass_regen
--
-- Two related additions for Club Manager's dedicated screen:
--   1. partners.public_info jsonb — holds address, hours, link, and
--      roster_page_message. Single jsonb so future fields don't churn
--      the schema.
--   2. update_partner_public_info() RPC — gated to the Club Pool's
--      organizer (the de facto Partner Admin) OR a super_admin.
--   3. regenerate_roster_pass() RPC — gated same way. Returns the
--      new pass; existing affiliated Contests are unaffected (they
--      hold their own affiliation rows, not the pass).
-- ---------------------------------------------------------------------------

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS public_info jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public._caller_can_manage_partner(p_partner_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller       uuid := auth.uid();
  v_is_super     boolean;
  v_club_pool_id uuid;
  v_role         text;
BEGIN
  IF v_caller IS NULL THEN
    RETURN false;
  END IF;

  SELECT is_super_admin INTO v_is_super FROM profiles WHERE id = v_caller;
  IF v_is_super THEN
    RETURN true;
  END IF;

  SELECT club_pool_id INTO v_club_pool_id FROM partners WHERE id = p_partner_id;
  IF v_club_pool_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT role INTO v_role
    FROM pool_members
   WHERE pool_id = v_club_pool_id
     AND user_id = v_caller
     AND status  = 'active';

  RETURN v_role = 'organizer';
END;
$$;

CREATE OR REPLACE FUNCTION public.update_partner_public_info(
  p_partner_id uuid,
  p_patch      jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current jsonb;
  v_merged  jsonb;
BEGIN
  IF NOT public._caller_can_manage_partner(p_partner_id) THEN
    RETURN jsonb_build_object('error', 'NOT_AUTHORIZED');
  END IF;

  SELECT public_info INTO v_current FROM partners WHERE id = p_partner_id;
  IF v_current IS NULL THEN
    v_current := '{}'::jsonb;
  END IF;

  v_merged := v_current || COALESCE(p_patch, '{}'::jsonb);

  UPDATE partners SET public_info = v_merged WHERE id = p_partner_id;

  RETURN jsonb_build_object('ok', true, 'public_info', v_merged);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_partner_public_info(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.regenerate_roster_pass(p_partner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pass TEXT;
BEGIN
  IF NOT public._caller_can_manage_partner(p_partner_id) THEN
    RETURN jsonb_build_object('error', 'NOT_AUTHORIZED');
  END IF;

  LOOP
    v_pass := public.generate_roster_pass();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM partners WHERE roster_pass = v_pass);
  END LOOP;

  UPDATE partners SET roster_pass = v_pass WHERE id = p_partner_id;

  RETURN jsonb_build_object('ok', true, 'roster_pass', v_pass);
END;
$$;

GRANT EXECUTE ON FUNCTION public.regenerate_roster_pass(uuid) TO authenticated;
