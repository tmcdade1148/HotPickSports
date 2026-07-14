-- reject_pending_member  (Gaffer Approval Gate — Stage 1)
--
-- Organizer-gated. Soft-deletes a pending applicant to status='removed'
-- (Hard Rule #16 — never a hard DELETE). Stateless: records nothing about the
-- rejection; a 'removed' row re-routes back to 'pending' via
-- join_pool_by_invite's ON CONFLICT if they re-apply. search_path=''.

CREATE OR REPLACE FUNCTION public.reject_pending_member(
  p_pool_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  v_caller  uuid := auth.uid();
  v_updated int;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('error', 'NOT_AUTHENTICATED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pool_members
     WHERE pool_id = p_pool_id AND user_id = v_caller
       AND role = 'organizer' AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('error', 'NOT_AUTHORIZED');
  END IF;

  UPDATE public.pool_members
     SET status = 'removed'
   WHERE pool_id = p_pool_id AND user_id = p_user_id AND status = 'pending';
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN jsonb_build_object('error', 'NOT_PENDING');
  END IF;

  RETURN jsonb_build_object('ok', true, 'user_id', p_user_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.reject_pending_member(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reject_pending_member(uuid, uuid) TO authenticated, service_role;
