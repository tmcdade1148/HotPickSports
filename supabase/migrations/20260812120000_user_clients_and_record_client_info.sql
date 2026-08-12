-- =============================================================================
-- Migration: user_clients + record_client_info() — client build telemetry
-- Spec: 260812_HotPick_UpdateDeliveryAndClientTelemetry_Spec v1.3, Part A (§4)
-- =============================================================================
-- One cross-cutting infra table (not per-sport/event — Hard Rule #1) holding ONE
-- ROW PER PLAYER describing which client build they last ran. Written on cold
-- start by record_client_info(); never written directly by the client.
--
-- Why not an existing table (spec §4.1 examined four and rejected all four):
--   profiles          — BEFORE UPDATE trigger set_profiles_updated_at fires on
--                       every UPDATE, so boot churn would destroy
--                       profiles.updated_at as a forensic signal.
--   user_devices      — push_token is NOT NULL and is the ON CONFLICT key, so a
--                       Player who declines the notification prompt has no row
--                       at all. That blind spot is the reason this table exists.
--   member_engagement — keyed (pool_id, user_id, competition): pool-scoped, so
--                       wrong grain. Client identity belongs to the Player.
--   client_error_log  — event-grained, and only Players who hit an ERROR appear.
--                       For a coverage question that population is backwards.
--
-- RLS: enabled, with TWO SELECT policies (own row, super-admin) and NO INSERT or
-- UPDATE policy by design. Every write goes through record_client_info(), which
-- is SECURITY DEFINER. Table grants are narrowed to match.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_clients (
  user_id           uuid PRIMARY KEY
                      REFERENCES auth.users(id) ON DELETE CASCADE,
  app_version       text,        -- Constants.expoConfig.version. Currently "1.1".
                                 -- This is app.json `version`, NOT runtimeVersion
                                 -- ("1.1.0"). Different fields. VersionStamp.tsx
                                 -- line 11 says 1.1.0 and that comment is stale.
  os_platform       text,        -- Platform.OS: ios | android | web
  channel           text,        -- Updates.channel: production | preview.
                                 -- Separates preseason testers from real users.
  update_id         text,        -- Updates.updateId, UUID of the RUNNING update.
                                 -- Null ONLY where expo-updates is disabled (dev).
                                 -- NOT null on an embedded launch — use
                                 -- is_embedded for "has not taken an OTA".
  update_created_at timestamptz, -- Updates.createdAt. The value that MOVES.
                                 -- Compare against the latest publish to answer
                                 -- "is this Player current" with no EAS lookup.
  is_embedded       boolean,     -- true = running the store bundle, no OTA taken
  seen_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_clients IS
  'One row per user recording which client build they last ran. Written on cold '
  'start by record_client_info(). Deliberately NOT on profiles (updated_at '
  'trigger) or user_devices (push_token NOT NULL excludes users who declined '
  'notifications). app_version, channel, update_id and update_created_at are '
  'SELF-REPORTED and not authoritative — diagnostic use only.';

ALTER TABLE public.user_clients ENABLE ROW LEVEL SECURITY;

-- Read own row. No INSERT or UPDATE policy exists by design: every write goes
-- through record_client_info().
--
-- Supabase default privileges grant ALL SEVEN verbs on a new public table to
-- BOTH anon AND authenticated. Verified on client_error_log. Without these
-- revokes, "every write goes through record_client_info()" rests on RLS alone.
-- The RPC is SECURITY DEFINER and runs as owner, so this costs it nothing.
REVOKE ALL ON public.user_clients FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.user_clients FROM authenticated;

-- Granted explicitly rather than relying on the default: RLS filters rows, but
-- the grant decides the verb. If Supabase ever narrows its default privileges,
-- the select-own policy below would silently become unreachable without this.
GRANT SELECT ON public.user_clients TO authenticated;

DROP POLICY IF EXISTS user_clients_select_own ON public.user_clients;
CREATE POLICY user_clients_select_own ON public.user_clients
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Super-admin read. There is NO is_super_admin() helper in this database; do not
-- go looking for one. Two variants exist in the wild and this is the current,
-- faster one — the uid call is wrapped so the RLS initplan caches it. Matches
-- week_readiness_super_admin_select and rank_freeze_snapshot_super_admin_select.
-- Do NOT copy cel_read, which uses a bare auth.uid().
DROP POLICY IF EXISTS user_clients_super_admin_select ON public.user_clients;
CREATE POLICY user_clients_super_admin_select ON public.user_clients
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.is_super_admin = true
    )
  );

-- =============================================================================
-- record_client_info() — the only writer.
-- Pattern copied from register_device_token (20260626211401): SECURITY DEFINER,
-- auth.uid() derived server-side, parameter whitelisted, search_path pinned,
-- PUBLIC and anon revoked, authenticated granted.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.record_client_info(
  p_app_version       text,
  p_os_platform       text,
  p_channel           text        DEFAULT NULL,
  p_update_id         text        DEFAULT NULL,
  p_update_created_at timestamptz DEFAULT NULL,
  p_is_embedded       boolean     DEFAULT NULL
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

  -- Whitelist the platform so the column stays queryable. Only this parameter
  -- is validated; the rest are self-reported and diagnostic (spec §4.3).
  IF p_os_platform NOT IN ('ios', 'android', 'web') THEN
    RAISE EXCEPTION 'invalid_platform: %', p_os_platform USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.user_clients
    (user_id, app_version, os_platform, channel, update_id,
     update_created_at, is_embedded, seen_at)
  VALUES
    (v_uid, p_app_version, p_os_platform, p_channel, p_update_id,
     p_update_created_at, p_is_embedded, now())
  ON CONFLICT (user_id) DO UPDATE
    SET app_version       = excluded.app_version,
        os_platform       = excluded.os_platform,
        channel           = excluded.channel,
        update_id         = excluded.update_id,
        update_created_at = excluded.update_created_at,
        is_embedded       = excluded.is_embedded,
        seen_at           = now();
END;
$function$;

REVOKE ALL ON FUNCTION public.record_client_info(text, text, text, text, timestamptz, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_client_info(text, text, text, text, timestamptz, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_client_info(text, text, text, text, timestamptz, boolean) TO authenticated;
