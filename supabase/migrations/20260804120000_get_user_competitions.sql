-- get_user_competitions  (SWITCHER-01 §4 — Event Switcher, V1)
--
-- Returns every competition the CALLER is CONNECTED to: at least one active
-- membership in a Contest that is not hidden, not archived, and not soft-
-- deleted. Organizers count — an organizer is also a member.
--
-- Why SECURITY DEFINER rather than a client query (spec §3, locked):
--   * the hidden/archived/deleted rule is a server concern and must not be
--     bypassable from the client;
--   * pools_select (20260529130000) gates non-global pool reads on ACTIVE
--     membership, so a client-side join is at the mercy of policy drift.
--
-- The is_hidden_from_users filter is load-bearing, NOT hygiene:
-- trigger_auto_enroll_global_pools drops every signup into every active
-- global pool (including NFL26PRE Global). If global membership counted as a
-- connection, every user on the platform would see the preseason in their
-- switcher and the invite-only model collapses (spec §2e / §6).
--
-- Self-scoped and read-only: every row is pinned to auth.uid(), and the
-- result is a bare list of competition strings — it discloses nothing about
-- other users or about Contests the caller isn't in.
--
-- Deviation from SWITCHER-01 §4, deliberate: the spec's body used
-- `SET search_path TO 'public'` with unqualified table names. This uses
-- `search_path = ''` with fully-qualified names instead — the hardened pattern
-- the privileged surface was migrated to (20260608153000 / 20260611190000, and
-- most recently get_my_pending_applications). Functionally identical; it just
-- stops anything in `public` from resolving ahead of the catalog inside a
-- SECURITY DEFINER body. Same result set, same grants.

CREATE OR REPLACE FUNCTION public.get_user_competitions()
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path = ''
AS $function$
  SELECT COALESCE(array_agg(DISTINCT p.competition), ARRAY[]::text[])
  FROM public.pool_members pm
  JOIN public.pools p ON p.id = pm.pool_id
  WHERE pm.user_id = auth.uid()
    AND pm.status = 'active'
    AND p.is_hidden_from_users IS NOT TRUE
    AND p.is_archived = false
    AND p.deleted_at IS NULL;
$function$;

-- Supabase's default privileges also grant EXECUTE to anon on new
-- public-schema functions, so PUBLIC alone is not enough — revoke anon
-- explicitly (same follow-up get_public_contest needed). auth.uid() is NULL
-- for anon so the result would be empty anyway; the grant should not stand.
REVOKE EXECUTE ON FUNCTION public.get_user_competitions() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_user_competitions() TO authenticated;
