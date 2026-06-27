-- =============================================================================
-- Migration: Tie Handling — single source of truth for pool standings
-- Spec: 260627_HotPick_TieHandling_Spec_v3.docx (Parts B & C)
-- Register: 2.7 (game-tie drift) · 0.6 (chip vs Ladder — regular-season parity only)
-- =============================================================================
-- The Ladder, the rank chip, the crown, and the podium hardware each decided
-- rank/champion independently, with three different tie behaviors shipping live
-- (sequential A→Z, SQL RANK(), arbitrary array index). This migration introduces
-- ONE canonical ranking function that the Ladder, the crown trigger, the crown
-- edge function, and the podium hardware all read, so a tie can never be scored
-- differently on two surfaces again.
--
-- Two functions:
--   • compute_pool_standings — the full, INTERNAL keystone. Returns hotpick_points
--     (a brand-new, deliberately-private datum). NOT granted to authenticated;
--     only service_role (Edge Functions) + the SECURITY DEFINER callers below.
--   • get_pool_standings — the client-facing batch wrapper. Projects RANKS ONLY
--     (no points, no hotpick_points), access-guarded to pool members, granted to
--     authenticated. This is also the uuid[] batch entry point for the Home stack.
--
-- Hard Rules: #2 (no pool_id on scores — joined on user_id only), #3 (ranking is
-- server-side), #5 (ranks platform-assigned), #6 (frozen_rank read-only — read
-- via hotpick_rank, never rewritten).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- compute_pool_standings(p_pool_id, p_through_week)
-- INTERNAL keystone. Service-role / SECURITY DEFINER callers only.
--
-- total_points   : SUM(week_points) over the pool's REGULAR season (no playoff
--                  weeks — the crown is the regular-season winner).
-- hotpick_points : signed HotPick contribution, SUM over weeks:
--                    push / no HotPick (is_hotpick_correct IS NULL) -> 0
--                    correct  ->  +hotpick_rank (+ double_down_delta on a DD win = 2x)
--                    incorrect -> -hotpick_rank   (no delta on a loss)
--                  Equals the actual HotPick points the player scored.
-- standing_rank  : RANK() over total_points DESC — CO-RANKED (1,2,2,4). Display.
-- title_rank     : RANK() over total_points DESC, hotpick_points DESC — the
--                  champion/podium order. title_rank = 1 may be shared -> co-champions.
-- is_tied        : another member shares this exact total_points (i.e. standing_rank
--                  is shared). At standing_rank = 1, signals a points tie for the title.
--
-- p_through_week : optional upper bound on the week counted (inclusive). The Ladder
--                  passes the last SETTLED week so standing_rank matches its
--                  settled-only points column; the crown/podium pass NULL (whole
--                  regular season).
--
-- Mandatory filters baked in: active members only; super-admins EXCLUDED (the
-- hidden-member rule, so this matches the chip and the crown/podium stop including
-- admins); regular-season scope; pool_start_date -> NFL-week window (NOT a
-- calendar-week extract); season_year scoped for cross-year safety.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_pool_standings(
  p_pool_id      uuid,
  p_through_week int DEFAULT NULL
)
RETURNS TABLE (
  user_id        uuid,
  total_points   int,
  hotpick_points int,
  standing_rank  int,
  title_rank     int,
  is_tied        boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH pool AS (
    SELECT competition, pool_start_date
    FROM   pools
    WHERE  id = p_pool_id AND is_archived = false
  ),
  season AS (
    SELECT (cc.value #>> '{}')::int AS season_year
    FROM   competition_config cc, pool
    WHERE  cc.competition = pool.competition AND cc.key = 'season_year'
    LIMIT  1
  ),
  -- First scheduled week whose kickoff falls on/after pool_start_date. Mirrors
  -- get_user_ranks_in_pools / the crown trigger. NOT extract(week ...): a
  -- calendar week (1-53) does not map to the NFL season week and would empty
  -- the Ladder.
  start_week AS (
    SELECT COALESCE((
      SELECT g.week FROM season_games g, pool p
      WHERE  g.competition = p.competition AND g.kickoff_at >= p.pool_start_date
      ORDER  BY g.kickoff_at ASC LIMIT 1
    ), 1) AS wk
  ),
  members AS (
    SELECT pm.user_id
    FROM   pool_members pm
    JOIN   profiles pr ON pr.id = pm.user_id
    WHERE  pm.pool_id = p_pool_id AND pm.status = 'active'
      AND  NOT COALESCE(pr.is_super_admin, false)   -- hidden-member rule
  ),
  totals AS (
    SELECT t.user_id,
           SUM(t.week_points)::int AS total_points,
           SUM(
             CASE
               WHEN t.is_hotpick_correct IS NULL THEN 0
               WHEN t.is_hotpick_correct THEN
                 t.hotpick_rank
                 + COALESCE(CASE WHEN t.double_down_used THEN t.double_down_delta ELSE 0 END, 0)
               ELSE -t.hotpick_rank
             END
           )::int AS hotpick_points
    FROM   season_user_totals t
    JOIN   members m   ON m.user_id = t.user_id
    CROSS JOIN pool p
    CROSS JOIN start_week sw
    LEFT  JOIN season s ON true
    WHERE  t.competition = p.competition
      AND  t.phase = 'REGULAR'                       -- regular-season title only
      AND  t.week >= sw.wk                           -- mid-season pools start later
      AND  (p_through_week IS NULL OR t.week <= p_through_week)
      AND  (s.season_year IS NULL OR t.season_year = s.season_year)
    GROUP  BY t.user_id
  )
  SELECT
    user_id,
    total_points,
    hotpick_points,
    RANK() OVER (ORDER BY total_points DESC)::int                     AS standing_rank,
    RANK() OVER (ORDER BY total_points DESC, hotpick_points DESC)::int AS title_rank,
    (COUNT(*) OVER (PARTITION BY total_points) > 1)                   AS is_tied
  FROM totals;
$$;

-- Keystone is internal: it exposes per-member hotpick_points (a private datum).
-- Reserve it for service_role (Edge Functions) and the SECURITY DEFINER callers.
REVOKE ALL ON FUNCTION public.compute_pool_standings(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_pool_standings(uuid, int) TO service_role;

COMMENT ON FUNCTION public.compute_pool_standings(uuid, int) IS
  'INTERNAL canonical pool standings (Tie Handling spec). Returns total_points, '
  'hotpick_points (PRIVATE), standing_rank (co-ranked), title_rank (points then '
  'HotPick points), is_tied. Service-role / SECURITY DEFINER callers only — never '
  'grant to authenticated; clients use get_pool_standings (ranks only).';

-- -----------------------------------------------------------------------------
-- get_pool_standings(p_pool_ids, p_through_week)
-- CLIENT-facing batch wrapper. RANKS ONLY — never returns points or
-- hotpick_points. Access-guarded: returns rows only for pools the caller is an
-- active member of (super-admins may read any). One round trip for the Home
-- stack (Gap C) and the source of the Ladder's co-ranked rank + tie marker.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_pool_standings(
  p_pool_ids     uuid[],
  p_through_week int DEFAULT NULL
)
RETURNS TABLE (
  pool_id       uuid,
  user_id       uuid,
  standing_rank int,
  is_tied       boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pid AS pool_id, s.user_id, s.standing_rank, s.is_tied
  FROM   unnest(p_pool_ids) AS pid
  CROSS JOIN LATERAL public.compute_pool_standings(pid, p_through_week) s
  WHERE  EXISTS (
           SELECT 1 FROM pool_members pm
           WHERE pm.pool_id = pid AND pm.user_id = auth.uid() AND pm.status = 'active'
         )
      OR EXISTS (
           SELECT 1 FROM profiles pr
           WHERE pr.id = auth.uid() AND COALESCE(pr.is_super_admin, false)
         );
$$;

REVOKE ALL ON FUNCTION public.get_pool_standings(uuid[], int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pool_standings(uuid[], int) TO authenticated;

COMMENT ON FUNCTION public.get_pool_standings(uuid[], int) IS
  'Client-facing batch standings: (pool_id, user_id, standing_rank, is_tied) for '
  'pools the caller belongs to. Ranks only — per-member hotpick_points is never '
  'exposed (Tie Handling spec, Gap B). Batch entry point for the Home stack (Gap C).';

-- -----------------------------------------------------------------------------
-- Crown: regular-season winner Chirp, now via compute_pool_standings.
-- Champion = row(s) with title_rank = 1 (points, then HotPick points). A→Z gone.
--   • exactly one  -> single champion.
--   • more than one -> co-champions (genuinely level on points AND HotPick points).
-- Indicator: points were tied at the top (>1 member at standing_rank 1) AND the
-- HotPick-points rung produced a single champion -> the title was decided on
-- HotPick points; say so in the Chirp. (compute-hardware writes the matching
-- title_decided_by_hotpick_points flag onto the pool_champion context_json.)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.announce_regular_winners_on_phase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pool        RECORD;
  v_names       text;
  v_winner_pts  numeric;
  v_n_champ     int;
  v_n_top       int;
  v_decided_hp  boolean;
  v_text        text;
BEGIN
  -- Only act on a true transition INTO REGULAR_COMPLETE.
  IF (NEW.value #>> '{}') IS DISTINCT FROM 'REGULAR_COMPLETE' THEN
    RETURN NEW;
  END IF;
  IF (OLD.value #>> '{}') = 'REGULAR_COMPLETE' THEN
    RETURN NEW; -- already there; don't re-announce
  END IF;

  FOR v_pool IN
    SELECT id FROM pools
    WHERE competition = NEW.competition AND is_archived = false
  LOOP
    BEGIN
      -- Idempotency: skip pools already announced.
      IF EXISTS (
        SELECT 1 FROM smack_messages
        WHERE pool_id = v_pool.id AND message_type = 'regular_season_winner'
      ) THEN
        CONTINUE;
      END IF;

      -- Tie context from the canonical standings (full regular season).
      SELECT COUNT(*) FILTER (WHERE title_rank = 1),
             COUNT(*) FILTER (WHERE standing_rank = 1)
        INTO v_n_champ, v_n_top
      FROM compute_pool_standings(v_pool.id);

      IF v_n_champ IS NULL OR v_n_champ = 0 THEN
        CONTINUE; -- no scored members in this pool
      END IF;

      -- Champion name(s) + their (shared) points. Multiple names join with ' & '.
      SELECT string_agg(nm, ' & ' ORDER BY nm), MAX(total_points)
        INTO v_names, v_winner_pts
      FROM (
        SELECT COALESCE(
                 p.poolie_name,
                 CASE WHEN p.first_name IS NOT NULL
                      THEN p.first_name || CASE WHEN p.last_name IS NOT NULL
                                                THEN ' ' || left(p.last_name, 1) || '.' ELSE '' END
                      ELSE 'A player' END) AS nm,
               s.total_points
        FROM compute_pool_standings(v_pool.id) s
        LEFT JOIN profiles p ON p.id = s.user_id
        WHERE s.title_rank = 1
      ) champs;

      v_decided_hp := (v_n_top > 1 AND v_n_champ = 1);

      IF v_n_champ > 1 THEN
        v_text := '🏆 Regular season''s in the books! ' || v_names ||
                  ' share the crown as co-champions with ' || v_winner_pts::text ||
                  ' pts each. The playoff board resets now — everyone starts fresh.';
      ELSE
        v_text := '🏆 Regular season''s in the books! ' || v_names ||
                  ' takes the crown with ' || v_winner_pts::text || ' pts.' ||
                  CASE WHEN v_decided_hp
                       THEN ' Level on points — the title was decided on HotPick points.'
                       ELSE '' END ||
                  ' The playoff board resets now — everyone starts fresh.';
      END IF;

      PERFORM post_system_message(v_pool.id, v_text, 'regular_season_winner');
    EXCEPTION WHEN OTHERS THEN
      -- Never let an announcement error block the phase transition.
      RAISE WARNING 'announce_regular_winners: pool % failed: %', v_pool.id, SQLERRM;
    END;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- Trigger wiring is unchanged (AFTER UPDATE on competition_config WHEN key =
-- 'current_phase'); CREATE OR REPLACE above only swaps the function body.
