-- Run this on or before Sept 1, 2026 — before flipping nfl_2026's
-- current_phase from PRE_SEASON to REGULAR — to wipe any practice
-- picks users made during preseason. Cleans up so regular Week 1
-- starts with no carryover.
--
-- This file is intentionally NOT timestamped so it doesn't auto-run
-- as a migration. Apply it manually via MCP when the time comes.

BEGIN;

WITH purged AS (
  DELETE FROM public.season_picks
  WHERE competition = 'nfl_2026'
    AND game_id IN (
      SELECT game_id FROM public.season_games
      WHERE competition = 'nfl_2026' AND phase = 'PRESEASON'
    )
  RETURNING user_id
)
SELECT COUNT(*)   AS picks_purged,
       COUNT(DISTINCT user_id) AS users_affected
FROM purged;

-- Audit log
INSERT INTO public.admin_audit_log (admin_id, action, target_table, target_id, metadata)
VALUES (
  auth.uid(),
  'preseason_picks_purged',
  'season_picks',
  NULL,
  jsonb_build_object(
    'competition',    'nfl_2026',
    'phase_filter',   'PRESEASON',
    'reason',         'pre-flip cleanup before PRE_SEASON → REGULAR'
  )
);

COMMIT;
