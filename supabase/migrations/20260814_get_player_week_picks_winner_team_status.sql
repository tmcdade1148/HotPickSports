-- 20260814_get_player_week_picks_winner_team_status.sql
--
-- Applied live 2026-08-14 and committed here after the fact to close repo/live
-- drift. (Two Edge Functions sat production-only for months off exactly this
-- gap; this file exists so a rebuild reproduces the live signature.)
--
-- WHY: PlayerSlateAccordion colours each pick from season_picks.is_correct,
-- which stays NULL forever for a DRAW — scoring.ts skips draws deliberately
-- (a draw is never a loss, register 2.7). With only is_correct on the wire the
-- client CANNOT tell "tied" from "not scored yet", so a tied game renders as
-- pending for the rest of the season. Adding winner_team + game_status makes
-- the two separable client-side, using the SAME condition GameChip applies:
--   game_status FINAL && winner_team IS NULL  -> TIE (resolved, neutral, 0)
--
-- The four gates are unchanged and verbatim: caller is an active pool member,
-- target is an active member of the same pool, the pool is private, and the
-- week has locked. Same shape as the July is_correct column-add.
--
-- The LEFT JOIN is deliberate: a missing season_games row returns NULL for both
-- new columns, which the client reads as PENDING. A tie must never be inferred
-- from an absent game.
--
-- Return type changes (columns added to RETURNS TABLE), so this is a
-- DROP + CREATE, not a CREATE OR REPLACE.
--
-- GRANTS: intentionally not restated here, to record the live state honestly
-- rather than silently changing it. This function has carried Supabase's
-- default privileges since July (the 260710 migration specifies no grants at
-- all), so EXECUTE is currently held by PUBLIC/anon/authenticated as well as
-- postgres/service_role. That is posture, not a leak — gate 1 raises 42501 when
-- auth.uid() is null, so an anon caller never reaches a row. Tightening it to
-- `authenticated` only belongs in its own migration, applied deliberately.

DROP FUNCTION IF EXISTS public.get_player_week_picks(uuid, text, integer, uuid);

CREATE FUNCTION public.get_player_week_picks(
  p_pool_id        uuid,
  p_competition    text,
  p_week           integer,
  p_target_user_id uuid
)
RETURNS TABLE(
  game_id     text,
  picked_team text,
  is_hotpick  boolean,
  is_correct  boolean,
  winner_team text,
  game_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_week_lock timestamptz;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pool_members
    WHERE pool_members.pool_id = p_pool_id
      AND pool_members.user_id = auth.uid()
      AND pool_members.status  = 'active'
  ) THEN
    RAISE EXCEPTION 'Not authorized: caller is not an active member of pool %', p_pool_id
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pool_members
    WHERE pool_members.pool_id = p_pool_id
      AND pool_members.user_id = p_target_user_id
      AND pool_members.status  = 'active'
  ) THEN
    RAISE EXCEPTION 'Target user is not an active member of pool %', p_pool_id
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pools
    WHERE pools.id                   = p_pool_id
      AND pools.is_public            = false
      AND pools.is_global            = false
      AND pools.is_designated_public = false
      AND pools.owning_club_id IS NULL
  ) THEN
    RETURN;
  END IF;

  v_week_lock := get_week_lock_time(p_competition, p_week);
  IF v_week_lock IS NULL OR now() < v_week_lock THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT sp.game_id, sp.picked_team, sp.is_hotpick, sp.is_correct,
         sg.winner_team, sg.status
  FROM season_picks sp
  LEFT JOIN season_games sg
    ON sg.game_id     = sp.game_id
   AND sg.competition = sp.competition
  WHERE sp.user_id     = p_target_user_id
    AND sp.competition = p_competition
    AND sp.week        = p_week;
END;
$function$;
