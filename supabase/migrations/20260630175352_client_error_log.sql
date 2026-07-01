-- =============================================================================
-- Migration: client_error_log — the "no silent failures" client error sink
-- Spec: 260629_HotPick_NoSilentFailures_Spec (register 1.4)
-- =============================================================================
-- One cross-cutting infra table (not per-sport/event — Hard Rule #1) that the
-- standalone logError() writer inserts into. Append-only, write-for-users,
-- read-for-super-admins. No DELETE/UPDATE policies — consistent with HotPick's
-- never-hard-delete posture.
--
-- RLS note: INSERT is granted to authenticated AND anon. Capturing pre-auth /
-- onboarding errors (register 1.5 — email-confirm onboarding failure) is a named
-- launch risk, and with Sentry removed there is no other path for them. The
-- cost is a minor write-only abuse surface on a low-value table; it is bounded
-- by: append-only (no UPDATE/DELETE), super-admin-only read, and the logError
-- client throttle/dedup. Reads are never anon.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.client_error_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  user_id       uuid REFERENCES public.profiles(id),  -- nullable: may predate auth
  error_message text NOT NULL,
  error_stack   text,                                  -- truncated client-side (~2000 chars)
  context       jsonb,                                 -- {screen, action, competition, ...}
  app_version   text,
  platform      text                                   -- 'ios' | 'android' | 'web'
);

COMMENT ON TABLE public.client_error_log IS
  'Client-side JS error log (No Silent Failures spec). Append-only; '
  'authenticated insert, super-admin read. Written by the standalone logError() '
  'helper — no Sentry dependency.';

-- Recent-first reads for the super-admin view.
CREATE INDEX IF NOT EXISTS client_error_log_created_at_idx
  ON public.client_error_log (created_at DESC);

ALTER TABLE public.client_error_log ENABLE ROW LEVEL SECURITY;

-- Write-only: any caller (incl. pre-auth/onboarding) may insert error rows.
DROP POLICY IF EXISTS cel_insert ON public.client_error_log;
CREATE POLICY cel_insert ON public.client_error_log
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

-- Read restricted to super-admins.
DROP POLICY IF EXISTS cel_read ON public.client_error_log;
CREATE POLICY cel_read ON public.client_error_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND COALESCE(p.is_super_admin, false)
    )
  );

-- No UPDATE / DELETE policies → append-only.

GRANT INSERT ON public.client_error_log TO authenticated, anon;
GRANT SELECT ON public.client_error_log TO authenticated;
