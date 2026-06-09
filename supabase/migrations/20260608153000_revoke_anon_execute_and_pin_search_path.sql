-- =====================================================================
-- Security hardening: revoke anon EXECUTE on SECURITY DEFINER RPCs +
-- pin mutable function search_paths.
--
-- Branch: fix/security-anon-rpc-revoke
-- Audit source: docs/ARCHITECTURE_AUDIT.md finding #14 (anon-executable
--   SECURITY DEFINER functions) and #15 (mutable search_path).
--
-- *** DO NOT apply without a manual Supabase backup first. ***
-- *** Production DB — nfl_2026 is OFF_SEASON; nfl_2025_sim is App-Review live. ***
--
-- Grant model
-- -----------
--   anon          -> removed from every function below except the 2 read-only
--                    KEEP-ANON functions (one is used inside an RLS policy).
--   authenticated -> retained for client-facing RPCs (the in-body super_admin /
--                    pool-role checks remain the real authorization gate).
--   service_role  -> retained/granted where an Edge Function or cron path calls
--                    the function (delete-account, finalize, smack archive).
--   PUBLIC        -> revoked everywhere we revoke anon (anon inherits PUBLIC),
--                    so the revoke actually takes effect.
--
-- Trigger functions: EXECUTE grants are irrelevant to trigger firing (Postgres
-- does not check EXECUTE on a trigger function), so revoking from all roles is
-- safe and removes them from the anon-executable surface.
--
-- Counts: 70 AUTHED, 24 LOCKDOWN, 3 SERVICE-ONLY, 2 KEEP-ANON, 13 search_path.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- SECTION 1 — KEEP ANON (no change; documented for the record)
--   check_poolie_name_available : read-only, designed for pre-signup
--       name checks (body explicitly handles auth.uid() IS NULL).
--   user_can_see_competition    : read-only AND referenced inside an RLS
--       policy expression — anon needs EXECUTE to evaluate that policy.
-- ---------------------------------------------------------------------
-- (intentionally left granted)

-- ---------------------------------------------------------------------
-- SECTION 2 — AUTHENTICATED CLIENT RPCs
--   REVOKE anon + PUBLIC; GRANT authenticated + service_role.
--   Authorization stays enforced in-body (super_admin or pool role).
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.add_pool_affiliation(p_pool_id uuid, p_partner_id uuid, p_is_primary boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.add_pool_affiliation(p_pool_id uuid, p_partner_id uuid, p_is_primary boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.add_pool_invite_code(p_pool_id uuid, p_code text, p_label text, p_is_primary boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.add_pool_invite_code(p_pool_id uuid, p_code text, p_label text, p_is_primary boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.add_smack_reaction(p_message_id uuid, p_reaction text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.add_smack_reaction(p_message_id uuid, p_reaction text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.admin_add_beta_tester_by_email(p_competition text, p_email text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_add_beta_tester_by_email(p_competition text, p_email text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.admin_advance_season_phase(p_competition text, p_phase text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_advance_season_phase(p_competition text, p_phase text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.admin_advance_week(p_competition text, p_next_picks_open_at timestamp with time zone) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_advance_week(p_competition text, p_next_picks_open_at timestamp with time zone) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.admin_list_beta_testers(p_competition text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_list_beta_testers(p_competition text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.admin_remove_beta_tester(p_competition text, p_user_id uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_remove_beta_tester(p_competition text, p_user_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.archive_pool(p_pool_id uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.archive_pool(p_pool_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.auto_enroll_global_pools() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.auto_enroll_global_pools() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.broadcast_to_pool(p_pool_id uuid, p_message text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.broadcast_to_pool(p_pool_id uuid, p_message text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.create_partner_pool(p_partner_id uuid, p_competition text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_partner_pool(p_partner_id uuid, p_competition text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.create_pool(p_pool_name text, p_is_public boolean, p_user_id text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_pool(p_pool_name text, p_is_public boolean, p_user_id text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.create_pool(p_name text, p_competition text, p_is_public boolean, p_invite_code text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_pool(p_name text, p_competition text, p_is_public boolean, p_invite_code text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.create_pool(p_pool_name text, p_is_public boolean, p_user_id uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_pool(p_pool_name text, p_is_public boolean, p_user_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.deactivate_pool_invite_code(p_code_id uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.deactivate_pool_invite_code(p_code_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.enter_demo() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.enter_demo() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.export_pool_members(p_pool_id uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.export_pool_members(p_pool_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_pool_member_counts(p_pool_ids uuid[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_pool_member_counts(p_pool_ids uuid[]) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_pool_pick_submissions(p_pool_id uuid, p_competition text, p_week integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_pool_pick_submissions(p_pool_id uuid, p_competition text, p_week integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_smack_unread_counts(p_user_id uuid, p_pool_ids uuid[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_smack_unread_counts(p_user_id uuid, p_pool_ids uuid[]) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_visible_competitions() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_visible_competitions() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_week_bundle(p_competition text, p_season_year integer, p_week integer, p_user_id uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_week_bundle(p_competition text, p_season_year integer, p_week integer, p_user_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_member(p_pool_id uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_member(p_pool_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_pool_admin(u uuid, pid uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_pool_admin(u uuid, pid uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_pool_member(u uuid, pid uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_pool_member(u uuid, pid uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.join_partner_roster(p_pool_id uuid, p_partner_id uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.join_partner_roster(p_pool_id uuid, p_partner_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.join_pool_by_code(p_invite_code text, p_user_id uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.join_pool_by_code(p_invite_code text, p_user_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.join_pool_by_invite(p_invite_code text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.join_pool_by_invite(p_invite_code text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.leave_partner_roster(p_pool_id uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.leave_partner_roster(p_pool_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.open_week_picks(p_competition text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.open_week_picks(p_competition text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.regenerate_roster_pass(p_partner_id uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.regenerate_roster_pass(p_partner_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.remove_pool_affiliation(p_pool_id uuid, p_partner_id uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.remove_pool_affiliation(p_pool_id uuid, p_partner_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.remove_pool_member(p_pool_id uuid, p_user_id uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.remove_pool_member(p_pool_id uuid, p_user_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.remove_smack_reaction(p_message_id uuid, p_reaction text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.remove_smack_reaction(p_message_id uuid, p_reaction text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.reset_demo() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reset_demo() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.reset_reviewer_sim(p_competition text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reset_reviewer_sim(p_competition text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.resolve_roster_pass(p_pass text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.resolve_roster_pass(p_pass text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_accept_tos(p_tos_version text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_accept_tos(p_tos_version text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_archive_pool(p_pool_id uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_archive_pool(p_pool_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_create_pool_probe(p_name text, p_passcode text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_create_pool_probe(p_name text, p_passcode text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_find_pool_by_name_invite(p_name text, p_invite_code text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_find_pool_by_name_invite(p_name text, p_invite_code text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_find_pool_by_name_join_code(p_name text, p_join_code text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_find_pool_by_name_join_code(p_name text, p_join_code text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_get_my_pools() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_get_my_pools() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_get_pool_admin_name(p_pool_id uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_get_pool_admin_name(p_pool_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_get_pool_invite_code(p_pool_id uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_get_pool_invite_code(p_pool_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_hotpick_create_pool(p_name text, p_passcode text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_hotpick_create_pool(p_name text, p_passcode text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_hotpick_create_pool_fix(p_name text, p_passcode text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_hotpick_create_pool_fix(p_name text, p_passcode text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_hotpick_list_my_pools() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_hotpick_list_my_pools() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_invalidate_pool_invites(p_pool_id uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_invalidate_pool_invites(p_pool_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_join_pool(p_invite_code text, p_passcode text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_join_pool(p_invite_code text, p_passcode text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_join_pool_by_code(p_invite_code text, p_invited_by_id uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_join_pool_by_code(p_invite_code text, p_invited_by_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_join_pool_by_code(p_pool_id uuid, p_code text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_join_pool_by_code(p_pool_id uuid, p_code text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_join_pool_by_id(p_pool_id uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_join_pool_by_id(p_pool_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_join_pool_by_invite(p_invite_code text, p_passcode text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_join_pool_by_invite(p_invite_code text, p_passcode text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_join_pool_by_join_code(p_join_code text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_join_pool_by_join_code(p_join_code text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_join_pool_by_name_code(p_name text, p_code text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_join_pool_by_name_code(p_name text, p_code text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_list_my_pools() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_list_my_pools() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_list_pool_members_with_owner(p_pool_id uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_list_pool_members_with_owner(p_pool_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_post_message(p_pool_id uuid, p_body text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_post_message(p_pool_id uuid, p_body text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_rotate_pool_invite(p_pool_id uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_rotate_pool_invite(p_pool_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_test_pools_has_passcode_hash() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_test_pools_has_passcode_hash() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.send_smack_message(p_pool_id uuid, p_text text, p_reply_to uuid, p_mentions uuid[], p_message_type text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.send_smack_message(p_pool_id uuid, p_text text, p_reply_to uuid, p_mentions uuid[], p_message_type text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_pool_invite_code_primary(p_code_id uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_pool_invite_code_primary(p_code_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.update_member_note(p_pool_id uuid, p_user_id uuid, p_note text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_member_note(p_pool_id uuid, p_user_id uuid, p_note text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.update_member_role(p_pool_id uuid, p_user_id uuid, p_new_role text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_member_role(p_pool_id uuid, p_user_id uuid, p_new_role text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.update_partner_perk(p_partner_id uuid, p_perk_text text, p_perk_icon text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_partner_perk(p_partner_id uuid, p_perk_text text, p_perk_icon text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.update_partner_public_info(p_partner_id uuid, p_patch jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_partner_public_info(p_partner_id uuid, p_patch jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.update_pool_settings(p_pool_id uuid, p_name text, p_is_public boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_pool_settings(p_pool_id uuid, p_name text, p_is_public boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.update_pool_settings(p_pool_id uuid, p_name text, p_is_public boolean, p_welcome_message text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_pool_settings(p_pool_id uuid, p_name text, p_is_public boolean, p_welcome_message text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- SECTION 3 — SERVICE-ROLE ONLY
--   Called only by Edge Functions (service_role). Revoke anon, public AND
--   authenticated; grant service_role. None has an in-body super_admin
--   check today (see CRITICAL notes) — restricting to service_role is the
--   gate until an in-body check is added.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.anonymize_deleted_user(p_user_id uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.anonymize_deleted_user(p_user_id uuid) TO service_role;          -- delete-account Edge Function
REVOKE EXECUTE ON FUNCTION public.archive_old_smack_messages() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.archive_old_smack_messages() TO service_role;                    -- smack-archive-messages Edge Function
REVOKE EXECUTE ON FUNCTION public.finalize_latest_completed_week(p_competition text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.finalize_latest_completed_week(p_competition text) TO service_role; -- nfl-finalize-week Edge Function

-- ---------------------------------------------------------------------
-- SECTION 4 — LOCKDOWN (no client role keeps EXECUTE)
--   Trigger functions (fire regardless of grants), internal helpers called
--   inside other DEFINER functions as owner, cron-invoked-as-postgres
--   functions, and unused/legacy backend functions with NO call site.
--   admin_purge_user has ZERO authorization and is unused -> see CRITICAL.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public._assert_week_ready(p_competition text, p_week integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_purge_user(p_uid uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.announce_regular_winners_on_phase() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_join_public_beta_pool() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_notification_rate_limit(p_pool_id uuid, p_type text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_notification_preferences() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_user_cosmetics() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.escalate_stale_flagged_messages() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_default_skin() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.lock_week_ranks(in_season integer, in_week integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_smack_mentions() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_smack_reply() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_week_ready() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.post_welcome_message_on_member_join() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.propagate_partner_brand_to_snapshots() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.publish_week(p_season integer, p_week integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_current_week_view() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_reviewer_sim_countdown() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_set_current_week(p_season integer, p_week integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.simulate_week(p_week integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.smack_auto_escalate_hidden() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_week_state_from_games() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_auto_enroll_global_pools() FROM anon, authenticated, PUBLIC;

-- ---------------------------------------------------------------------
-- SECTION 5 — PIN MUTABLE search_path (audit #15, 13 functions)
--   Using `pg_catalog, public, extensions` (non-breaking superset: keeps
--   unqualified table refs in public AND any pgcrypto/uuid helpers in the
--   `extensions` schema resolvable — e.g. roster-pass generation).
-- ---------------------------------------------------------------------
ALTER FUNCTION public._week_readiness_is_ready(week_readiness)                SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public.archive_old_smack_messages()                           SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public.enforce_no_affiliations_on_owned_contests()            SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public.enforce_no_owning_club_when_affiliated()               SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public.generate_roster_pass()                                 SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public.notify_smack_mentions()                                SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public.notify_smack_reply()                                   SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public.partners_set_roster_pass()                             SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public.partners_touch_perk_updated_at()                       SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public.pool_invite_codes_sync_to_pool()                       SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public.pools_sync_invite_code_to_codes_table()                SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public.sync_primary_affiliation_to_pools_partner_id()         SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public.validate_message_type()                                SET search_path = pg_catalog, public, extensions;

COMMIT;
