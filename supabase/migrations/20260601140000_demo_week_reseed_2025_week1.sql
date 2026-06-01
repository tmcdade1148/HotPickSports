-- Demo Week — reseed nfl_demo with the real 2025 NFL Week 1 slate.
-- Spec: docs/DEMO_WEEK_SPEC.md
--
-- Real matchups + the app's real game rankings (frozen_rank 1-16, copied from
-- nfl_2025_sim week 1), with the actual Week 1 2025 winners (confirmed by Tom)
-- and believable final scores so the results read credibly to a football fan.
-- Kickoffs are set to future dates so the games stay 'scheduled' (pickable) and
-- sit in the OPEN group; the card shows only day+time (no year), so the future
-- date isn't visible. Outcome lives in winner_team + home/away_score; status
-- stays 'scheduled' (lock trigger ignores scores), so games remain immutable
-- and pickable until the per-user demo-settle scores them.
--
-- Idempotent-ish: clears the prior nfl_demo games + any demo picks/scores first,
-- then inserts the real slate. Safe to re-run.

DELETE FROM season_picks       WHERE competition = 'nfl_demo';
DELETE FROM season_user_totals WHERE competition = 'nfl_demo';
DELETE FROM season_games        WHERE competition = 'nfl_demo';

INSERT INTO season_games
  (game_id, competition, season_year, week, phase, home_team, away_team,
   kickoff_at, status, winner_team, home_score, away_score, rank, frozen_rank,
   home_record, away_record, lock_at)
VALUES
  ('demo25_w1_r01','nfl_demo',2026,1,'REGULAR','CHI','MIN', '2026-09-15T00:15:00Z','scheduled','MIN',24,27, 1, 1, '0-0','0-0',NULL),
  ('demo25_w1_r02','nfl_demo',2026,1,'REGULAR','BUF','BAL', '2026-09-14T00:20:00Z','scheduled','BUF',41,40, 2, 2, '0-0','0-0',NULL),
  ('demo25_w1_r03','nfl_demo',2026,1,'REGULAR','LAR','HOU', '2026-09-13T20:25:00Z','scheduled','LAR',14, 9, 3, 3, '0-0','0-0',NULL),
  ('demo25_w1_r04','nfl_demo',2026,1,'REGULAR','GB','DET',  '2026-09-13T20:25:00Z','scheduled','GB', 27,13, 4, 4, '0-0','0-0',NULL),
  ('demo25_w1_r05','nfl_demo',2026,1,'REGULAR','SEA','SF',  '2026-09-13T20:05:00Z','scheduled','SF', 13,17, 5, 5, '0-0','0-0',NULL),
  ('demo25_w1_r06','nfl_demo',2026,1,'REGULAR','DEN','TEN', '2026-09-13T20:05:00Z','scheduled','DEN',20,12, 6, 6, '0-0','0-0',NULL),
  ('demo25_w1_r07','nfl_demo',2026,1,'REGULAR','JAX','CAR', '2026-09-13T17:00:00Z','scheduled','JAX',26,10, 7, 7, '0-0','0-0',NULL),
  ('demo25_w1_r08','nfl_demo',2026,1,'REGULAR','WSH','NYG', '2026-09-13T17:00:00Z','scheduled','WSH',21, 6, 8, 8, '0-0','0-0',NULL),
  ('demo25_w1_r09','nfl_demo',2026,1,'REGULAR','NYJ','PIT', '2026-09-13T17:00:00Z','scheduled','PIT',32,34, 9, 9, '0-0','0-0',NULL),
  ('demo25_w1_r10','nfl_demo',2026,1,'REGULAR','NO','ARI',  '2026-09-13T17:00:00Z','scheduled','ARI',13,20, 10,10,'0-0','0-0',NULL),
  ('demo25_w1_r11','nfl_demo',2026,1,'REGULAR','NE','LV',   '2026-09-13T17:00:00Z','scheduled','LV', 13,20, 11,11,'0-0','0-0',NULL),
  ('demo25_w1_r12','nfl_demo',2026,1,'REGULAR','IND','MIA', '2026-09-13T17:00:00Z','scheduled','IND',33, 8, 12,12,'0-0','0-0',NULL),
  ('demo25_w1_r13','nfl_demo',2026,1,'REGULAR','CLE','CIN', '2026-09-13T17:00:00Z','scheduled','CIN',16,17, 13,13,'0-0','0-0',NULL),
  ('demo25_w1_r14','nfl_demo',2026,1,'REGULAR','ATL','TB',  '2026-09-13T17:00:00Z','scheduled','TB', 20,23, 14,14,'0-0','0-0',NULL),
  ('demo25_w1_r15','nfl_demo',2026,1,'REGULAR','LAC','KC',  '2026-09-12T00:00:00Z','scheduled','LAC',27,21, 15,15,'0-0','0-0',NULL),
  ('demo25_w1_r16','nfl_demo',2026,1,'REGULAR','PHI','DAL', '2026-09-11T00:20:00Z','scheduled','PHI',24,20, 16,16,'0-0','0-0',NULL);
