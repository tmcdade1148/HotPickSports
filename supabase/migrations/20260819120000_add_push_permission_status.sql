-- =============================================================================
-- Migration: push permission status on notification_preferences
-- Spec: 260819_HotPick_PushPermissionRecovery_Spec v2.1, §4 + §5 (Phase 1)
-- =============================================================================
-- On iOS the OS grants exactly one notification prompt. A user who declines it
-- is unrecoverable in-app, and today that decline is invisible: a user with no
-- push token looks identical whether they declined, were never asked, or hit a
-- registration failure. These two columns make the decline a fact.
--
-- WHY HERE and not a new table: notification_preferences already holds exactly
-- one row per user, auto-created by trg_create_notification_preferences on
-- profiles, so every existing and future account already has a destination row.
-- Hard Rule #12 is preserved — push TOKENS stay in user_devices; this records
-- permission state, which is not a token.
--
-- Both columns are nullable on purpose. NULL is a real, load-bearing state: the
-- client has never reported. Users on a build that predates this stay NULL,
-- which is exactly the signal that separates "declined" from "never asked by a
-- build that could ask".
-- =============================================================================

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS push_permission_status text
    CHECK (push_permission_status IN ('granted', 'denied', 'undetermined')),
  ADD COLUMN IF NOT EXISTS push_permission_checked_at timestamptz;

COMMENT ON COLUMN public.notification_preferences.push_permission_status IS
  'OS-level push permission as last reported by the client. NULL means never '
  'reported (client predates this build, or never reached the ask).';

COMMENT ON COLUMN public.notification_preferences.push_permission_checked_at IS
  'UTC timestamp of the last client report of push_permission_status.';

-- =============================================================================
-- record_push_permission — the only writer of those two columns.
--
-- Pattern copied from set_notification_preference / register_device_token:
-- SECURITY DEFINER, auth.uid() derived server-side and never accepted as a
-- parameter, input whitelisted, search_path pinned, PUBLIC and anon revoked,
-- authenticated granted.
--
-- search_path is `pg_catalog, public, pg_temp` — both halves are deliberate.
--
--   pg_catalog FIRST, matching all three existing SECURITY DEFINER RPCs in this
--   database (verified 2026-08-19). Spec §5 printed `public, pg_temp`; putting
--   public first would let an object there shadow a catalog function inside a
--   definer-rights routine.
--
--   pg_temp LAST, explicitly. Omitting pg_temp does NOT remove it — Postgres
--   then searches it FIRST, which is exactly the shadowing hole the pin exists
--   to close. The three existing RPCs pin only `pg_catalog, public` and so
--   carry that latent gap; this one does not.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.record_push_permission(
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Identity is derived here, never accepted from the client.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_status NOT IN ('granted', 'denied', 'undetermined') THEN
    RAISE EXCEPTION 'invalid_status: %', p_status USING ERRCODE = '22023';
  END IF;

  -- The row is guaranteed by trg_create_notification_preferences, but
  -- ON CONFLICT keeps this safe for any account predating that trigger.
  -- user_id is the PRIMARY KEY (verified), so the conflict target is valid.
  INSERT INTO public.notification_preferences
    (user_id, push_permission_status, push_permission_checked_at)
  VALUES (v_uid, p_status, now())
  ON CONFLICT (user_id) DO UPDATE
    SET push_permission_status     = excluded.push_permission_status,
        push_permission_checked_at = excluded.push_permission_checked_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_push_permission(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_push_permission(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_push_permission(text) TO authenticated;
