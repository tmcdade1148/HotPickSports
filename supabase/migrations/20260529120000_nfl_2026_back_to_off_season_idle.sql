-- Roll nfl_2026 back to today's real state for role-based testing.
UPDATE public.competition_config
SET value = '"OFF_SEASON"'::jsonb, updated_at = now()
WHERE competition = 'nfl_2026' AND key = 'current_phase';

UPDATE public.competition_config
SET value = '"idle"'::jsonb, updated_at = now()
WHERE competition = 'nfl_2026' AND key = 'week_state';
