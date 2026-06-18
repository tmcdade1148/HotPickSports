-- =============================================================================
-- Migration: widen partner_notifications SELECT RLS to cover affiliations
-- =============================================================================
-- The original policy (260513_partner_notifications.sql) only let a user read a
-- partner's broadcasts when one of their active pools was aligned via the legacy
-- `pools.partner_id` column. But send-partner-broadcast resolves recipients from
-- BOTH that legacy column AND `pool_partner_affiliations` — so an affiliation-only
-- member received the push but could not read the broadcast in the Message Center
-- (the new partner-inbox query is RLS-gated).
--
-- This matters now that the Club-Pool organizer_notifications mirror has been
-- dropped (same change set): the mirror used to be the inbox fallback for
-- Club-Pool members. Without widening this policy, affiliation-only members would
-- lose all inbox visibility of Club broadcasts.
--
-- Fix: UNION the legacy path with the affiliations path. Recipient-resolution
-- parity with the Edge Function. Read-only widening — no INSERT/UPDATE/DELETE
-- policies are added (writes remain service-role-only).
--
-- Roll back: re-create the original single-path policy from
-- 260513_partner_notifications.sql.
-- =============================================================================

DROP POLICY IF EXISTS partner_notifications_select ON public.partner_notifications;

CREATE POLICY partner_notifications_select
  ON public.partner_notifications
  FOR SELECT
  TO authenticated
  USING (
    partner_id IN (
      -- Legacy single-partner column on pools.
      SELECT p.partner_id
      FROM   public.pools p
      JOIN   public.pool_members pm ON pm.pool_id = p.id
      WHERE  pm.user_id   = auth.uid()
        AND  pm.status    = 'active'
        AND  p.partner_id IS NOT NULL
      UNION
      -- Multi-affiliate path (pool_partner_affiliations).
      SELECT ppa.partner_id
      FROM   public.pool_partner_affiliations ppa
      JOIN   public.pool_members pm ON pm.pool_id = ppa.pool_id
      WHERE  pm.user_id = auth.uid()
        AND  pm.status  = 'active'
    )
  );
