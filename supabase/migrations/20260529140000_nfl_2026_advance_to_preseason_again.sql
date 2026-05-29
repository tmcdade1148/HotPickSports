UPDATE public.competition_config
SET value = '"PRE_SEASON"'::jsonb, updated_at = now()
WHERE competition = 'nfl_2026' AND key = 'current_phase';
