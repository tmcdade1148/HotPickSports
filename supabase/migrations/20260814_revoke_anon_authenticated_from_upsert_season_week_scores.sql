-- Supabase's default privileges grant EXECUTE on new public functions to anon
-- and authenticated. Those are explicit role grants, so REVOKE ... FROM PUBLIC
-- does not remove them. Without this the DROP+CREATE above re-exposes a
-- SECURITY DEFINER score writer to anon. Verified live 2026-08-14.
REVOKE ALL ON FUNCTION public.upsert_season_week_scores(
  text, integer, integer, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.upsert_season_week_scores(
  text, integer, integer, text, jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION public.upsert_season_week_scores(
  text, integer, integer, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_season_week_scores(
  text, integer, integer, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_season_week_scores(
  text, integer, integer, text, jsonb) TO postgres;
