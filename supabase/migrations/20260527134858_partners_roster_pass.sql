-- partners_roster_pass
--
-- Adds a "Roster Pass" to partners — a distinct-from-pool-invite-code
-- identifier a Club admin shares with a Gaffer to authorize affiliation.
--
-- Distinct from pools.invite_code in three ways:
--   1. 8 chars (vs 6) — visually different at a glance.
--   2. Displayed as XXXX-XXXX in UI — different shape from pool codes.
--   3. Different label ("Roster Pass") — different vocabulary.
--
-- 32^8 ≈ 1.1 trillion combinations.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_roster_pass()
RETURNS text
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_alphabet CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_pass TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..8 LOOP
    v_pass := v_pass || substr(v_alphabet, 1 + floor(random() * 32)::int, 1);
  END LOOP;
  RETURN v_pass;
END;
$$;

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS roster_pass text;

DO $$
DECLARE
  v_row RECORD;
  v_pass TEXT;
BEGIN
  FOR v_row IN
    SELECT id FROM public.partners WHERE roster_pass IS NULL
  LOOP
    LOOP
      v_pass := public.generate_roster_pass();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.partners WHERE roster_pass = v_pass);
    END LOOP;
    UPDATE public.partners SET roster_pass = v_pass WHERE id = v_row.id;
  END LOOP;
END $$;

ALTER TABLE public.partners
  ALTER COLUMN roster_pass SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS partners_roster_pass_key
  ON public.partners (roster_pass);

CREATE OR REPLACE FUNCTION public.partners_set_roster_pass()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_pass TEXT;
BEGIN
  IF NEW.roster_pass IS NULL OR NEW.roster_pass = '' THEN
    LOOP
      v_pass := public.generate_roster_pass();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.partners WHERE roster_pass = v_pass);
    END LOOP;
    NEW.roster_pass := v_pass;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS partners_set_roster_pass ON public.partners;
CREATE TRIGGER partners_set_roster_pass
  BEFORE INSERT ON public.partners
  FOR EACH ROW
  EXECUTE FUNCTION public.partners_set_roster_pass();

CREATE OR REPLACE FUNCTION public.resolve_roster_pass(p_pass text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized TEXT;
  v_partner    public.partners%ROWTYPE;
BEGIN
  IF p_pass IS NULL OR LENGTH(TRIM(p_pass)) = 0 THEN
    RETURN jsonb_build_object('error', 'EMPTY_PASS');
  END IF;

  v_normalized := upper(regexp_replace(p_pass, '[^A-Za-z0-9]', '', 'g'));

  IF LENGTH(v_normalized) <> 8 THEN
    RETURN jsonb_build_object('error', 'INVALID_LENGTH');
  END IF;

  SELECT * INTO v_partner
    FROM public.partners
   WHERE roster_pass = v_normalized
     AND is_active = true;

  IF v_partner.id IS NULL THEN
    RETURN jsonb_build_object('error', 'INVALID_PASS');
  END IF;

  RETURN jsonb_build_object(
    'partner_id',   v_partner.id,
    'partner_name', v_partner.name,
    'slug',         v_partner.slug,
    'brand_config', v_partner.brand_config
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_roster_pass(text) TO authenticated;
