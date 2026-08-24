-- ============================================================================
-- 260824b_add_pool_invite_code_namespace_check.sql
--
-- v1.4 §7 — close the missing namespace check on the ORGANIZER path.
--
-- NOT YET APPLIED. Unlike 260824_..., this is a real change; apply at merge.
--
-- THE GAP. Organizers have had multi-code management in Pool Settings since
-- before any of the partner work (add_pool_invite_code +
-- set_pool_invite_code_primary, migration 260515). That RPC checks CODE_TAKEN
-- against pool_invite_codes only. But join_pool_by_invite resolves a typed code
-- against pool_invite_codes OR pools.invite_slug — so an organizer could add a
-- code equal to ANOTHER pool's slug and produce an ambiguous match that joins
-- whichever row came back first.
--
-- v1.2 identified the multi-namespace requirement and built _invite_code_taken
-- for exactly this, then wired it only into the super-admin path. This is the
-- path more people use.
--
-- ---------------------------------------------------------------------------
-- DEVIATION FROM THE SPEC, AND THE REASON:
--
-- §7 says to REPLACE the inline EXISTS with _invite_code_taken(v_norm,
-- p_pool_id). That swap alone would introduce the bug 260824_ just finished
-- fixing on the other function.
--
-- _invite_code_taken deliberately EXCLUDES the caller's own pool
-- (`pool_id <> p_pool_id`) — a pool reusing its own retired code is the thing
-- the alias mechanism is FOR. The inline EXISTS has no such exclusion: it
-- rejects any active code anywhere, this pool's included.
--
-- Replace one with the other and a code this pool already holds stops being
-- caught by the guard. add_pool_invite_code then INSERTs unconditionally
-- (no promote-or-insert here), which violates pool_invite_codes_unique_active
-- and surfaces as a raw exception instead of a clean CODE_TAKEN.
--
-- So both predicates run: the inline EXISTS keeps the own-pool protection that
-- is already there, and _invite_code_taken adds the slug namespace. The result
-- is a strict superset of today's protection with no new failure mode, and the
-- error shape is unchanged. NOT_ORGANIZER gate untouched, as instructed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_pool_invite_code(p_pool_id uuid, p_code text, p_label text DEFAULT NULL::text, p_is_primary boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id uuid := auth.uid(); v_role text; v_norm text; v_new_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('error', 'Not authenticated'); END IF;
  SELECT role INTO v_role FROM pool_members
   WHERE pool_id = p_pool_id AND user_id = v_user_id AND status = 'active';
  IF v_role IS DISTINCT FROM 'organizer' THEN RETURN jsonb_build_object('error', 'NOT_ORGANIZER'); END IF;
  v_norm := upper(regexp_replace(coalesce(p_code, ''), '[\s\-]', '', 'g'));
  IF char_length(v_norm) NOT BETWEEN 6 AND 12 OR v_norm !~ '^[0-9A-Z]+$' THEN
    RETURN jsonb_build_object('error', 'INVALID_CODE');
  END IF;
  -- Own pool's active codes (unchanged) OR another pool's active code / slug.
  -- See the note above for why this is an OR and not a replacement.
  IF EXISTS (SELECT 1 FROM pool_invite_codes WHERE code = v_norm AND is_active = true)
     OR public._invite_code_taken(v_norm, p_pool_id) THEN
    RETURN jsonb_build_object('error', 'CODE_TAKEN');
  END IF;
  IF p_is_primary = true THEN
    UPDATE pool_invite_codes SET is_primary = false WHERE pool_id = p_pool_id AND is_primary = true;
  END IF;
  INSERT INTO pool_invite_codes (pool_id, code, label, is_primary, is_active, created_by)
  VALUES (p_pool_id, v_norm, p_label, p_is_primary, true, v_user_id) RETURNING id INTO v_new_id;
  RETURN jsonb_build_object('id', v_new_id, 'code', v_norm);
END;
$function$;
