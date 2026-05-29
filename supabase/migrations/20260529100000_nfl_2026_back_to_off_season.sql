-- Flip nfl_2026 back from PRE_SEASON to OFF_SEASON (testing the
-- two heroes side-by-side). Homepage renders OffSeasonHero again.
UPDATE public.competition_config
SET value = '"OFF_SEASON"'::jsonb, updated_at = now()
WHERE competition = 'nfl_2026' AND key = 'current_phase';
