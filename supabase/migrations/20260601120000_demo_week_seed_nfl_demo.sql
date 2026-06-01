-- Demo Week — seed the nfl_demo sandbox competition.
-- Spec: docs/DEMO_WEEK_SPEC.md
--
-- nfl_demo is the new-user onboarding demo: a self-contained "what a
-- regular-season week feels like" loop. It is NOT in the sport registry and
-- never surfaces as a switcher event card — it is reached only via the
-- enter_demo() RPC from the off-cycle home.
--
-- Concurrency model (spec §4): demo game rows are IMMUTABLE. They sit
-- permanently at status='scheduled' with lock_at NULL so enforce_pick_lock
-- always allows picks, and they carry their predetermined outcome in
-- winner_team (which the lock trigger ignores). "Settling" is per-user and
-- never mutates these rows. Demo Ladder opponents are static client data,
-- not DB rows — only the user's own pick→score path is real.
--
-- Outcome design (spec §2, O-6): the favorite (home side, negative moneyline)
-- wins in ranks 4–16; the 3 upsets live in ranks 1–3 (lowest HotPick value),
-- so a sensible pick set lands clearly net-positive and a HotPick on any
-- high-rank favorite pays off — while the swing stays visible.
--
-- Idempotent: every insert is ON CONFLICT DO NOTHING. Safe to re-run.
-- Reversible: DELETE FROM ... WHERE competition='nfl_demo' (+ the demo pool).

-- ── competition_config ──────────────────────────────────────────────────
INSERT INTO competition_config (competition, key, value, description) VALUES
  ('nfl_demo', 'template',           '"season"'::jsonb,  'Template type for this competition'),
  ('nfl_demo', 'sport',              '"nfl"'::jsonb,     'Sport identifier'),
  ('nfl_demo', 'current_phase',      '"REGULAR"'::jsonb, 'Demo runs as a REGULAR week so the Picks UI behaves normally'),
  ('nfl_demo', 'current_week',       '1'::jsonb,         'Single demo week'),
  ('nfl_demo', 'season_year',        '2026'::jsonb,      'Season year the demo week presents'),
  ('nfl_demo', 'is_active',          'true'::jsonb,      'Whether this competition is currently active (demo-settle gates on this)'),
  ('nfl_demo', 'is_season_complete', 'false'::jsonb,     'Demo never completes'),
  ('nfl_demo', 'scoring_locked',     'false'::jsonb,     'Emergency flag: set true to pause all scoring computation'),
  ('nfl_demo', 'playoff_start_week', '19'::jsonb,        'Standard NFL playoff start week (unused by the demo)'),
  ('nfl_demo', 'week_state',         '"picks_open"'::jsonb, 'Demo week is always open; settle is per-user, week never advances'),
  ('nfl_demo', 'picks_open',         'true'::jsonb,      'Picks open for the demo week'),
  ('nfl_demo', 'picks_locked',       'false'::jsonb,     'Emergency flag: set true to hard-lock all picks immediately'),
  ('nfl_demo', 'data_provider',      '"demo"'::jsonb,    'Outcomes are pre-seeded in season_games.winner_team (no live provider)'),
  ('nfl_demo', 'is_demo',            'true'::jsonb,      'Marks this competition as the onboarding demo sandbox')
ON CONFLICT DO NOTHING;

-- ── demo pool (hidden, shared) ──────────────────────────────────────────
-- Fixed UUID so enter_demo() and the client can reference it deterministically.
-- organizer_id → an existing super_admin profile (FK). is_hidden_from_users
-- keeps it out of every real Contest list (RLS, PR #184). The entering user
-- is added as a member by enter_demo(), not here.
INSERT INTO pools (id, name, name_display, competition, created_by, organizer_id,
                   is_public, status, member_limit, pool_start_date, is_hidden_from_users)
VALUES (
  'd0d0d0d0-0000-4000-8000-000000000001',
  'HotPick Demo Week',
  'poolie_name',
  'nfl_demo',
  '7b4f41c8-008d-4319-98e7-8c80ec6edf69',
  '7b4f41c8-008d-4319-98e7-8c80ec6edf69',
  false,
  'active',
  100000,
  CURRENT_DATE,
  true
)
ON CONFLICT (id) DO NOTHING;

-- ── season_games (16 games, week 1) ─────────────────────────────────────
-- status='scheduled' + lock_at NULL (immutable; keeps enforce_pick_lock happy).
-- winner_team holds the predetermined outcome read by demo-settle.
-- frozen_rank 1..16 drives the HotPick value. Kickoffs spread across waves
-- (Thu / Sun 1pm / Sun 4pm / SNF / MNF) so the section headers render.
INSERT INTO season_games
  (game_id, competition, season_year, week, phase, home_team, away_team,
   kickoff_at, status, winner_team, rank, frozen_rank,
   home_moneyline, away_moneyline, home_record, away_record, lock_at)
VALUES
  -- ranks 1–3: UPSETS (home favorite loses → away wins). Low HotPick value.
  ('demo_2026_w1_g01','nfl_demo',2026,1,'REGULAR','KC','LV',  '2026-09-13T17:00:00Z','scheduled','LV', 1, 1, -240,200,'0-0','0-0',NULL),
  ('demo_2026_w1_g02','nfl_demo',2026,1,'REGULAR','BUF','MIA', '2026-09-13T17:00:00Z','scheduled','MIA',2, 2, -220,185,'0-0','0-0',NULL),
  ('demo_2026_w1_g03','nfl_demo',2026,1,'REGULAR','PHI','DAL', '2026-09-13T17:00:00Z','scheduled','DAL',3, 3, -200,170,'0-0','0-0',NULL),
  -- ranks 4–9: favorites (home) win. Sunday 1pm wave.
  ('demo_2026_w1_g04','nfl_demo',2026,1,'REGULAR','SF','SEA',  '2026-09-13T17:00:00Z','scheduled','SF', 4, 4, -260,215,'0-0','0-0',NULL),
  ('demo_2026_w1_g05','nfl_demo',2026,1,'REGULAR','BAL','CIN', '2026-09-13T17:00:00Z','scheduled','BAL',5, 5, -240,200,'0-0','0-0',NULL),
  ('demo_2026_w1_g06','nfl_demo',2026,1,'REGULAR','DET','GB',  '2026-09-13T17:00:00Z','scheduled','DET',6, 6, -220,185,'0-0','0-0',NULL),
  ('demo_2026_w1_g07','nfl_demo',2026,1,'REGULAR','MIN','CHI', '2026-09-13T17:00:00Z','scheduled','MIN',7, 7, -200,170,'0-0','0-0',NULL),
  ('demo_2026_w1_g08','nfl_demo',2026,1,'REGULAR','HOU','IND', '2026-09-13T17:00:00Z','scheduled','HOU',8, 8, -240,200,'0-0','0-0',NULL),
  ('demo_2026_w1_g09','nfl_demo',2026,1,'REGULAR','LAC','DEN', '2026-09-13T17:00:00Z','scheduled','LAC',9, 9, -200,170,'0-0','0-0',NULL),
  -- ranks 10–13: favorites win. Sunday 4pm wave.
  ('demo_2026_w1_g10','nfl_demo',2026,1,'REGULAR','TB','ATL',  '2026-09-13T20:25:00Z','scheduled','TB', 10,10,-220,185,'0-0','0-0',NULL),
  ('demo_2026_w1_g11','nfl_demo',2026,1,'REGULAR','LAR','ARI', '2026-09-13T20:25:00Z','scheduled','LAR',11,11,-240,200,'0-0','0-0',NULL),
  ('demo_2026_w1_g12','nfl_demo',2026,1,'REGULAR','JAX','TEN', '2026-09-13T20:25:00Z','scheduled','JAX',12,12,-200,170,'0-0','0-0',NULL),
  ('demo_2026_w1_g13','nfl_demo',2026,1,'REGULAR','PIT','CLE', '2026-09-13T20:25:00Z','scheduled','PIT',13,13,-220,185,'0-0','0-0',NULL),
  -- rank 14: SNF favorite wins.
  ('demo_2026_w1_g14','nfl_demo',2026,1,'REGULAR','NO','CAR',  '2026-09-14T00:20:00Z','scheduled','NO', 14,14,-200,170,'0-0','0-0',NULL),
  -- rank 15: MNF favorite wins.
  ('demo_2026_w1_g15','nfl_demo',2026,1,'REGULAR','NYJ','NE',  '2026-09-15T00:15:00Z','scheduled','NYJ',15,15,-220,185,'0-0','0-0',NULL),
  -- rank 16: TNF marquee favorite wins (highest HotPick value).
  ('demo_2026_w1_g16','nfl_demo',2026,1,'REGULAR','WAS','NYG', '2026-09-11T00:15:00Z','scheduled','WAS',16,16,-240,200,'0-0','0-0',NULL)
ON CONFLICT (game_id) DO NOTHING;
