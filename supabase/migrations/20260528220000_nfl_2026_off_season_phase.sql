-- Flip nfl_2026.current_phase from PRE_SEASON to OFF_SEASON.
-- OFF_SEASON is the new sequential phase added per Tom's spec:
--   OFF_SEASON → PRE_SEASON → REGULAR → REGULAR_COMPLETE → PLAYOFFS → SUPERBOWL_INTRO → SUPERBOWL → SEASON_COMPLETE
--
-- The new client maps:
--   OFF_SEASON  → home state 'off_season_idle'   (was 'pre_season_idle')
--   PRE_SEASON  → home state 'pre_season_games'  (new — exhibition games window)
--
-- NFL 2026 windows:
--   Now → 2026-08-06:  OFF_SEASON
--   2026-08-06 → 2026-09-09: PRE_SEASON (exhibition games, picks allowed but no scoring)
--   2026-09-09+: REGULAR (picks open 2026-09-02)

UPDATE public.competition_config
SET value = '"OFF_SEASON"'::jsonb, updated_at = now()
WHERE competition = 'nfl_2026' AND key = 'current_phase';

INSERT INTO public.competition_config (competition, key, value, description, updated_at)
VALUES (
  'nfl_2026',
  'preseason_start_date',
  '"2026-08-06T00:00:00Z"'::jsonb,
  'First NFL 2026 preseason game. Flip current_phase to PRE_SEASON on this date.',
  now()
)
ON CONFLICT (competition, key) DO UPDATE
  SET value = EXCLUDED.value,
      description = EXCLUDED.description,
      updated_at = now();
