-- partner_admin_allow_director_role
--
-- League Tools (perk edit, public_info, roster-pass regen, partner
-- broadcasts) are gated by the single SECURITY DEFINER helper
-- `_caller_can_manage_partner`. It previously authorized only the Club
-- Pool's `organizer` (the de facto Partner Admin / "Chairman").
--
-- Decision #1 of the role-vocabulary work: a League's board is a Chairman
-- (Club Pool `organizer`) plus any number of Directors (Club Pool `admin`),
-- and Directors get the same League Tools access as the Chairman for now.
-- This widens the helper from `role = 'organizer'` to
-- `role IN ('organizer','admin')`.
--
-- No new role values: reuses the existing pool_members roles
-- (member / admin / organizer). `send-partner-broadcast` already allowed
-- ['organizer','admin']; this brings the perk/public_info/roster-pass RPCs
-- into line. Archive/role-changes on the Club Pool remain organizer-only
-- (Chairman-only) via PoolMembersScreen — the future-divergence hook.
-- ---------------------------------------------------------------------------

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

  RETURN v_role IN ('organizer', 'admin');
END;
$$;
