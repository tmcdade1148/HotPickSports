-- Import nfl_2026 preseason schedule (46 games, Aug 6 - Aug 29 2026)
-- from Tom's hand-built spreadsheet (NFL hasn't published a
-- structured download for preseason).
--
-- Week mapping:
--   0 = Hall of Fame Game (Aug 6, single game)
--   1 = preseason week 1 (Aug 13-15, 14 games)
--   2 = preseason week 2 (Aug 20-23, 16 games)
--   3 = preseason week 3 (Aug 27-29, 15 games)
--
-- phase='PRESEASON' is the disambiguator from the regular-season
-- Week 1/2/3 already loaded. Per the agreed simple approach, no
-- scoring code changes — preseason picks just need to be deleted
-- before regular Week 1 picks open via the purge migration at
-- supabase/migrations/PURGE_PRESEASON_PICKS.sql (run ~Sept 1).
-- finalize_week_for_all_users is never called for preseason weeks.
--
-- Game IDs use a 'pre-{date}-{away}-{home}' convention so they
-- never collide with ESPN's numeric IDs from the regular-season
-- importer.

INSERT INTO public.season_games AS sg (
  game_id, competition, season_year, week, phase,
  home_team, away_team, kickoff_at, status, is_finalized
)
SELECT
  v.game_id, 'nfl_2026', 2026, v.week, 'PRESEASON',
  v.home, v.away, v.kickoff_at, 'SCHEDULED', false
FROM (VALUES
  ('pre-2026-08-06-CAR-ARI', 0, '2026-08-07T00:00:00+00:00'::timestamptz, 'CAR', 'ARI'),
  ('pre-2026-08-13-DET-CIN', 1, '2026-08-13T23:00:00+00:00'::timestamptz, 'DET', 'CIN'),
  ('pre-2026-08-13-GB-PIT',  1, '2026-08-13T23:00:00+00:00'::timestamptz, 'GB',  'PIT'),
  ('pre-2026-08-13-IND-NE',  1, '2026-08-13T23:30:00+00:00'::timestamptz, 'IND', 'NE'),
  ('pre-2026-08-13-ARI-LV',  1, '2026-08-14T00:00:00+00:00'::timestamptz, 'ARI', 'LV'),
  ('pre-2026-08-13-LAC-HOU', 1, '2026-08-14T00:00:00+00:00'::timestamptz, 'LAC', 'HOU'),
  ('pre-2026-08-14-DEN-ATL', 1, '2026-08-14T23:00:00+00:00'::timestamptz, 'DEN', 'ATL'),
  ('pre-2026-08-14-TB-NYJ',  1, '2026-08-14T23:00:00+00:00'::timestamptz, 'TB',  'NYJ'),
  ('pre-2026-08-14-MIA-WSH', 1, '2026-08-14T23:00:00+00:00'::timestamptz, 'MIA', 'WSH'),
  ('pre-2026-08-15-CAR-BUF', 1, '2026-08-15T17:00:00+00:00'::timestamptz, 'CAR', 'BUF'),
  ('pre-2026-08-15-MIN-NYG', 1, '2026-08-15T17:00:00+00:00'::timestamptz, 'MIN', 'NYG'),
  ('pre-2026-08-15-LAR-KC',  1, '2026-08-15T20:00:00+00:00'::timestamptz, 'LAR', 'KC'),
  ('pre-2026-08-15-JAX-NO',  1, '2026-08-15T20:00:00+00:00'::timestamptz, 'JAX', 'NO'),
  ('pre-2026-08-15-PHI-BAL', 1, '2026-08-15T23:00:00+00:00'::timestamptz, 'PHI', 'BAL'),
  ('pre-2026-08-15-DAL-SEA', 1, '2026-08-16T00:00:00+00:00'::timestamptz, 'DAL', 'SEA'),
  ('pre-2026-08-20-LV-HOU',  2, '2026-08-21T00:00:00+00:00'::timestamptz, 'LV',  'HOU'),
  ('pre-2026-08-20-SF-LAC',  2, '2026-08-21T02:00:00+00:00'::timestamptz, 'SF',  'LAC'),
  ('pre-2026-08-21-NYJ-PIT', 2, '2026-08-21T23:00:00+00:00'::timestamptz, 'NYJ', 'PIT'),
  ('pre-2026-08-21-CAR-JAX', 2, '2026-08-21T23:30:00+00:00'::timestamptz, 'CAR', 'JAX'),
  ('pre-2026-08-21-GB-DEN',  2, '2026-08-22T01:00:00+00:00'::timestamptz, 'GB',  'DEN'),
  ('pre-2026-08-22-WSH-DET', 2, '2026-08-22T16:00:00+00:00'::timestamptz, 'WSH', 'DET'),
  ('pre-2026-08-22-BUF-CLE', 2, '2026-08-22T17:00:00+00:00'::timestamptz, 'BUF', 'CLE'),
  ('pre-2026-08-22-ATL-IND', 2, '2026-08-22T17:00:00+00:00'::timestamptz, 'ATL', 'IND'),
  ('pre-2026-08-22-BAL-MIN', 2, '2026-08-22T17:00:00+00:00'::timestamptz, 'BAL', 'MIN'),
  ('pre-2026-08-22-NO-LAR',  2, '2026-08-22T20:00:00+00:00'::timestamptz, 'NO',  'LAR'),
  ('pre-2026-08-22-NYG-MIA', 2, '2026-08-22T20:00:00+00:00'::timestamptz, 'NYG', 'MIA'),
  ('pre-2026-08-22-CHI-CIN', 2, '2026-08-22T23:00:00+00:00'::timestamptz, 'CHI', 'CIN'),
  ('pre-2026-08-22-PHI-NE',  2, '2026-08-22T23:00:00+00:00'::timestamptz, 'PHI', 'NE'),
  ('pre-2026-08-22-KC-TB',   2, '2026-08-22T23:30:00+00:00'::timestamptz, 'KC',  'TB'),
  ('pre-2026-08-22-DAL-ARI', 2, '2026-08-23T02:00:00+00:00'::timestamptz, 'DAL', 'ARI'),
  ('pre-2026-08-23-SEA-TEN', 2, '2026-08-24T00:00:00+00:00'::timestamptz, 'SEA', 'TEN'),
  ('pre-2026-08-27-PIT-BUF', 3, '2026-08-27T23:00:00+00:00'::timestamptz, 'PIT', 'BUF'),
  ('pre-2026-08-27-NE-CLE',  3, '2026-08-28T00:00:00+00:00'::timestamptz, 'NE',  'CLE'),
  ('pre-2026-08-27-SF-LV',   3, '2026-08-28T00:00:00+00:00'::timestamptz, 'SF',  'LV'),
  ('pre-2026-08-27-LAR-LAC', 3, '2026-08-28T02:00:00+00:00'::timestamptz, 'LAR', 'LAC'),
  ('pre-2026-08-28-ATL-MIA', 3, '2026-08-28T23:00:00+00:00'::timestamptz, 'ATL', 'MIA'),
  ('pre-2026-08-28-HOU-CAR', 3, '2026-08-28T23:00:00+00:00'::timestamptz, 'HOU', 'CAR'),
  ('pre-2026-08-28-WSH-BAL', 3, '2026-08-28T23:00:00+00:00'::timestamptz, 'WSH', 'BAL'),
  ('pre-2026-08-28-NYG-NYJ', 3, '2026-08-28T23:30:00+00:00'::timestamptz, 'NYG', 'NYJ'),
  ('pre-2026-08-28-TB-JAX',  3, '2026-08-28T23:30:00+00:00'::timestamptz, 'TB',  'JAX'),
  ('pre-2026-08-28-NO-DAL',  3, '2026-08-29T00:00:00+00:00'::timestamptz, 'NO',  'DAL'),
  ('pre-2026-08-28-ARI-GB',  3, '2026-08-29T00:00:00+00:00'::timestamptz, 'ARI', 'GB'),
  ('pre-2026-08-28-SEA-KC',  3, '2026-08-29T00:00:00+00:00'::timestamptz, 'SEA', 'KC'),
  ('pre-2026-08-28-CIN-PHI', 3, '2026-08-29T00:00:00+00:00'::timestamptz, 'CIN', 'PHI'),
  ('pre-2026-08-28-MIN-DEN', 3, '2026-08-29T01:00:00+00:00'::timestamptz, 'MIN', 'DEN'),
  ('pre-2026-08-29-DET-IND', 3, '2026-08-29T17:00:00+00:00'::timestamptz, 'DET', 'IND')
) AS v(game_id, week, kickoff_at, away, home)
ON CONFLICT (game_id) DO UPDATE
  SET week       = EXCLUDED.week,
      phase      = EXCLUDED.phase,
      home_team  = EXCLUDED.home_team,
      away_team  = EXCLUDED.away_team,
      kickoff_at = EXCLUDED.kickoff_at,
      updated_at = now();
