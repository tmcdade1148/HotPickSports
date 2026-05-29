-- The Platform Pool (is_global=true, is_hidden_from_users=true) was
-- being hidden only by a client-side filter in fetchUserPools — RLS
-- still leaked it on direct queries. Enforce the hide-from-users
-- flag at the RLS layer so it's super-admin-only no matter which
-- code path reads pools.

DROP POLICY IF EXISTS pools_select ON public.pools;

CREATE POLICY pools_select ON public.pools
FOR SELECT
USING (
  deleted_at IS NULL
  AND user_can_see_competition(competition, auth.uid())
  AND (
    is_global = true
    OR id IN (
      SELECT pool_members.pool_id FROM public.pool_members
      WHERE pool_members.user_id = auth.uid()
        AND pool_members.status = 'active'
    )
  )
  -- Hide is_hidden_from_users pools from everyone except super admins.
  -- The Platform Pool is the canonical case — staff-only analytics
  -- visibility per the April 2026 spec.
  AND (
    is_hidden_from_users IS NOT TRUE
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_super_admin = true
    )
  )
);
