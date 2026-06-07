-- scorer_column_scoped_rpcs
--
-- Fixes from the scoring review for the live incremental scorer
-- (nfl-calculate-scores):
--
--  1. apply_season_pick_results — write per-pick is_correct/points in ONE
--     round-trip. The edge function did an unguarded N+1 update loop with no
--     error capture; a partial failure silently corrupted award inputs.
--
--  2. upsert_season_week_scores — upsert week totals with a COLUMN-SCOPED
--     ON CONFLICT. The edge function's full-row .upsert() rewrote is_no_show
--     and mulligan_used on every pass (and read-then-wrote mulligan racily).
--     Here those two columns are omitted from the UPDATE set, so they're
--     preserved — only the columns the scorer actually owns are touched.
--
-- Both are server-only (called by the edge function via the service role):
-- EXECUTE revoked from anon/authenticated/public, granted to service_role.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_season_pick_results(
  p_competition text,
  p_season_year integer,
  p_week        integer,
  p_results     jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.season_picks sp
     SET is_correct = (r.val->>'is_correct')::boolean,
         points     = (r.val->>'points')::integer
    FROM jsonb_array_elements(p_results) AS r(val)
   WHERE sp.user_id     = (r.val->>'user_id')::uuid
     AND sp.game_id     = (r.val->>'game_id')
     AND sp.competition = p_competition
     AND sp.season_year = p_season_year
     AND sp.week        = p_week;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.apply_season_pick_results(text, integer, integer, jsonb) FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION public.apply_season_pick_results(text, integer, integer, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_season_week_scores(
  p_competition text,
  p_season_year integer,
  p_week        integer,
  p_phase       text,
  p_aggs        jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  INSERT INTO public.season_user_totals (
    user_id, competition, season_year, week, phase,
    week_points, playoff_points, correct_picks, total_picks,
    is_hotpick_correct, hotpick_rank,
    double_down_used, double_down_delta,
    is_no_show, mulligan_used, scored_at
  )
  SELECT
    (a->>'user_id')::uuid, p_competition, p_season_year, p_week, p_phase,
    (a->>'week_points')::integer,
    CASE WHEN p_week >= 19 THEN (a->>'week_points')::integer ELSE 0 END,
    (a->>'correct_picks')::integer, (a->>'total_picks')::integer,
    CASE WHEN a->>'is_hotpick_correct' IS NULL THEN NULL
         ELSE (a->>'is_hotpick_correct')::boolean END,
    NULLIF(a->>'hotpick_rank', '')::integer,
    COALESCE((a->>'double_down_used')::boolean, false),
    COALESCE((a->>'double_down_delta')::integer, 0),
    false,   -- new rows: user has picks, so not a no-show
    false,   -- new rows: mulligan not used
    now()
  FROM jsonb_array_elements(p_aggs) AS a
  ON CONFLICT (user_id, competition, season_year, week) DO UPDATE SET
    phase              = EXCLUDED.phase,
    week_points        = EXCLUDED.week_points,
    playoff_points     = EXCLUDED.playoff_points,
    correct_picks      = EXCLUDED.correct_picks,
    total_picks        = EXCLUDED.total_picks,
    is_hotpick_correct = EXCLUDED.is_hotpick_correct,
    hotpick_rank       = EXCLUDED.hotpick_rank,
    double_down_used   = EXCLUDED.double_down_used,
    double_down_delta  = EXCLUDED.double_down_delta,
    scored_at          = now();
    -- is_no_show + mulligan_used deliberately NOT updated → preserved.
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.upsert_season_week_scores(text, integer, integer, text, jsonb) FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION public.upsert_season_week_scores(text, integer, integer, text, jsonb) TO service_role;
