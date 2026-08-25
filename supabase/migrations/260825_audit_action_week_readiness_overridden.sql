-- ============================================================================
-- 260825_audit_action_week_readiness_overridden.sql
--
-- Week-Prep Pipeline Hardening, §7. Adds ONE value to the admin_audit_log
-- action enum so a sanctioned manual readiness override has a real name
-- (Hard Rule #11: the enum gets a defined value; nobody invents strings).
--
-- Why it is needed: when the prep chain fails, the sanctioned unblock path is
-- an operator override of week_readiness followed by open_week_picks. That is a
-- destructive-adjacent admin action on production data, so Hard Rule #17 wants
-- it logged — and until now there was no action value it could be logged under.
--
-- Every existing value below was copied verbatim from the LIVE constraint on
-- 2026-08-25 via pg_get_constraintdef(), not retyped from memory. If you ever
-- re-run this file, re-pull the live definition first — this list is a snapshot,
-- and other migrations add to it.
--
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.admin_audit_log'::regclass
--      AND conname  = 'admin_audit_log_action_check';
--
-- NOT VALID matches the existing constraint: new rows are checked, historical
-- rows are not re-scanned.
-- ============================================================================

ALTER TABLE admin_audit_log DROP CONSTRAINT admin_audit_log_action_check;

ALTER TABLE admin_audit_log ADD CONSTRAINT admin_audit_log_action_check
  CHECK (action = ANY (ARRAY[
    'POOL_SUSPENDED'::text,
    'POOL_UNSUSPENDED'::text,
    'USER_PLATFORM_SUSPENDED'::text,
    'USER_PLATFORM_UNSUSPENDED'::text,
    'ADMIN_BROADCAST_SENT'::text,
    'MODERATION_ESCALATION_ACTIONED'::text,
    'GAME_RESULT_OVERRIDDEN'::text,
    'ROSTER_PASS_REGENERATED'::text,
    'PARTNER_CREATED'::text,
    'PARTNER_UPDATED'::text,
    'PARTNER_DEACTIVATED'::text,
    'POOL_HARD_DELETED'::text,
    'POOL_ARCHIVED'::text,
    'POOL_CREATED'::text,
    'MEMBER_REMOVED'::text,
    'ORGANIZER_BROADCAST'::text,
    'SMACKTALK_REMOVED'::text,
    'BETA_TESTER_ADDED'::text,
    'BETA_TESTER_REMOVED'::text,
    'SEASON_PHASE_ADVANCED'::text,
    'LEAGUE_CHAIRMAN_SET'::text,
    'CLUB_POOL_GAFFER_SET'::text,
    'SIMULATOR_RESET'::text,
    'TESTER_SIGNUP_PROFILE_FAILED'::text,
    'WEEK_ADVANCED'::text,
    'POOL_DESIGNATED_PUBLIC'::text,
    'GAME_ROWS_DELETED'::text,
    'WEEK_PICKS_OPENED'::text,
    'ACCOUNT_DELETED'::text,
    'CLUB_CONTEST_CREATED'::text,
    'POOL_INVITE_CODE_CHANGED'::text,
    'POOL_RENAMED'::text,
    'WEEK_READINESS_OVERRIDDEN'::text
  ])) NOT VALID;

-- ---------------------------------------------------------------------------
-- Retro-log the 2026-08-25 preseason week 3 override so the audit trail has no
-- gap. Idempotent: re-running this file will not duplicate the row.
--
-- Honest about what is and is not known. The override was a direct DB-level
-- UPDATE, so no actor was captured at the time; `admin_id` is the project's
-- operator super-admin account and `actor_reconstructed: true` in the metadata
-- says so explicitly. The evidence for the override itself is in the row: every
-- other games_at on this table carries cron millisecond precision
-- (05:00:01.634), while nfl_2026_pre week 3 reads exactly 07:59:00.000 — the
-- fingerprint of a hand-written timestamp.
-- ---------------------------------------------------------------------------
INSERT INTO admin_audit_log (admin_id, action, target_table, target_id, metadata, created_at)
SELECT
  '7b4f41c8-008d-4319-98e7-8c80ec6edf69'::uuid,
  'WEEK_READINESS_OVERRIDDEN',
  'week_readiness',
  wr.id,
  jsonb_build_object(
    'competition', 'nfl_2026_pre',
    'week_number', 3,
    'reason', 'nfl-import-schedule returned 500 (ESPN API error 403 — Akamai block on site.api.espn.com). Readiness was stamped games_status=failed with a stale games_count=16, blocking admin_advance_week and open_week_picks for a slate that was in fact complete, priced and ranked in season_games.',
    'retro_logged_at', '2026-08-25',
    'retro_logged_by', 'migration 260825_audit_action_week_readiness_overridden.sql',
    'actor_reconstructed', true,
    'incident', 'Week-Prep Pipeline Hardening spec §2'),
  '2026-08-25 07:59:00+00'::timestamptz
FROM week_readiness wr
WHERE wr.competition = 'nfl_2026_pre' AND wr.week_number = 3
  AND NOT EXISTS (
    SELECT 1 FROM admin_audit_log a
    WHERE a.action = 'WEEK_READINESS_OVERRIDDEN'
      AND a.target_table = 'week_readiness'
      AND a.target_id = wr.id);
