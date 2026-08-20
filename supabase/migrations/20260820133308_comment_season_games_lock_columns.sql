-- =============================================================================
-- Migration: document what the pick lock actually is, on the columns themselves
-- =============================================================================
-- ALREADY APPLIED to production (supabase_migrations.schema_migrations version
-- 20260820133308). This file is the repo's copy of that, added so history and
-- production agree — the statements below are byte-identical to the applied ones.
--
-- Comments only. No behaviour changes.
--
-- The point: season_games.lock_at LOOKS like the pick deadline and is not. It is
-- written by four admin/sim paths and read by nothing in gameplay, and its
-- per-game values differ both from each other and from the real deadline. The
-- authoritative lock is WHOLE-WEEK — MIN(kickoff_at) — so anything gating on
-- lock_at is gating on a number that no enforcement path consults.
-- =============================================================================

COMMENT ON COLUMN public.season_games.lock_at IS
  'NOT the pick lock. Never read by gameplay. The authoritative lock is whole-week: get_week_lock_time(competition, week) = MIN(kickoff_at) across the week''s games, enforced by the enforce_pick_lock trigger on season_picks. This column is WRITTEN by admin_advance_week, open_week_picks, refresh_reviewer_sim_countdown and reset_reviewer_sim, and READ by nothing in gameplay. Its per-game values differ from each other and from the real deadline. Do not gate any behavior on it.';

COMMENT ON COLUMN public.season_games.kickoff_at IS
  'MIN(kickoff_at) across a week IS the pick lock — that is what get_week_lock_time() returns and what enforce_pick_lock blocks on. Client mirror: src/templates/season/utils/weekLock.ts (weekLockAtFromGames / isWeekLocked). If you need to answer "are picks locked", use this, never season_games.lock_at.';
