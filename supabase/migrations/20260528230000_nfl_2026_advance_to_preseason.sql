-- Advance nfl_2026 from OFF_SEASON to PRE_SEASON so the homepage
-- renders PreSeasonGamesHero ('PRESEASON IS HERE. Practice picks
-- all month. Scores reset for the regular season.') for testing.
-- Practice picks allowed; real scoring still gated until phase
-- flips to REGULAR on 2026-09-09.
UPDATE public.competition_config
SET value = '"PRE_SEASON"'::jsonb, updated_at = now()
WHERE competition = 'nfl_2026' AND key = 'current_phase';
