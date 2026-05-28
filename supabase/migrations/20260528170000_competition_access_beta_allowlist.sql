-- competition_access — per-competition visibility control.
-- Lets us hide nfl_2025_sim from the public App Store build while
-- keeping it visible to beta testers so we can dogfood against real
-- sim data without leaking the experience to every user.
--
-- Default behavior (when a competition has no row here) is PUBLIC,
-- so existing competitions keep working exactly as they did.

CREATE TABLE IF NOT EXISTS public.competition_access (
  competition    text PRIMARY KEY,
  is_public      boolean NOT NULL DEFAULT true,
  beta_user_ids  uuid[]  NOT NULL DEFAULT '{}'::uuid[],
  notes          text,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid REFERENCES auth.users(id)
);

ALTER TABLE public.competition_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS competition_access_select ON public.competition_access;
CREATE POLICY competition_access_select ON public.competition_access
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS competition_access_write ON public.competition_access;
CREATE POLICY competition_access_write ON public.competition_access
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true));

CREATE OR REPLACE FUNCTION public.user_can_see_competition(p_competition text, p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN p_user IS NULL THEN false
      WHEN p_competition = 'global' THEN true
      WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user AND is_super_admin = true) THEN true
      WHEN EXISTS (
        SELECT 1 FROM public.competition_access ca
        WHERE ca.competition = p_competition
          AND (ca.is_public OR p_user = ANY(ca.beta_user_ids))
      ) THEN true
      WHEN NOT EXISTS (SELECT 1 FROM public.competition_access WHERE competition = p_competition) THEN true
      ELSE false
    END;
$$;

GRANT EXECUTE ON FUNCTION public.user_can_see_competition(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_visible_competitions()
RETURNS TABLE (competition text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH all_known AS (
    SELECT competition FROM public.competition_access
    UNION
    SELECT DISTINCT competition FROM public.competition_config WHERE competition <> 'global'
  )
  SELECT competition
  FROM all_known
  WHERE public.user_can_see_competition(competition, auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.get_visible_competitions() TO authenticated;

DROP POLICY IF EXISTS pools_select ON public.pools;
CREATE POLICY pools_select ON public.pools
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.user_can_see_competition(competition, auth.uid())
    AND (
      is_global = true
      OR id IN (
        SELECT pool_id FROM public.pool_members
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

-- Seed: nfl_2025_sim is beta-only. Three known super-admins listed.
INSERT INTO public.competition_access (competition, is_public, beta_user_ids, notes)
VALUES (
  'nfl_2025_sim',
  false,
  ARRAY[
    '7b4f41c8-008d-4319-98e7-8c80ec6edf69'::uuid,  -- tpmcdade@yahoo.com
    '82564db0-417d-4af6-8613-3f0d3e2983e8'::uuid,  -- thomas@honeyandpunch.com
    'ab5003d7-2211-4788-bfee-d6f7ec5a364b'::uuid   -- admin@hotpicksports.com
  ]::uuid[],
  'Sim competition for beta testing with real data. Hidden from the public app. Add tester user_ids to beta_user_ids to grant access.'
)
ON CONFLICT (competition) DO NOTHING;
