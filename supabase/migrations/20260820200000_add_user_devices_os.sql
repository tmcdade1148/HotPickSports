-- Record the device OS at registration, separately from the token transport.
--
-- WHY: `user_devices.platform` is the token TRANSPORT and is pinned three ways —
-- the client hardcodes 'expo', the table CHECK allows only expo|apns|fcm, and
-- register_device_token re-validates the same whitelist. Every one of the 29
-- rows therefore reads 'expo', so the database cannot answer "how many affected
-- devices are iOS?" — that split has had to come from Tom's own knowledge.
-- Writing Platform.OS into `platform` would fail the CHECK *and* the RPC's
-- whitelist and would break every registration, so the OS needs its own column.
--
-- Nullable on purpose: rows written before this migration have no OS, and a
-- client that predates the matching OTA will keep calling with two arguments.
-- NULL means "not recorded", never "unknown platform".
--
-- Register item 1.12 (2026-08-20).

ALTER TABLE public.user_devices
  ADD COLUMN IF NOT EXISTS os text;

ALTER TABLE public.user_devices
  DROP CONSTRAINT IF EXISTS user_devices_os_check;

ALTER TABLE public.user_devices
  ADD CONSTRAINT user_devices_os_check
  CHECK (os IS NULL OR os IN ('ios', 'android'));

COMMENT ON COLUMN public.user_devices.platform IS
  'Token TRANSPORT (expo|apns|fcm) — NOT the device OS. Always ''expo'' today. '
  'For the operating system use user_devices.os.';

COMMENT ON COLUMN public.user_devices.os IS
  'Device operating system (ios|android), captured at registration from '
  'React Native Platform.OS. NULL = not recorded (row predates the column, or '
  'a client older than the 2026-08-20 OTA). Added for register item 1.12, where '
  'the iOS/Android split of affected devices could not be answered from the DB.';

-- Replace the RPC with an optional p_os. DROP-then-CREATE rather than adding an
-- overload, so exactly one definition exists and a two-argument call from an
-- older client still resolves here via the default.
DROP FUNCTION IF EXISTS public.register_device_token(text, text);

CREATE OR REPLACE FUNCTION public.register_device_token(
  p_push_token text,
  p_platform   text DEFAULT 'expo',
  p_os         text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Identity is derived here, never accepted from the client.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Whitelist the transport against the table CHECK (expo|apns|fcm).
  IF p_platform NOT IN ('expo','apns','fcm') THEN
    RAISE EXCEPTION 'invalid_platform: %', p_platform USING ERRCODE = '22023';
  END IF;

  -- The OS is optional, but a wrong value is a bug worth surfacing rather than
  -- storing. NULL stays NULL.
  IF p_os IS NOT NULL AND p_os NOT IN ('ios','android') THEN
    RAISE EXCEPTION 'invalid_os: %', p_os USING ERRCODE = '22023';
  END IF;

  INSERT INTO user_devices (user_id, push_token, platform, os, is_active, last_used_at)
  VALUES (v_uid, p_push_token, p_platform, p_os, true, now())
  ON CONFLICT (push_token) DO UPDATE
    SET user_id      = v_uid,
        platform     = excluded.platform,
        -- Never let an older two-argument client erase an OS already recorded.
        os           = COALESCE(excluded.os, user_devices.os),
        is_active    = true,
        last_used_at = now();
END;
$function$;

-- Restore the grants the dropped function carried (0.8 hardening: authenticated
-- + service_role only; anon must never hold EXECUTE).
REVOKE ALL ON FUNCTION public.register_device_token(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_device_token(text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.register_device_token(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_device_token(text, text, text) TO service_role;
