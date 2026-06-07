-- Weekly Engine §4b — correct season_picks_open_at (260605_HotPick_WeeklyEngine_Spec v1.0).
--
-- The Week-1 / PRE_SEASON countdown anchor was set to 9am ET (13:00 UTC), which is
-- wrong. Picks open at 7am ET = 11:00 UTC (EDT, football season). Correct the value
-- and its description. This stays the Week-1 anchor only; the rolling per-week value
-- lives in next_picks_open_at (§4a), never overloaded onto this key.
UPDATE competition_config
SET value = to_jsonb('2026-09-02T11:00:00Z'::text),
    description = 'When Week 1 picks open — Wednesday September 2 2026 at 7am ET (11:00 UTC, EDT). Drives the PRE_SEASON countdown. Week-1 anchor only; the rolling per-week value is next_picks_open_at. (Corrected from 9am/13:00 UTC per Weekly Engine spec §4b.)'
WHERE competition = 'nfl_2026' AND key = 'season_picks_open_at';
