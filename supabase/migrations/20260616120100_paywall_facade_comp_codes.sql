-- Organizer Paywall Facade (v1.1) — Part 2/3: comp_codes + redeem_comp_code
-- Spec: docs/ORGANIZER_PAYWALL_FACADE_SPEC.md §4b, §5b
--
-- comp_codes is COHORT TRACKING ONLY. It does NOT gate the cap. The universal
-- founding_season_active flag is what passes organizers through. Redemption marks
-- cohort membership and triggers the onboarding welcome moment — nothing more.
--
-- Verified ABSENT in production before writing (2026-06-16): public.comp_codes,
-- public.redeem_comp_code. is_super_admin is a boolean column on profiles.

CREATE TABLE IF NOT EXISTS public.comp_codes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text NOT NULL UNIQUE,
  label        text,                                   -- e.g. 'Founding Gaffer - Dave'
  competition  text NOT NULL DEFAULT 'nfl_2026',
  redeemed_by  uuid REFERENCES public.profiles(id),
  redeemed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.comp_codes ENABLE ROW LEVEL SECURITY;

-- Super-admins manage codes; no direct client writes. Redemption happens through
-- the SECURITY DEFINER RPC below (which runs as owner), never a direct UPDATE.
DROP POLICY IF EXISTS comp_codes_admin_all ON public.comp_codes;
CREATE POLICY comp_codes_admin_all ON public.comp_codes
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin));

-- ── redeem_comp_code — single-use redemption at onboarding ────────────────────
-- Race-safe: the conditional UPDATE ... RETURNING is the sole authority. Two
-- concurrent calls cannot both succeed — the second matches zero rows. We only
-- run a follow-up SELECT (to distinguish INVALID vs ALREADY_REDEEMED) when the
-- UPDATE returns nothing. Redemption changes NO cap and writes NO subscription.
CREATE OR REPLACE FUNCTION public.redeem_comp_code(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id   uuid := auth.uid();
  v_norm      text := upper(trim(coalesce(p_code, '')));
  v_label     text;
  v_exists    boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'NOT_AUTHENTICATED');
  END IF;
  IF v_norm = '' THEN
    RETURN jsonb_build_object('error', 'INVALID_CODE');
  END IF;

  UPDATE public.comp_codes
     SET redeemed_by = v_user_id, redeemed_at = now()
   WHERE code = v_norm AND redeemed_by IS NULL
   RETURNING label INTO v_label;

  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'label', v_label);
  END IF;

  -- No row updated: either the code doesn't exist or it's already taken.
  SELECT true INTO v_exists FROM public.comp_codes WHERE code = v_norm;
  IF v_exists THEN
    RETURN jsonb_build_object('error', 'ALREADY_REDEEMED');
  ELSE
    RETURN jsonb_build_object('error', 'INVALID_CODE');
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.redeem_comp_code(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.redeem_comp_code(text) TO authenticated, service_role;
