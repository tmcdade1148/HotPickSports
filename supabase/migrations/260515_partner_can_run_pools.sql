-- =============================================================================
-- Migration: 260515_partner_can_run_pools
-- =============================================================================
-- Adds `can_run_pools` flag to partners. Distinguishes two partner classes:
--   • can_run_pools = true   → Partner can create AND join pools as a partner.
--                              The partner appears as an option when an
--                              organizer is selecting a "presenting partner"
--                              for a new pool, and partner-staff accounts can
--                              be added as pool members in that partner role.
--   • can_run_pools = false  → Partner is sponsor-only. Their brand can still
--                              be referenced (perk, broadcasts, roster page)
--                              but they cannot create or join pools as a
--                              partner. This is the safer default.
--
-- Hard rules honored:
--   • Hard Rule #23 (partner brand config copied to pool at creation):
--     unchanged — this column lives only on partners, never copied to pools.
--   • Hard Rule #15 (pool join/creation enforcement runs server-side):
--     the create-pool and join-pool Edge Functions will gate on this
--     column. Client filtering is for UX only; server is authoritative.
--   • Hard Rule #8 (RLS always on): no RLS change here; existing partner
--     policies still apply.
--
-- Roll forward: purely additive. Existing partners default to `false` (the
--               more restrictive class). Flip individual partners to true
--               from the Partner Admin screen as they qualify.
-- Roll back:    ALTER TABLE public.partners DROP COLUMN IF EXISTS can_run_pools;
-- =============================================================================

ALTER TABLE public.partners
  ADD COLUMN can_run_pools boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.partners.can_run_pools IS
  'When true, this partner can be selected as the presenting partner of new pools and partner-staff can join pools in the partner role. When false (default), the partner is sponsor-only — brand may appear via perks / broadcasts / roster but the partner cannot run pools.';

-- ---------------------------------------------------------------------------
-- Server-side enforcement (Hard Rule #15: server is authoritative).
-- Any INSERT/UPDATE of pools.partner_id is blocked when the referenced
-- partner has can_run_pools = false. The client guard in PartnerAdminScreen
-- handleAssignToPool is a UX shortcut; this trigger is the real lock.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pools_enforce_partner_can_run_pools()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_can_run boolean;
BEGIN
  -- partner_id cleared → always allowed.
  IF NEW.partner_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- No-op on UPDATE if partner_id is unchanged (avoid extra lookups).
  IF TG_OP = 'UPDATE' AND OLD.partner_id IS NOT DISTINCT FROM NEW.partner_id THEN
    RETURN NEW;
  END IF;

  SELECT can_run_pools
    INTO v_can_run
    FROM public.partners
   WHERE id = NEW.partner_id;

  IF v_can_run IS NULL THEN
    RAISE EXCEPTION 'Partner % not found', NEW.partner_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_can_run = false THEN
    RAISE EXCEPTION
      'Partner % is sponsor-only (can_run_pools = false) and cannot be assigned to a pool',
      NEW.partner_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pools_enforce_partner_can_run_pools ON public.pools;
CREATE TRIGGER pools_enforce_partner_can_run_pools
  BEFORE INSERT OR UPDATE OF partner_id ON public.pools
  FOR EACH ROW
  EXECUTE FUNCTION public.pools_enforce_partner_can_run_pools();

COMMENT ON FUNCTION public.pools_enforce_partner_can_run_pools() IS
  'Guards pools.partner_id writes: rejects assignment of a partner whose can_run_pools flag is false. Hard Rule #15 — server enforcement, independent of client checks.';
