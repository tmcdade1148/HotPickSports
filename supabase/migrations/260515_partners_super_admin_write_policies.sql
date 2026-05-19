-- =============================================================================
-- Migration: 260515_partners_super_admin_write_policies
-- =============================================================================
-- The public.partners table had RLS enabled with only a SELECT policy.
-- Updates from PartnerAdminScreen silently no-op'd (0 rows matched, no error).
-- This caused the can_run_pools switch — and presumably any other partner
-- edit — to appear to save while actually persisting nothing.
--
-- Fix: add INSERT/UPDATE/DELETE policies that gate on profiles.is_super_admin,
-- matching the existing pattern used by simulation_log policies. The Partner
-- Admin screen is super_admin-only per REFERENCE.md §584, so this aligns RLS
-- with the screen's own access gate.
--
-- Hard rules honored:
--   • Hard Rule #8 (RLS always on): unchanged — RLS stays on, we just add
--     write policies so the privileged client can write.
--   • Hard Rule #15 (server-side enforcement): the is_super_admin check
--     happens in the DB, not on the client. The mobile app's "is super
--     admin" UI gate is UX — the DB is authoritative.
-- =============================================================================

CREATE POLICY partners_super_admin_insert ON public.partners
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = auth.uid() AND is_super_admin = true
    )
  );

CREATE POLICY partners_super_admin_update ON public.partners
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = auth.uid() AND is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = auth.uid() AND is_super_admin = true
    )
  );

CREATE POLICY partners_super_admin_delete ON public.partners
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = auth.uid() AND is_super_admin = true
    )
  );
