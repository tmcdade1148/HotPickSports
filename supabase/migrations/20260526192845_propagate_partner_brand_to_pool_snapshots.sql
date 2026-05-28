-- propagate_partner_brand_to_pool_snapshots
--
-- When a partner's brand_config changes (rename, logo swap, color
-- change), copy the new brand_config into every pool snapshot that
-- references that partner so the Affiliated / Official Contest cards
-- stay in sync with what the partner's admin sees in YOUR CLUBS.
--
-- Hard Rule #23 ("pool rendering never depends on a live join to
-- partners") stays intact at the read path — pools still own a
-- self-contained brand_config snapshot. We just keep that snapshot
-- fresh when the partner edits their identity.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.propagate_partner_brand_to_snapshots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only propagate when brand_config actually changed. Name edits
  -- on the client also rewrite brand_config.partner_name + app_name
  -- + pool_label inside the JSON, so this single distinct-check
  -- covers rename + logo + color edits.
  IF NEW.brand_config IS DISTINCT FROM OLD.brand_config THEN
    -- Pools: legacy single-Club roster member + Official Contest.
    UPDATE public.pools
       SET brand_config = NEW.brand_config
     WHERE partner_id     = NEW.id
        OR owning_club_id = NEW.id;

    -- Multi-Club affiliations join.
    UPDATE public.pool_partner_affiliations
       SET brand_config_snapshot = NEW.brand_config
     WHERE partner_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS partners_propagate_brand ON public.partners;
CREATE TRIGGER partners_propagate_brand
  AFTER UPDATE ON public.partners
  FOR EACH ROW
  EXECUTE FUNCTION public.propagate_partner_brand_to_snapshots();

-- ---------------------------------------------------------------------------
-- One-time backfill: sync every pool + affiliation snapshot to its
-- current partner's brand_config. Fixes any drift accumulated before
-- the trigger existed.
-- ---------------------------------------------------------------------------

UPDATE public.pools p
   SET brand_config = pt.brand_config
  FROM public.partners pt
 WHERE (p.partner_id = pt.id OR p.owning_club_id = pt.id)
   AND p.brand_config IS DISTINCT FROM pt.brand_config;

UPDATE public.pool_partner_affiliations a
   SET brand_config_snapshot = pt.brand_config
  FROM public.partners pt
 WHERE a.partner_id = pt.id
   AND a.brand_config_snapshot IS DISTINCT FROM pt.brand_config;
