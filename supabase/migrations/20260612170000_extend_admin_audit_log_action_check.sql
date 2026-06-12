-- Operator Console Phase 2 follow-up — extend admin_audit_log.action allowlist.
--
-- The CHECK constraint omitted the actions the Phase 2 write path logs, so
-- reset_to_off_season failed its mandatory audit insert (Hard Rule #17) and the
-- Edge Function returned 500. Add:
--   SIMULATOR_RESET             — sim-operator reset_to_off_season
--   TESTER_SIGNUP_PROFILE_FAILED — bypass-tester-signup cleanup-audit on profile failure
--   WEEK_ADVANCED               — admin_advance_week (used by sim-operator complete -> next week)
--
-- Kept NOT VALID to match the original (enforced on new rows; historical rows not
-- re-validated).

ALTER TABLE public.admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_log_action_check;

ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_log_action_check
  CHECK (action = ANY (ARRAY[
    'POOL_SUSPENDED','POOL_UNSUSPENDED','USER_PLATFORM_SUSPENDED','USER_PLATFORM_UNSUSPENDED',
    'ADMIN_BROADCAST_SENT','MODERATION_ESCALATION_ACTIONED','GAME_RESULT_OVERRIDDEN',
    'ROSTER_PASS_REGENERATED','PARTNER_CREATED','PARTNER_UPDATED','PARTNER_DEACTIVATED',
    'POOL_HARD_DELETED','POOL_ARCHIVED','POOL_CREATED','MEMBER_REMOVED','ORGANIZER_BROADCAST',
    'SMACKTALK_REMOVED','BETA_TESTER_ADDED','BETA_TESTER_REMOVED','SEASON_PHASE_ADVANCED',
    'LEAGUE_CHAIRMAN_SET','CLUB_POOL_GAFFER_SET',
    'SIMULATOR_RESET','TESTER_SIGNUP_PROFILE_FAILED','WEEK_ADVANCED'
  ])) NOT VALID;
