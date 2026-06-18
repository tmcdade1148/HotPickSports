-- scaling_hygiene_fk_indexes_and_rls_initplan
--
-- Pre-launch scaling hygiene from the performance advisor (2026-06-18), after a
-- Micro-instance resource-exhaustion blip during tester sessions. These are
-- additive + reversible and matter at high concurrency; they do NOT replace the
-- real scaling levers (compute upgrade off Micro, Realtime capacity, load test)
-- tracked in docs/SCALING_LAUNCH_READINESS.md.
--
-- 1) Covering indexes for foreign keys flagged as unindexed on tables that get
--    hot under load (chat, notifications, membership). Partial WHERE col IS NOT
--    NULL on the sparse moderation/reply/inviter columns keeps them tiny and
--    cheap on writes (NULL rows don't reference a parent, so they need no index
--    entry for FK lookups / cascades).
-- 2) Memoize auth.uid() in two RLS policies (auth_rls_initplan) so it's
--    evaluated once per query instead of once per row. Semantically identical;
--    purely a performance fix. Low-traffic admin tables, but trivial to fix.

-- ── 1. FK covering indexes ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notification_read_state_pool_id
  ON public.notification_read_state (pool_id);

CREATE INDEX IF NOT EXISTS idx_organizer_notifications_organizer_id
  ON public.organizer_notifications (organizer_id);

CREATE INDEX IF NOT EXISTS idx_pool_members_invited_by
  ON public.pool_members (invited_by) WHERE invited_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_smack_messages_reply_to
  ON public.smack_messages (reply_to) WHERE reply_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_smack_messages_flagged_by
  ON public.smack_messages (flagged_by) WHERE flagged_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_smack_messages_moderated_by
  ON public.smack_messages (moderated_by) WHERE moderated_by IS NOT NULL;

-- ── 2. RLS auth.uid() memoization ─────────────────────────────────────────────
ALTER POLICY comp_codes_admin_all ON public.comp_codes
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.is_super_admin))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.is_super_admin));

ALTER POLICY week_readiness_super_admin_select ON public.week_readiness
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.is_super_admin = true));
