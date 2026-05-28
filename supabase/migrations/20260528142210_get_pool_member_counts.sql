-- get_pool_member_counts
--
-- Returns active member counts for an array of pool ids in ONE query.
-- Replaces N+1 patterns in AdminPoolManagementScreen / ClubAdminScreen
-- that previously did a per-pool count(*) head request.
--
-- SECURITY DEFINER + GRANT to authenticated. Doesn't leak pool
-- contents — just an integer count per id. Counts are pool-level
-- aggregates already visible to any member or organizer of the pool.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_pool_member_counts(p_pool_ids uuid[])
RETURNS TABLE (pool_id uuid, member_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pm.pool_id, COUNT(*)::bigint AS member_count
    FROM pool_members pm
   WHERE pm.pool_id = ANY (p_pool_ids)
     AND pm.status  = 'active'
   GROUP BY pm.pool_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_pool_member_counts(uuid[]) TO authenticated;
