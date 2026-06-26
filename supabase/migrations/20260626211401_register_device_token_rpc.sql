-- SECURITY DEFINER device-token registration.
-- A device's Expo push token is unique per device (user_devices' only unique key
-- is push_token alone), so when a phone is shared across accounts — a tester's
-- test account + real account, or a reinstall — the SAME token can already belong
-- to a DIFFERENT user. A direct client upsert hits that other user's row and the
-- per-user RLS (USING auth.uid() = user_id) blocks the reassign with a 42501
-- "(USING expression)" error, so the newly-logged-in account silently registers
-- no device and receives no pushes. This RPC derives auth.uid() server-side and
-- reassigns the token to the caller, which is the correct behavior: the device's
-- notifications follow whoever is currently signed in.
CREATE OR REPLACE FUNCTION public.register_device_token(
  p_push_token text,
  p_platform   text DEFAULT 'expo'
)
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

  -- Whitelist the transport against the table CHECK (expo|apns|fcm).
  IF p_platform NOT IN ('expo','apns','fcm') THEN
    RAISE EXCEPTION 'invalid_platform: %', p_platform USING ERRCODE = '22023';
  END IF;

  INSERT INTO user_devices (user_id, push_token, platform, is_active, last_used_at)
  VALUES (v_uid, p_push_token, p_platform, true, now())
  ON CONFLICT (push_token) DO UPDATE
    SET user_id      = v_uid,
        platform     = excluded.platform,
        is_active    = true,
        last_used_at = now();
END;
$function$;

REVOKE ALL ON FUNCTION public.register_device_token(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.register_device_token(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.register_device_token(text, text) TO authenticated;
