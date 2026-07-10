-- 260710_get_player_week_picks_is_correct.sql
--
-- Slice 3 (Lock-and-Reveal): extend get_player_week_picks to also return the
-- server-computed per-pick result (season_picks.is_correct) so the full-slate
-- accordion can color each pick win/loss/pending WITHOUT the client ever
-- deriving win/loss from scores/winner_team.
--
-- Pure column-add to the prior version: `is_correct boolean` added to
-- RETURNS TABLE and `sp.is_correct` to the final SELECT. The four gates
-- (caller-member, target-member, private-pool, after-lock) are UNCHANGED.
--
-- NOTE: This function was deployed via the Supabase editor (apply_migration
-- hangs in this environment); this file version-controls the exact live body.
-- It is a CREATE OR REPLACE and is safe to re-run.

CREATE OR REPLACE FUNCTION public.get_player_week_picks(
  p_pool_id uuid, p_competition text, p_week integer, p_target_user_id uuid)
 RETURNS TABLE(game_id text, picked_team text, is_hotpick boolean, is_correct boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_week_lock timestamptz;
BEGIN
  -- Gate 1: caller must be an active member of the pool.
  IF NOT EXISTS (
    SELECT 1 FROM pool_members
    WHERE pool_members.pool_id = p_pool_id
      AND pool_members.user_id = auth.uid()
      AND pool_members.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Not authorized: caller is not an active member of pool %', p_pool_id
      USING ERRCODE = '42501';
  END IF;

  -- Gate 2: target must be an active member of the same pool.
  IF NOT EXISTS (
    SELECT 1 FROM pool_members
    WHERE pool_members.pool_id = p_pool_id
      AND pool_members.user_id = p_target_user_id
      AND pool_members.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Target user is not an active member of pool %', p_pool_id
      USING ERRCODE = '42501';
  END IF;

  -- Gate 3: private pools only. Excludes public, global, designated-public,
  -- AND the partner's own official pool (owning_club_id set). Ordinary private
  -- pools that merely affiliated to a partner's roster ARE included.
  IF NOT EXISTS (
    SELECT 1 FROM pools
    WHERE pools.id = p_pool_id
      AND pools.is_public = false
      AND pools.is_global = false
      AND pools.is_designated_public = false
      AND pools.owning_club_id IS NULL
  ) THEN
    RETURN;
  END IF;

  -- Gate 4: after the week's first kickoff (lock). NULL lock time => not locked.
  v_week_lock := get_week_lock_time(p_competition, p_week);
  IF v_week_lock IS NULL OR now() < v_week_lock THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT sp.game_id, sp.picked_team, sp.is_hotpick, sp.is_correct
  FROM season_picks sp
  WHERE sp.user_id = p_target_user_id
    AND sp.competition = p_competition
    AND sp.week = p_week;
END;
$function$;
