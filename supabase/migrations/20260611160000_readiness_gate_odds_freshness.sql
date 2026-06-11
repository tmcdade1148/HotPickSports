-- =====================================================================
-- Harden the week-readiness gate (the pre-check behind open_week_picks):
-- add an odds/ranks FRESHNESS+ORDERING guard so a stale prior-state row can't
-- satisfy the gate even if its counts coincidentally line up.
--
-- open_week_picks -> _assert_week_ready -> _week_readiness_is_ready(r) must be TRUE.
-- Existing checks (unchanged): games/odds/ranks all 'ok', odds_count=odds_expected,
-- ranks_count=games_count. Added: odds were fetched for THIS cycle's imported
-- schedule (odds_at >= games_at) and ranks were computed from THOSE odds
-- (ranks_at >= odds_at). Compares row timestamps only -> stays IMMUTABLE (no now()).
-- =====================================================================
CREATE OR REPLACE FUNCTION public._week_readiness_is_ready(r week_readiness)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  SELECT r.games_status = 'ok' AND r.odds_status = 'ok' AND r.ranks_status = 'ok'
     AND r.odds_count  IS NOT NULL AND r.odds_expected IS NOT NULL AND r.odds_count  = r.odds_expected
     AND r.ranks_count IS NOT NULL AND r.games_count   IS NOT NULL AND r.ranks_count = r.games_count
     -- freshness/ordering: odds fetched for the current schedule, ranks from those odds
     AND r.games_at IS NOT NULL AND r.odds_at IS NOT NULL AND r.ranks_at IS NOT NULL
     AND r.odds_at  >= r.games_at
     AND r.ranks_at >= r.odds_at;
$function$;
