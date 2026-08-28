-- Make a user_devices row say WHICH DEVICE it is.
--
-- 2026-08-24: one account held two active tokens, one delivering to a
-- MacBook Pro and one delivering nowhere, and the table could not tell them
-- apart. Every column that looks like it should have helped does not:
--
--   platform     — the token TRANSPORT, hardcoded 'expo'. All rows read 'expo'.
--   Platform.OS  — 'ios' for an iPhone AND for an iOS app on Apple Silicon.
--   device_name  — exists, nullable, and NULL on every row ever written,
--                  because register_device_token never accepted it.
--
-- So the Mac/iPhone split could only come from the owner's memory, and both
-- of us guessed a different token for the phone. This fills device_name with
-- Device.modelName ('iPhone 15 Pro' vs 'MacBook Pro'), which is the one
-- string that settles it.
--
-- No new column: device_name is already there and unused.
--
-- DROP-then-CREATE rather than an added overload, so exactly one
-- register_device_token exists and PostgREST cannot pick the wrong arity.
-- p_device_name defaults to NULL, so a client on an older bundle calling with
-- two arguments keeps working unchanged through the rollout.

DROP FUNCTION IF EXISTS public.register_device_token(text, text);

CREATE OR REPLACE FUNCTION public.register_device_token(
  p_push_token text,
  p_platform text DEFAULT 'expo'::text,
  p_device_name text DEFAULT NULL
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

  INSERT INTO user_devices (user_id, push_token, platform, is_active, last_used_at, device_name)
  VALUES (v_uid, p_push_token, p_platform, true, now(), left(p_device_name, 100))
  ON CONFLICT (push_token) DO UPDATE
    SET user_id      = v_uid,
        platform     = excluded.platform,
        is_active    = true,
        last_used_at = now(),
        -- COALESCE so an older client passing NULL never erases a label a
        -- newer one already wrote.
        device_name  = COALESCE(excluded.device_name, user_devices.device_name);
END;
$function$;

COMMENT ON FUNCTION public.register_device_token(text, text, text) IS
  'Registers/refreshes the caller''s Expo push token. Derives auth.uid() server-side and reassigns the token to the caller (a shared or reinstalled device follows whoever is signed in). Stamps last_used_at on every call — that is a REGISTRATION timestamp, NOT evidence the token can receive: a freshly stamped token can be undeliverable (verified 2026-08-24).';

COMMENT ON COLUMN public.user_devices.last_used_at IS
  'Last successful registration of this token. Measures app launches, NOT deliverability — and the ordering is the point: ExponentPushToken[pTk_LDMc...] failed to deliver at ~16:20Z on 2026-08-24 and was stamped fresh at 18:34:54Z the SAME DAY. A token can be stamped after it is known dead. Never use this column as a reachable-device count.';

COMMENT ON COLUMN public.user_devices.device_name IS
  'Device.modelName at registration ("iPhone 15 Pro", "MacBook Pro"). The only field that distinguishes an iPhone from an iOS app running on Apple Silicon — platform is the transport and Platform.OS reads "ios" for both. NULL on rows written before 2026-08-24.';

-- RE-GRANT: these four lines are NOT redundant. Do not remove them.
--
-- The DROP FUNCTION at the top of this file discards the function's ACL along
-- with the function. The CREATE that follows it does NOT inherit the old
-- privileges — it takes the Postgres defaults, which are EXECUTE to PUBLIC,
-- and in Supabase that includes anon. CREATE OR REPLACE preserves an ACL;
-- DROP-then-CREATE cannot, because there is nothing left to preserve.
--
-- Without these lines this file silently reverts two hardening migrations:
--   20260605023229_revoke_anon_execute_on_auth_rpcs
--   20260609141233_revoke_anon_execute_and_pin_search_path
--
-- Observed live on 2026-08-28, immediately after this file was applied:
--   register_device_token  =X | postgres=X | anon=X | authenticated=X | service_role=X
-- anon had EXECUTE on a SECURITY DEFINER function — the exact class those two
-- migrations closed. Exposure was limited only because the body raises
-- not_authenticated when auth.uid() is null; that is a second line of defence,
-- not a reason to leave the first one open.
--
-- Production was corrected separately by
-- 260828_restore_register_device_token_grants_after_drop. These lines exist so
-- a replay onto a fresh environment (branch, staging, rebuild) does not reopen
-- it.
REVOKE ALL ON FUNCTION public.register_device_token(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_device_token(text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.register_device_token(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_device_token(text, text, text) TO service_role;
