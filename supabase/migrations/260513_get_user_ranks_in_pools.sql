-- =============================================================================
-- Migration: 260513_get_user_ranks_in_pools
-- Spec: 260513_HotPick_HomeRedesign_Spec.docx §6.4.6 (Pool Module rank chip)
-- =============================================================================
-- Batch rank lookup: given a user_id and a list of pool_ids, return the user's
-- rank, the pool's member count, and the user's pool-scoped total points for
-- each pool — in a single round trip.
--
-- Why this exists:
--   The Pool Module renders one stacked card per visible private pool.
--   Each card shows a rank chip ('3rd of 28'). Computing rank per pool
--   independently from React useEffect would N+1 (spec §6.4.6 Red Flag).
--   This RPC respects:
--     • Hard Rule #2 — scores have no pool_id; we join pool_members → totals
--                      on user_id only
--     • Hard Rule #3 — aggregation is server-side, never in the client
--     • Hard Rule #8 — SECURITY INVOKER preserves the caller's RLS context
--
-- Aligned partner pools should NOT be passed here; per the locked product
-- decision (May 13, 2026), partner pools are not ranked anywhere in the
-- product — they appear as a flat list on Partner Roster only. The client
-- filters its pool_ids to non-partner pools before calling.
--
-- Roll back:
--   DROP FUNCTION IF EXISTS public.get_user_ranks_in_pools(uuid, uuid[]);
-- =============================================================================

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
  -- First scheduled week whose kickoff falls on or after pool_start_date.
  -- Mirrors the seasonStore.fetchLeaderboard pattern (REFERENCE.md §7).
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
  WHERE  pm.pool_id = ANY(p_pool_ids) AND pm.status = 'active'
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

COMMENT ON FUNCTION public.get_user_ranks_in_pools(uuid, uuid[]) IS
  'Batch rank lookup for Pool Module: returns (pool_id, user_rank, member_count, user_total) for the given user across the given private pools. Client must NOT pass partner-aligned pool IDs — partner pools are not ranked per the May 13 2026 locked product decision.';
