-- ============================================================================
-- 260824_set_pool_invite_code_allow_reusing_own_retired_code.sql
--
-- GIT SYNC of already-applied production state. Applied 2026-08-24; this
-- commits it so a rebuild from git does not reinstate the bug. Safe to
-- re-apply — CREATE OR REPLACE, no data statements.
--
-- Transcribed from the live pg_get_functiondef, not re-derived from the
-- previous migration.
--
-- THE DEFECT: the final INSERT was unconditional. Retired codes stay
-- is_active = true — that IS the alias mechanism, the reason a printed table
-- tent keeps working — so returning to a code the pool had used before
-- collided with the partial unique index pool_invite_codes_unique_active.
--
-- What made it confusing to diagnose: _invite_code_taken correctly ALLOWED the
-- change. It excludes the pool's own rows, because a pool reusing its own
-- retired code is exactly what should be permitted. So the guard passed and
-- the write failed underneath it.
--
-- THE FIX: promote-or-insert. If this pool already has a row for the target
-- code, UPDATE it back to primary/active; otherwise INSERT. Explicit IF/ELSE
-- rather than ON CONFLICT, because inferring a PARTIAL unique index in an
-- ON CONFLICT clause is fiddly and the branch reads plainly.
--
-- Proven end to end on The Natural: THENATURAL26 -> THENATURAL25 -> back to
-- THENATURAL26, both codes is_active throughout, two POOL_INVITE_CODE_CHANGED
-- audit rows.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_pool_invite_code(p_pool_id uuid, p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller  uuid := auth.uid();
  v_code    text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_old     text;
  v_members int;
BEGIN
  IF v_caller IS NULL THEN RETURN jsonb_build_object('error', 'NOT_AUTHENTICATED'); END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_caller AND is_super_admin) THEN
    RETURN jsonb_build_object('error', 'NOT_AUTHORIZED'); END IF;

  IF length(v_code) < 6 OR length(v_code) > 12 THEN
    RETURN jsonb_build_object('error', 'BAD_FORMAT'); END IF;

  SELECT invite_code INTO v_old FROM pools WHERE id = p_pool_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'POOL_NOT_FOUND'); END IF;
  IF v_old = v_code THEN RETURN jsonb_build_object('ok', true, 'unchanged', true); END IF;

  SELECT count(*) INTO v_members FROM pool_members
   WHERE pool_id = p_pool_id AND role <> 'organizer' AND status = 'active';
  IF v_members > 0 THEN
    RETURN jsonb_build_object('error', 'CODE_LOCKED', 'members', v_members); END IF;

  IF public._invite_code_taken(v_code, p_pool_id) THEN
    RETURN jsonb_build_object('error', 'CODE_TAKEN'); END IF;

  INSERT INTO admin_audit_log (admin_id, action, target_table, target_id, metadata)
  VALUES (v_caller, 'POOL_INVITE_CODE_CHANGED', 'pools', p_pool_id,
          jsonb_build_object('from', v_old, 'to', v_code));

  -- Demote the current primary. It stays is_active = true: that is the alias.
  UPDATE pool_invite_codes
     SET is_primary = false
   WHERE pool_id = p_pool_id AND is_primary = true;

  -- Ensure the outgoing code is represented (no-op when it already has a row,
  -- which is the normal case since creation writes one).
  IF v_old IS NOT NULL AND length(v_old) BETWEEN 6 AND 12
     AND upper(v_old) ~ '^[0-9A-Z]+$'
     AND NOT EXISTS (SELECT 1 FROM pool_invite_codes
                      WHERE pool_id = p_pool_id AND code = upper(v_old)) THEN
    INSERT INTO pool_invite_codes (pool_id, code, label, is_primary, is_active, created_by)
    VALUES (p_pool_id, upper(v_old), 'Retired', false, true, v_caller)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Promote-or-insert the incoming code. THIS is the fix: returning to a code
  -- this pool previously used must UPDATE its existing row, not INSERT a
  -- duplicate.
  IF EXISTS (SELECT 1 FROM pool_invite_codes
              WHERE pool_id = p_pool_id AND code = v_code) THEN
    UPDATE pool_invite_codes
       SET is_primary = true, is_active = true, label = 'Custom'
     WHERE pool_id = p_pool_id AND code = v_code;
  ELSE
    INSERT INTO pool_invite_codes (pool_id, code, label, is_primary, is_active, created_by)
    VALUES (p_pool_id, v_code, 'Custom', true, true, v_caller);
  END IF;

  RETURN jsonb_build_object('ok', true, 'code', v_code, 'alias_kept', v_old);
END;
$function$;
