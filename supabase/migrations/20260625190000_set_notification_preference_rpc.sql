-- ============================================================================
-- Register 1.3 — notification_preferences toggle-persistence fix
-- ============================================================================
-- DRAFT — NOT applied. Leave for Tom to review + take a manual Supabase backup
-- before applying via `apply_migration` (RLS-protected table; SECURITY DEFINER).
--
-- Symptom: notification toggles silently fail to persist and "reset" on relogin.
-- Root cause: the single `ALL` RLS policy on notification_preferences only permits
-- a write when `user_id = auth.uid()`, and the client upsert fired with a null/stale
-- `userId`, so the WITH CHECK failed and the write reverted (a silent no-op).
--
-- Fix: a SECURITY DEFINER RPC that derives `auth.uid()` SERVER-SIDE (never trusts a
-- client-supplied user_id) and updates only the caller's own row. Guardrails:
--   * `p_type` is WHITELISTED against the 8 known toggle columns. It is untrusted
--     input naming a column, so NO dynamic SQL is built from it — the UPDATE compares
--     p_type to string literals and writes statically-named columns via CASE.
--   * `search_path` pinned (definer hygiene); `auth.uid()` is schema-qualified.
--   * EXECUTE granted to `authenticated` only; revoked from PUBLIC/anon.
--
-- ⚠️ Deployment ordering: this RPC must be LIVE before the matching client change
--    (NotificationPreferencesScreen → rpc) ships via OTA/build, or the toggle's rpc
--    call will error until the function exists.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_notification_preference(p_type text, p_value boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Identity is derived here, never accepted from the client.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Whitelist the column name. Anything outside the 8 toggle columns raises, so an
  -- invalid type surfaces as an error instead of a silent no-op. (Defense against a
  -- SECURITY DEFINER fn being handed an arbitrary column name.)
  IF p_type NOT IN (
    'picks_deadline','score_posted','leaderboard_change','smacktalk_mention',
    'smacktalk_reply','organizer_broadcast','streak_milestone','new_member_joined'
  ) THEN
    RAISE EXCEPTION 'invalid_preference_type: %', p_type USING ERRCODE = '22023';
  END IF;

  -- Seed the row if missing (older accounts were never seeded), then set the one
  -- targeted column. The column NAMES are static literals here; p_type is only ever
  -- compared, never interpolated — no dynamic SQL.
  INSERT INTO notification_preferences (user_id) VALUES (v_uid)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE notification_preferences SET
    picks_deadline      = CASE WHEN p_type = 'picks_deadline'      THEN p_value ELSE picks_deadline      END,
    score_posted        = CASE WHEN p_type = 'score_posted'        THEN p_value ELSE score_posted        END,
    leaderboard_change  = CASE WHEN p_type = 'leaderboard_change'  THEN p_value ELSE leaderboard_change  END,
    smacktalk_mention   = CASE WHEN p_type = 'smacktalk_mention'   THEN p_value ELSE smacktalk_mention   END,
    smacktalk_reply     = CASE WHEN p_type = 'smacktalk_reply'     THEN p_value ELSE smacktalk_reply     END,
    organizer_broadcast = CASE WHEN p_type = 'organizer_broadcast' THEN p_value ELSE organizer_broadcast END,
    streak_milestone    = CASE WHEN p_type = 'streak_milestone'    THEN p_value ELSE streak_milestone    END,
    new_member_joined   = CASE WHEN p_type = 'new_member_joined'   THEN p_value ELSE new_member_joined   END,
    updated_at          = now()
  WHERE user_id = v_uid;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_notification_preference(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_notification_preference(text, boolean) TO authenticated;
