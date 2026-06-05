-- Weekly Engine §4c — week_readiness table (260605_HotPick_WeeklyEngine_Spec v1.0).
--
-- One row per competition per week. Written by the prep steps (nfl-import-schedule,
-- nfl-fetch-odds, nfl-rank-games) on completion; read by the admin readiness screen.
-- The open-picks gate (§5c) requires all three checks green before picks can open.
--
-- RLS: super-admin SELECT only. No client write policies — only Edge Functions
-- (service role) write, which bypasses RLS.
CREATE TABLE IF NOT EXISTS public.week_readiness (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition   text NOT NULL,
  week_number   int  NOT NULL,
  -- per-step status: pending | ok | failed
  games_status     text NOT NULL DEFAULT 'pending',
  games_count      int,
  games_at         timestamptz,
  odds_status      text NOT NULL DEFAULT 'pending',
  odds_count       int,
  odds_expected    int,
  odds_at          timestamptz,
  odds_error       text,
  ranks_status     text NOT NULL DEFAULT 'pending',
  ranks_count      int,
  ranks_at         timestamptz,
  ranks_error      text,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competition, week_number)
);

ALTER TABLE public.week_readiness ENABLE ROW LEVEL SECURITY;

-- Super-admin read only.
DROP POLICY IF EXISTS week_readiness_super_admin_select ON public.week_readiness;
CREATE POLICY week_readiness_super_admin_select ON public.week_readiness
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.is_super_admin = true
  ));
