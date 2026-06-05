-- Add a caller-membership guard to get_pool_pick_submissions.
-- This SECURITY DEFINER function previously returned every active member's
-- HotPick selection for any pool_id with no authorization check, bypassing
-- the season_picks own-row RLS. Require the caller (auth.uid()) to be an
-- ACTIVE member of the requested pool before any data is returned.
-- Function body below is otherwise byte-identical to the prior definition.
CREATE OR REPLACE FUNCTION public.get_pool_pick_submissions(p_pool_id uuid, p_competition text, p_week integer)
 RETURNS TABLE(user_id uuid, submitted_at timestamp with time zone, hotpick_team text, hotpick_game_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Caller-membership guard. Without this, the SECURITY DEFINER context lets
  -- any authenticated user read all members' HotPicks for an arbitrary pool.
  IF NOT EXISTS (
    SELECT 1
    FROM pool_members
    WHERE pool_id = p_pool_id
      AND user_id = auth.uid()
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Not authorized: caller is not an active member of pool %', p_pool_id
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT sp.user_id, sp.updated_at as submitted_at, sp.picked_team as hotpick_team, sp.game_id as hotpick_game_id
  FROM season_picks sp
  JOIN pool_members pm ON pm.user_id = sp.user_id AND pm.pool_id = p_pool_id AND pm.status = 'active'
  WHERE sp.competition = p_competition
    AND sp.week = p_week
    AND sp.is_hotpick = true;
END;
$function$;
