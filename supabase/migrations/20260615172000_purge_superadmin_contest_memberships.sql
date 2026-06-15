-- One-time purge: remove super-admins as MEMBERS of real contests.
-- Super-admins are creators-only now (see 20260615170000). This drops their active
-- pool_members rows from user-facing contests so they're not players / not on
-- leaderboards. It does NOT touch:
--   * global pools (is_global) or hidden infra pools (is_hidden_from_users) — e.g.
--     the Platform Pool that carries admin broadcasts — so admin messaging keeps working;
--   * pools.organizer_id — super-admins still OWN/manage the contests they created
--     (management RPCs use the super_admin bypass, not the member row).
-- Soft delete only (status='left') per the never-DELETE-membership rule (REFERENCE §6).
--
-- DESTRUCTIVE on production membership data. Runs under the gated deploy
-- (manual backup + go-ahead), not automatically.

-- Audit each removal first (Hard Rule #17). admin_id = the super-admin themselves;
-- MEMBER_REMOVED is in the admin_audit_log action allowlist.
INSERT INTO public.admin_audit_log (admin_id, action, target_table, target_id, metadata)
SELECT pm.user_id, 'MEMBER_REMOVED', 'pool_members', pm.pool_id,
       jsonb_build_object('reason', 'super_admin_creator_only_purge',
                          'competition', p.competition, 'role', pm.role)
FROM public.pool_members pm
JOIN public.profiles pr ON pr.id = pm.user_id AND pr.is_super_admin = true
JOIN public.pools p     ON p.id = pm.pool_id
WHERE pm.status = 'active'
  AND p.is_global = false
  AND COALESCE(p.is_hidden_from_users, false) = false
  AND p.is_archived = false
  AND p.deleted_at IS NULL;

UPDATE public.pool_members pm
   SET status = 'left', left_at = now()
FROM public.profiles pr, public.pools p
WHERE pm.user_id = pr.id AND pr.is_super_admin = true
  AND pm.pool_id = p.id
  AND pm.status = 'active'
  AND p.is_global = false
  AND COALESCE(p.is_hidden_from_users, false) = false
  AND p.is_archived = false
  AND p.deleted_at IS NULL;
