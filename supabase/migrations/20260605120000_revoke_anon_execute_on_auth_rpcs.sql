-- revoke_anon_execute_on_auth_rpcs
--
-- Defense in depth: SECURITY DEFINER functions get an implicit EXECUTE grant to
-- PUBLIC (which includes `anon`) on creation. Our role/partner-auth functions
-- already bail for unauthenticated callers (auth.uid() IS NULL → FORBIDDEN /
-- false / empty), but there's no reason `anon` should be able to invoke them at
-- all. Revoke the PUBLIC grant and re-grant only what's needed:
--   • client-callable RPCs  → authenticated only
--   • internal helpers / trigger fn → no client grant (invoked as definer)
-- ---------------------------------------------------------------------------

-- Client-callable RPCs: authenticated only (admin_* still gate super_admin
-- internally; a super-admin is an authenticated user).
REVOKE EXECUTE ON FUNCTION public.admin_set_league_chairman(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_set_league_chairman(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_set_club_pool_gaffer(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_set_club_pool_gaffer(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.grant_partner_director_by_email(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.grant_partner_director_by_email(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.revoke_partner_member(uuid, uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.revoke_partner_member(uuid, uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.list_partner_members(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.list_partner_members(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.grant_pool_delegate_by_email(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.grant_pool_delegate_by_email(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.revoke_pool_delegate(uuid, uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.revoke_pool_delegate(uuid, uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.list_pool_delegates(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.list_pool_delegates(uuid) TO authenticated;

-- Internal helpers + trigger function: never called directly by a client.
-- They run inside other SECURITY DEFINER functions / as a trigger, where
-- permission is checked against the function owner, not the client — so no
-- client grant is needed.
REVOKE EXECUTE ON FUNCTION public._caller_can_manage_partner(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._caller_is_pool_organizer(uuid)  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._claim_pending_role_grants()     FROM PUBLIC;
