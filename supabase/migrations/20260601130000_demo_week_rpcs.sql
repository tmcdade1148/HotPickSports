-- Demo Week — entry/reset RPCs. Spec: docs/DEMO_WEEK_SPEC.md §6.
--
-- Both SECURITY DEFINER, scoped to the nfl_demo sandbox and the caller only
-- (auth.uid()). Sandbox-scoped, so exempt from admin_audit_log (Hard Rule #17).
-- Picks/scores remain user-scoped (no pool_id) per Hard Rule #2.

-- enter_demo(): idempotent demo (re)entry. Wipes the caller's prior demo run
-- so every entry is a clean slate, and ensures the caller is an active member
-- of the hidden demo pool (so activePoolId plumbing + Chirps work).
CREATE OR REPLACE FUNCTION public.enter_demo()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'enter_demo: authentication required';
  END IF;

  DELETE FROM season_picks       WHERE user_id = uid AND competition = 'nfl_demo';
  DELETE FROM season_user_totals WHERE user_id = uid AND competition = 'nfl_demo';

  INSERT INTO pool_members (pool_id, user_id, role, status)
  VALUES ('d0d0d0d0-0000-4000-8000-000000000001', uid, 'member', 'active')
  ON CONFLICT (pool_id, user_id)
  DO UPDATE SET status = 'active', left_at = NULL;
END;
$$;

-- reset_demo(): wipe the caller's demo picks + scores without touching
-- membership. Used by a "Try again" affordance. Never mutates game rows.
CREATE OR REPLACE FUNCTION public.reset_demo()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'reset_demo: authentication required';
  END IF;

  DELETE FROM season_picks       WHERE user_id = uid AND competition = 'nfl_demo';
  DELETE FROM season_user_totals WHERE user_id = uid AND competition = 'nfl_demo';
END;
$$;

GRANT EXECUTE ON FUNCTION public.enter_demo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_demo() TO authenticated;
