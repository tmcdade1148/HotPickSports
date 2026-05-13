-- =============================================================================
-- Migration: 260513_notification_read_state
-- Spec: 260513_HotPick_HomeRedesign_Spec.docx §4.3, §4.5
-- =============================================================================
-- Per-user-per-pool last_read_at marker for organizer_notifications.
-- Mirrors smack_read_state shape exactly so the same indicator-query pattern
-- works for both message channels.
--
-- Indicator semantics: a user has unread organizer notifications in a pool
-- when any organizer_notifications row exists with sent_at > the
-- corresponding notification_read_state.last_read_at for (user_id, pool_id).
-- Absence of a notification_read_state row means everything is unread.
--
-- Hard rules honored:
--   • Hard Rule #8 (RLS always on): RLS enabled at migration time.
--     Owner-only read/write policies per spec §4.5.
--
-- Roll back:
--   DROP TABLE IF EXISTS public.notification_read_state CASCADE;
-- =============================================================================

CREATE TABLE public.notification_read_state (
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pool_id       uuid NOT NULL REFERENCES public.pools(id)    ON DELETE CASCADE,
  last_read_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, pool_id)
);

COMMENT ON TABLE public.notification_read_state IS
  'Per-user-per-pool last_read_at for organizer_notifications. Drives the Pool Module activity indicator''s broadcast/moderator-note unread count. Mirrors smack_read_state shape.';

ALTER TABLE public.notification_read_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY nrs_select
  ON public.notification_read_state
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY nrs_insert
  ON public.notification_read_state
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY nrs_update
  ON public.notification_read_state
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE policy intentionally absent. Read-state rows are upserted, never deleted.
