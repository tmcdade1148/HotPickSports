-- Point nfl_2025_sim's regular-season opener + picks-open dates at the future
-- (mirror nfl_2026) so the PRE_SEASON countdown shows a real, reviewable value
-- instead of "0 minutes" (its prior 2026-04-09 opener was in the past).
-- Display-only — the sim's week mechanics use current_week explicitly.
UPDATE public.competition_config
SET value = '"2026-09-09"'::jsonb, updated_at = now()
WHERE competition = 'nfl_2025_sim' AND key = 'season_opener_date';

UPDATE public.competition_config
SET value = '"2026-09-02T13:00:00Z"'::jsonb, updated_at = now()
WHERE competition = 'nfl_2025_sim' AND key = 'season_picks_open_at';
