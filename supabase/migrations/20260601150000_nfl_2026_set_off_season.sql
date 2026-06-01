-- Flip nfl_2026 to OFF_SEASON / idle for testing the off-season home.
UPDATE public.competition_config
SET value = '"OFF_SEASON"'::jsonb, updated_at = now()
WHERE competition = 'nfl_2026' AND key = 'current_phase';

UPDATE public.competition_config
SET value = '"idle"'::jsonb, updated_at = now()
WHERE competition = 'nfl_2026' AND key = 'week_state';
