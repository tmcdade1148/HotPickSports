-- Hide super-admins from public-facing rank + member-count surfaces.
-- Super-admins are hidden members of contests they create (20260615180000):
-- they manage normally but must NOT appear on ladders, rosters, or counts.
-- This is the server half (the two ranking/count RPCs); the client stores
-- apply the matching profiles.is_super_admin filter on their leaderboard reads.

-- get_user_ranks_in_pools: exclude super-admins from the ranked set AND the
-- member_count by filtering them out of the active_members CTE. (If the caller
-- is themselves a super-admin, they simply get no rank row for that pool.)
CREATE OR REPLACE FUNCTION public.get_user_ranks_in_pools(
  p_user_id  uuid,
  p_pool_ids uuid[]
)
RETURNS TABLE (
  pool_id      uuid,
  user_rank    int,
  member_count int,
  user_total   int
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH
target_pools AS (
  SELECT id, competition, pool_start_date
  FROM   public.pools
  WHERE  id = ANY(p_pool_ids)
    AND  is_archived = false
),
pool_start_weeks AS (
  SELECT
    tp.id AS pool_id,
    tp.competition,
    COALESCE((
      SELECT g.week
      FROM   public.season_games g
      WHERE  g.competition = tp.competition
        AND  g.kickoff_at >= tp.pool_start_date
      ORDER  BY g.kickoff_at ASC
      LIMIT  1
    ), 1) AS start_week
  FROM target_pools tp
),
active_members AS (
  SELECT pm.pool_id, pm.user_id
  FROM   public.pool_members pm
  JOIN   public.profiles pr ON pr.id = pm.user_id
  WHERE  pm.pool_id = ANY(p_pool_ids) AND pm.status = 'active'
    AND  NOT COALESCE(pr.is_super_admin, false)
),
member_counts AS (
  SELECT pool_id, COUNT(*)::int AS cnt
  FROM   active_members
  GROUP  BY pool_id
),
per_user_totals AS (
  SELECT
    am.pool_id,
    am.user_id,
    COALESCE(SUM(t.week_points + COALESCE(t.playoff_points, 0)), 0)::int AS total_points
  FROM   active_members am
  JOIN   pool_start_weeks psw ON psw.pool_id = am.pool_id
  LEFT JOIN public.season_user_totals t
    ON   t.user_id     = am.user_id
    AND  t.competition = psw.competition
    AND  t.week        >= psw.start_week
  GROUP BY am.pool_id, am.user_id
),
ranked AS (
  SELECT
    pool_id,
    user_id,
    total_points,
    RANK() OVER (PARTITION BY pool_id ORDER BY total_points DESC) AS rank_in_pool
  FROM per_user_totals
)
SELECT
  r.pool_id,
  r.rank_in_pool::int,
  mc.cnt,
  r.total_points
FROM ranked r
JOIN member_counts mc ON mc.pool_id = r.pool_id
WHERE r.user_id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_ranks_in_pools(uuid, uuid[]) TO authenticated;

-- get_pool_member_counts: exclude super-admins from the headcount.
CREATE OR REPLACE FUNCTION public.get_pool_member_counts(p_pool_ids uuid[])
RETURNS TABLE (pool_id uuid, member_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pm.pool_id, COUNT(*)::bigint AS member_count
    FROM pool_members pm
    JOIN profiles pr ON pr.id = pm.user_id
   WHERE pm.pool_id = ANY (p_pool_ids)
     AND pm.status  = 'active'
     AND NOT COALESCE(pr.is_super_admin, false)
   GROUP BY pm.pool_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_pool_member_counts(uuid[]) TO authenticated;
