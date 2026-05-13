-- =============================================================================
-- Migration: 260513_partner_notifications
-- Spec: 260513_HotPick_HomeRedesign_Spec.docx §4.2, §4.5
-- =============================================================================
-- Creates the partner_notifications table. Parallels organizer_notifications
-- but scoped to partner_id rather than pool_id, because partner broadcasts go
-- to all members of all aligned pools in a single operation. Recipient
-- resolution happens server-side in the send-partner-broadcast Edge Function
-- (spec §5.1).
--
-- Hard rules honored:
--   • Hard Rule #8 (RLS always on): RLS enabled at migration time with the
--     spec §4.5 SELECT policy. Writes are blocked from the anon role — they
--     can only happen via service role inside the send-partner-broadcast
--     Edge Function.
--   • Hard Rule #11 (pool_events.event_type enum): no event_type writes here.
--
-- Roll back:
--   DROP TABLE IF EXISTS public.partner_notifications CASCADE;
-- =============================================================================

CREATE TABLE public.partner_notifications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id        uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  sent_by           uuid NOT NULL REFERENCES public.profiles(id),
  notification_type text NOT NULL DEFAULT 'broadcast'
                       CHECK (notification_type IN ('broadcast', 'perk_changed')),
  message           text,
  recipient_count   int  NOT NULL DEFAULT 0,
  sent_at           timestamptz NOT NULL DEFAULT now(),
  push_delivered    int  DEFAULT 0,
  push_failed       int  DEFAULT 0
);

COMMENT ON TABLE public.partner_notifications IS
  'Partner broadcasts to all members of all aligned pools. Written only by send-partner-broadcast Edge Function under service role. Read by users whose aligned pools belong to the partner.';

CREATE INDEX idx_partner_notifications_partner_sent
  ON public.partner_notifications (partner_id, sent_at DESC);

ALTER TABLE public.partner_notifications ENABLE ROW LEVEL SECURITY;

-- Users see broadcasts from partners aligned with any active pool they belong to.
CREATE POLICY partner_notifications_select
  ON public.partner_notifications
  FOR SELECT
  TO authenticated
  USING (
    partner_id IN (
      SELECT p.partner_id
      FROM   public.pools p
      JOIN   public.pool_members pm ON pm.pool_id = p.id
      WHERE  pm.user_id     = auth.uid()
        AND  pm.status      = 'active'
        AND  p.partner_id   IS NOT NULL
    )
  );

-- INSERT / UPDATE / DELETE policies are intentionally absent.
-- Writes only happen via the send-partner-broadcast Edge Function running
-- under service role, which bypasses RLS by design.
