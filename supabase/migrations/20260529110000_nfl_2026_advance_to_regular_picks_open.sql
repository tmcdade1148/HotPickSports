-- Advance nfl_2026 into the in-cycle picks_open state so the
-- homepage renders PicksOpenHero (countdown + HotPick card + Week 1
-- picks UI).
-- current_phase: OFF_SEASON → REGULAR
-- week_state:    idle → picks_open
-- current_week stays at 1.
UPDATE public.competition_config
SET value = '"REGULAR"'::jsonb, updated_at = now()
WHERE competition = 'nfl_2026' AND key = 'current_phase';

UPDATE public.competition_config
SET value = '"picks_open"'::jsonb, updated_at = now()
WHERE competition = 'nfl_2026' AND key = 'week_state';
