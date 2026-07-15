-- get_my_pending_applications  (Gaffer Approval Gate — Stage 2)
--
-- Self-scoped. Returns the CALLER's OWN pending applications, each with the
-- Contest NAME. Necessary because pools_select (20260529130000) gates non-global
-- pool reads on ACTIVE membership:
--     id IN (SELECT pool_id FROM pool_members
--             WHERE user_id = auth.uid() AND status = 'active')
-- A pending applicant is not active, so a direct pool_members → pools(name) join
-- returns NO name for them. SECURITY DEFINER reads the name past that policy; the
-- WHERE clause pins every row to auth.uid()'s own status='pending' memberships,
-- so it discloses nothing about other users, other applicants, or pools the
-- caller hasn't applied to. Contact/email is NEVER returned here (that lives only
-- in the organizer-gated get_pending_applicants).
--
-- Backs the applicant's client-synthesized Message Center entry (Stage 2 Piece 2)
-- and is the fallback name source for the waiting-room on a cold load. Read-only
-- and backward-compatible: safe to apply AHEAD of the held join→pending migration
-- — a user with no pending rows simply gets []. search_path=''.

CREATE OR REPLACE FUNCTION public.get_my_pending_applications()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_rows   jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('error', 'NOT_AUTHENTICATED');
  END IF;

  SELECT jsonb_agg(
           jsonb_build_object(
             'pool_id',    pm.pool_id,
             'pool_name',  COALESCE(p.name, 'Contest'),
             'applied_at', pm.joined_at
           )
           ORDER BY pm.joined_at
         )
    INTO v_rows
    FROM public.pool_members pm
    JOIN public.pools p ON p.id = pm.pool_id
   WHERE pm.user_id = v_caller
     AND pm.status  = 'pending'
     AND p.deleted_at IS NULL
     AND p.is_archived = false;

  RETURN jsonb_build_object('ok', true, 'applications', COALESCE(v_rows, '[]'::jsonb));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_my_pending_applications() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_my_pending_applications() TO authenticated, service_role;
