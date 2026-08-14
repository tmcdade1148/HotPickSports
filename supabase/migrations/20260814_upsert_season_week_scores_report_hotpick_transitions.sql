-- 20260814_upsert_season_week_scores_report_hotpick_transitions.sql
-- Return type changes integer -> jsonb, so DROP + CREATE is required.
-- CREATE OR REPLACE cannot change a return type. Both statements run in one
-- migration transaction, so the function is never missing to a concurrent caller.
--
-- WHY: nfl-calculate-scores posts a SmackTalk HotPick result on every run, with
-- no check for whether the result was already announced. auto_detect re-finds and
-- re-scores every week containing a FINAL game, so the same message reposts on
-- every cron tick (34 messages from 2 results overnight 2026-08-14). This makes
-- the RPC report which HotPick results moved NULL -> NOT NULL on THIS call, so
-- the scorer can announce a result only on the run where it first becomes known.
-- Matches the existing nfl-finalize-week pattern (announce on transition, not on
-- state). Write behaviour is byte-for-byte unchanged; only the return value moves.

DROP FUNCTION IF EXISTS public.upsert_season_week_scores(
  text, integer, integer, text, jsonb);

CREATE FUNCTION public.upsert_season_week_scores(
  p_competition text,
  p_season_year integer,
  p_week        integer,
  p_phase       text,
  p_aggs        jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count          integer;
  v_newly_resolved uuid[];
BEGIN
  WITH prior AS (
    -- State BEFORE this call. Snapshot taken at statement start.
    SELECT user_id, is_hotpick_correct
    FROM public.season_user_totals
    WHERE competition  = p_competition
      AND season_year  = p_season_year
      AND week         = p_week
  ),
  upserted AS (
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
      false,
      false,
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
      scored_at          = now()
    RETURNING user_id, is_hotpick_correct
  )
  SELECT
    count(*)::integer,
    COALESCE(
      array_agg(u.user_id) FILTER (
        WHERE u.is_hotpick_correct IS NOT NULL
          AND p.is_hotpick_correct IS NULL
      ),
      '{}'::uuid[]
    )
  INTO v_count, v_newly_resolved
  FROM upserted u
  LEFT JOIN prior p ON p.user_id = u.user_id;
  -- LEFT JOIN: a missing prior row yields NULL, which is the same condition as
  -- "row existed but result was still unknown". Both are genuine transitions.

  RETURN jsonb_build_object(
    'rows_written', v_count,
    'newly_resolved_hotpick_user_ids', to_jsonb(v_newly_resolved)
  );
END;
$function$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default. The prior function was
-- service_role + postgres only. Restore exactly that. Do not skip this.
REVOKE ALL ON FUNCTION public.upsert_season_week_scores(
  text, integer, integer, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_season_week_scores(
  text, integer, integer, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_season_week_scores(
  text, integer, integer, text, jsonb) TO postgres;
