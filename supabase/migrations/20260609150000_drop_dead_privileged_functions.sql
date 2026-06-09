-- =====================================================================
-- Cleanup: DROP dead / broken privileged functions.
--
-- Branch: fix/security-cleanup-drops  (create off main AFTER security PR #233
--   merges; this file is staged ahead of that).
-- Builds on the applied anon-revoke hardening.
--
-- *** DO NOT apply without a manual Supabase backup first. ***
-- *** Production DB — nfl_2026 is OFF_SEASON. ***
--
-- Scope: ONLY functions re-verified as provably dead — 0 call sites in /src and
-- supabase/functions, 0 catalog dependencies, not used by any trigger/view/cron,
-- and whose bodies reference only legacy / non-existent objects (so they would
-- error on the first statement and cannot be in successful use by anyone,
-- including stale App-Store builds).
--
-- Explicitly OUT of scope (held NEEDS-TOM-DECISION / deferred post-launch):
--   * simulate_week(int) — live sim tooling; writes real season_picks /
--     season_user_totals for nfl_2026. KEPT.
--   * the rpc_* "graveyard" that references LIVE tables (rpc_hotpick_*,
--     rpc_find_pool_*, rpc_join_pool*, rpc_list_*, rpc_get_*, rpc_post_message,
--     rpc_rotate_pool_invite, rpc_invalidate_pool_invites, rpc_archive_pool,
--     rpc_test_pools_has_passcode_hash) — could be reachable by older shipped
--     app builds; deferred.
--
-- No CASCADE anywhere. rpc_current_week_rank_readiness is dropped before
-- rpc_current_week because the former calls the latter.
-- =====================================================================

BEGIN;

-- Broken: first statement is `DELETE FROM public.picks` (table does not exist).
DROP FUNCTION IF EXISTS public.admin_purge_user(p_uid uuid);

-- Legacy: writes public.weekly_rank_lock / reads public.v_week_rank_final (gone).
DROP FUNCTION IF EXISTS public.lock_week_ranks(in_season integer, in_week integer);

-- Legacy: reads public.games / writes public.week_meta (gone).
DROP FUNCTION IF EXISTS public.publish_week(p_season integer, p_week integer);

-- Legacy: writes public.app_current_week (gone).
DROP FUNCTION IF EXISTS public.rpc_set_current_week(p_season integer, p_week integer);

-- Inert probe: no table references, no call sites.
DROP FUNCTION IF EXISTS public.rpc_create_pool_probe(p_name text, p_passcode text);

-- Legacy readiness pair (drop the caller first, then the callee).
DROP FUNCTION IF EXISTS public.rpc_current_week_rank_readiness();   -- reads games / frozen_matchup_ranks (gone); calls rpc_current_week()
DROP FUNCTION IF EXISTS public.rpc_current_week();                  -- reads app_current_week (gone)

COMMIT;
