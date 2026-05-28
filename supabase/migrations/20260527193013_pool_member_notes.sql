-- pool_member_notes
--
-- Free-text notes per member, scoped to one Contest. Shared across the
-- Contest's Gaffer + Admins (not per-author) so payout reconciliation,
-- buy-in tracking notes, etc. work even when multiple managers add to
-- the record over the season.
--
-- Read access: any active organizer/admin of the pool.
-- Write access: same — via the `update_member_note` SECURITY DEFINER RPC.
-- Players themselves can't read the notes about them.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pool_member_notes (
  pool_id     uuid NOT NULL REFERENCES public.pools(id)    ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  note_text   text NOT NULL CHECK (length(note_text) <= 500),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES public.profiles(id),
  PRIMARY KEY (pool_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pool_member_notes_pool ON public.pool_member_notes(pool_id);

ALTER TABLE public.pool_member_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pool_member_notes_select_managers ON public.pool_member_notes;
CREATE POLICY pool_member_notes_select_managers
  ON public.pool_member_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pool_members pm
       WHERE pm.pool_id = pool_member_notes.pool_id
         AND pm.user_id = auth.uid()
         AND pm.role IN ('organizer', 'admin')
         AND pm.status = 'active'
    )
  );

CREATE OR REPLACE FUNCTION public.update_member_note(
  p_pool_id  uuid,
  p_user_id  uuid,
  p_note     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_role   text;
  v_target_exists boolean;
  v_trimmed text;
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

  SELECT EXISTS (
    SELECT 1 FROM pool_members
     WHERE pool_id = p_pool_id
       AND user_id = p_user_id
       AND status  = 'active'
  ) INTO v_target_exists;

  IF NOT v_target_exists THEN
    RETURN jsonb_build_object('error', 'TARGET_NOT_MEMBER');
  END IF;

  v_trimmed := COALESCE(trim(p_note), '');

  IF length(v_trimmed) = 0 THEN
    DELETE FROM pool_member_notes
     WHERE pool_id = p_pool_id AND user_id = p_user_id;
    RETURN jsonb_build_object('ok', true, 'cleared', true);
  END IF;

  IF length(v_trimmed) > 500 THEN
    RETURN jsonb_build_object('error', 'NOTE_TOO_LONG');
  END IF;

  INSERT INTO pool_member_notes (pool_id, user_id, note_text, updated_by)
  VALUES (p_pool_id, p_user_id, v_trimmed, v_caller)
  ON CONFLICT (pool_id, user_id) DO UPDATE
    SET note_text  = EXCLUDED.note_text,
        updated_at = now(),
        updated_by = EXCLUDED.updated_by;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_member_note(uuid, uuid, text) TO authenticated;
