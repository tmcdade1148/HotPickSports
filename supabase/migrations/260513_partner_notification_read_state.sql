-- =============================================================================
-- Migration: 260513_partner_notification_read_state
-- Spec: 260513_HotPick_HomeRedesign_Spec.docx §4.4, §4.5
-- =============================================================================
-- Per-user-per-partner last_read_at marker for partner_notifications.
-- Mirrors notification_read_state shape exactly so the indicator-query pattern
-- stays consistent across the three message channels (smack, organizer, partner).
--
-- Indicator semantics: a user has unread partner notifications when any
-- partner_notifications row exists with sent_at > the corresponding
-- partner_notification_read_state.last_read_at AND the user is a member of
-- any aligned pool (eligibility checked at query time, not enforced by FK
-- because membership is dynamic).
--
-- Write triggers: PartnerRosterScreen sets last_read_at = now() on screen
-- entry, which clears the Partner Module activity indicator on Home.
--
-- Hard rules honored:
--   • Hard Rule #8 (RLS always on): RLS enabled at migration time.
--     Owner-only read/write policies per spec §4.5.
--
-- Roll back:
--   DROP TABLE IF EXISTS public.partner_notification_read_state CASCADE;
-- =============================================================================

CREATE TABLE public.partner_notification_read_state (
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  partner_id    uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  last_read_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, partner_id)
);

COMMENT ON TABLE public.partner_notification_read_state IS
  'Per-user-per-partner last_read_at for partner_notifications. Cleared by PartnerRosterScreen visit, which drops the Partner Module activity indicator on Home.';

ALTER TABLE public.partner_notification_read_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY pnrs_select
  ON public.partner_notification_read_state
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY pnrs_insert
  ON public.partner_notification_read_state
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY pnrs_update
  ON public.partner_notification_read_state
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE policy intentionally absent. Read-state rows are upserted, never deleted.
