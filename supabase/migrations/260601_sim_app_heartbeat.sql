-- Sandbox-only telemetry: the app writes here after it finishes ingesting a
-- config step on nfl_2025_sim, so the season simulator (tools/season-simulator-v4.html)
-- can wait for the app to catch up before advancing (instead of a blind fixed
-- timer). Gated to the sandbox competition; never used by live competitions.
CREATE TABLE IF NOT EXISTS public.sim_app_heartbeat (
  competition text PRIMARY KEY,
  client_id   text,
  last_token  bigint NOT NULL DEFAULT 0,
  observed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sim_app_heartbeat ENABLE ROW LEVEL SECURITY;

-- Authenticated users may read + upsert ONLY the sandbox competition's row.
-- The simulator itself reads via the service role (bypasses RLS); these
-- policies exist so the client app can write its heartbeat.
DROP POLICY IF EXISTS sim_hb_select ON public.sim_app_heartbeat;
CREATE POLICY sim_hb_select ON public.sim_app_heartbeat
  FOR SELECT TO authenticated USING (competition = 'nfl_2025_sim');

DROP POLICY IF EXISTS sim_hb_insert ON public.sim_app_heartbeat;
CREATE POLICY sim_hb_insert ON public.sim_app_heartbeat
  FOR INSERT TO authenticated WITH CHECK (competition = 'nfl_2025_sim');

DROP POLICY IF EXISTS sim_hb_update ON public.sim_app_heartbeat;
CREATE POLICY sim_hb_update ON public.sim_app_heartbeat
  FOR UPDATE TO authenticated USING (competition = 'nfl_2025_sim')
  WITH CHECK (competition = 'nfl_2025_sim');

-- Step token the simulator bumps after each checkpoint; the app echoes the
-- value it has ingested back into sim_app_heartbeat.last_token.
INSERT INTO public.competition_config (competition, key, value, description)
VALUES ('nfl_2025_sim', 'sim_step_token', '0'::jsonb,
  'Sandbox season-simulator step token. Bumped by the simulator after each checkpoint; the app echoes the value it has ingested into sim_app_heartbeat so the simulator can wait for the app to catch up. Sandbox-only.')
ON CONFLICT (competition, key) DO NOTHING;
