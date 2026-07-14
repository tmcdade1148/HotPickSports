-- get_pending_applicants  (Gaffer Approval Gate — Stage 1)
--
-- Organizer-ONLY. Returns each pending applicant's display name, real name, and
-- contact. "contact" = public.profiles.email — the SAME source the (now-dropped)
-- export_pool_members RPC read. This is the single place applicant contact info
-- is exposed, and only to the pool's active organizer. search_path=''.

CREATE OR REPLACE FUNCTION public.get_pending_applicants(p_pool_id uuid)
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

  IF NOT EXISTS (
    SELECT 1 FROM public.pool_members
     WHERE pool_id = p_pool_id AND user_id = v_caller
       AND role = 'organizer' AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('error', 'NOT_AUTHORIZED');
  END IF;

  SELECT jsonb_agg(
           jsonb_build_object(
             'user_id',      pm.user_id,
             'display_name', COALESCE(pr.poolie_name, ''),
             'real_name',    trim(COALESCE(pr.first_name, '') || ' ' || COALESCE(pr.last_name, '')),
             'contact',      COALESCE(pr.email, ''),
             'applied_at',   pm.joined_at
           )
           ORDER BY pm.joined_at
         )
    INTO v_rows
    FROM public.pool_members pm
    JOIN public.profiles pr ON pr.id = pm.user_id
   WHERE pm.pool_id = p_pool_id AND pm.status = 'pending';

  RETURN jsonb_build_object('ok', true, 'applicants', COALESCE(v_rows, '[]'::jsonb));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_pending_applicants(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_pending_applicants(uuid) TO authenticated, service_role;
