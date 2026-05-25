-- =============================================================================
-- Migration: 260513_partner_perks
-- Spec: 260513_HotPick_HomeRedesign_Spec.docx §4.1
-- =============================================================================
-- Adds three perk-related columns to the existing `partners` table.
--
-- Hard rules honored:
--   • Hard Rule #23 (partner brand config copied to pool at creation):
--     unchanged — these new columns are partner-managed and read live by the
--     Partner Module / Partner Roster screens, never copied to pools.
--   • Hard Rule #8 (RLS always on): partners already has RLS; no change here.
--
-- Roll forward: this migration is purely additive.
-- Roll back:    ALTER TABLE public.partners
--                 DROP CONSTRAINT IF EXISTS partners_perk_text_len,
--                 DROP COLUMN IF EXISTS perk_text,
--                 DROP COLUMN IF EXISTS perk_icon,
--                 DROP COLUMN IF EXISTS perk_updated_at;
--               DROP FUNCTION IF EXISTS public.partners_touch_perk_updated_at();
-- =============================================================================

ALTER TABLE public.partners
  ADD COLUMN perk_text       text,
  ADD COLUMN perk_icon       text,
  ADD COLUMN perk_updated_at timestamptz;

COMMENT ON COLUMN public.partners.perk_text IS
  'Partner-provided participation perk copy, e.g. "$1 off any draft, Sundays." Max 120 chars. Partner-managed, never authored by HotPick.';
COMMENT ON COLUMN public.partners.perk_icon IS
  'Partner-selected icon identifier (lucide-react name or single emoji). Nullable. Defaults to gift icon at render if null.';
COMMENT ON COLUMN public.partners.perk_updated_at IS
  'Set by trigger on any perk_text/perk_icon update. Drives the last-updated display on Partner Roster.';

-- 120-char cap per spec §4.1.
ALTER TABLE public.partners
  ADD CONSTRAINT partners_perk_text_len
  CHECK (perk_text IS NULL OR char_length(perk_text) <= 120);

-- Auto-stamp perk_updated_at whenever perk_text or perk_icon changes.
-- Spec says "Set by trigger or service" — trigger is safer because it can't
-- be forgotten by an admin path that updates perk fields directly.
CREATE OR REPLACE FUNCTION public.partners_touch_perk_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW.perk_text   IS DISTINCT FROM OLD.perk_text)
  OR (NEW.perk_icon   IS DISTINCT FROM OLD.perk_icon) THEN
    NEW.perk_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_partners_touch_perk_updated_at ON public.partners;
CREATE TRIGGER trg_partners_touch_perk_updated_at
  BEFORE UPDATE ON public.partners
  FOR EACH ROW
  EXECUTE FUNCTION public.partners_touch_perk_updated_at();
