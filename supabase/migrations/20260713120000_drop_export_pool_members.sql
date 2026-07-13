-- drop_export_pool_members
--
-- Locked legal-posture decision (June 23 Money Posture spec, ratified in
-- CLAUDE.md Hard Rule #26): no member-data export may exist anywhere in the
-- app, product-wide. This removes the RPC that backed the Gaffer members-page
-- CSV export. The client affordance is removed in the same change set
-- (src/shell/screens/PoolMembersScreen.tsx).
--
-- NOT touched: the individual "your own data" request path (Privacy Policy
-- §8.4, human-mediated via privacy@hotpicksports.com) — a separate legal
-- right, never implemented as an in-app export.
--
-- The pool_events 'MEMBER_EXPORT_REQUESTED' event_type is intentionally LEFT
-- in the valid_event_type CHECK constraint: historical audit rows written by
-- past exports must remain valid and traceable. No new rows will be written
-- once this function is gone. Removing the enum value would fail validation
-- against those existing rows and destroy the audit trail, so it stays.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.export_pool_members(uuid);
