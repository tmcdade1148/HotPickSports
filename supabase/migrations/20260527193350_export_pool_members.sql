-- export_pool_members
--
-- Returns the manager-visible roster for a Contest, including each
-- member's legal name, poolie name, email, joined timestamp, role,
-- and (shared) note. Client formats CSV from the result and shares it
-- via the native share sheet.
--
-- Auth: organizer or admin of the pool only. Writes an audit event
-- before returning data so the export is traceable.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.export_pool_members(p_pool_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller     uuid := auth.uid();
  v_role       text;
  v_competition text;
  v_pool_name  text;
  v_rows       jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('error', 'NOT_AUTHENTICATED');
  END IF;

  SELECT role INTO v_role
    FROM pool_members
   WHERE pool_id = p_pool_id
     AND user_id = v_caller
     AND status  = 'active';

  IF v_role NOT IN ('organizer', 'admin') THEN
    RETURN jsonb_build_object('error', 'NOT_AUTHORIZED');
  END IF;

  SELECT competition, name INTO v_competition, v_pool_name
    FROM pools WHERE id = p_pool_id;

  IF v_pool_name IS NULL THEN
    RETURN jsonb_build_object('error', 'POOL_NOT_FOUND');
  END IF;

  SELECT jsonb_agg(
           jsonb_build_object(
             'poolie_name',  COALESCE(pr.poolie_name, ''),
             'first_name',   COALESCE(pr.first_name, ''),
             'last_name',    COALESCE(pr.last_name,  ''),
             'email',        COALESCE(pr.email,      ''),
             'joined_at',    pm.joined_at,
             'role',         pm.role,
             'note',         COALESCE(pmn.note_text, '')
           )
           ORDER BY LOWER(COALESCE(pr.poolie_name, pr.first_name, ''))
         )
    INTO v_rows
    FROM pool_members pm
    JOIN profiles pr      ON pr.id = pm.user_id
    LEFT JOIN pool_member_notes pmn
           ON pmn.pool_id = pm.pool_id
          AND pmn.user_id = pm.user_id
   WHERE pm.pool_id = p_pool_id
     AND pm.status  = 'active';

  -- Audit log entry. Logged BEFORE the return so even a network
  -- failure mid-flight leaves a record of the request.
  INSERT INTO pool_events (pool_id, competition, user_id, event_type, metadata)
  VALUES (
    p_pool_id, v_competition, v_caller, 'MEMBER_EXPORT_REQUESTED',
    jsonb_build_object('row_count', jsonb_array_length(COALESCE(v_rows, '[]'::jsonb)))
  );

  RETURN jsonb_build_object(
    'ok',          true,
    'pool_name',   v_pool_name,
    'competition', v_competition,
    'rows',        COALESCE(v_rows, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.export_pool_members(uuid) TO authenticated;
