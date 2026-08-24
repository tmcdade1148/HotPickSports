-- Push delivery: make `sent` mean ARRIVED, not "the POST returned 200".
--
-- Background (2026-08-24). process-notification-queue marked every row
-- `sent` unconditionally after fetch() — response.ok was never checked and
-- Expo's receipts were never fetched. 178 rows have read `sent` since
-- 2026-07-15 with zero error_message rows, including 112 failed ESPN alerts
-- to one user that looked like successes for 18 days.
--
-- Expo delivery is TWO steps, and only the second one carries the truth:
--   1. POST /push/send  -> a TICKET. Means "Expo accepted the handoff".
--      A ticket is returned as ok for a token whose app has been deleted.
--   2. POST /push/getReceipts -> a RECEIPT, available a few seconds later.
--      This is where DeviceNotRegistered and the provider-side rejections
--      actually surface.
--
-- So the row now moves pending -> awaiting_receipt -> sent|failed, and
-- `sent` is written ONLY from an ok receipt.
--
-- Honest limit, deliberately recorded here so nobody re-learns it the hard
-- way: an ok RECEIPT means APNs/FCM accepted the message, not that iOS drew
-- a banner. Apple reports a dead token through its feedback channel, which
-- Expo folds into LATER receipts as DeviceNotRegistered — that is the signal
-- this migration exists to capture, and it is a large improvement over a
-- ticket, but it is still not literal proof of display.

-- Ticket id + the token it was for, one entry per device:
--   [{"id": "01a03578-...", "token": "ExponentPushToken[...]"}]
-- The token must travel WITH the id: the receipt pass needs to know which
-- device to deactivate when a receipt comes back DeviceNotRegistered, and by
-- then the user's device list may have changed.
ALTER TABLE public.notification_queue
  ADD COLUMN IF NOT EXISTS expo_tickets jsonb,
  ADD COLUMN IF NOT EXISTS receipt_checked_at timestamptz;

COMMENT ON COLUMN public.notification_queue.expo_tickets IS
  'Expo push tickets from /push/send: [{"id","token"}]. Input to the receipt pass. A ticket is NOT proof of delivery.';
COMMENT ON COLUMN public.notification_queue.receipt_checked_at IS
  'Last time the receipt pass asked Expo about this row''s tickets.';
COMMENT ON COLUMN public.notification_queue.sent_at IS
  'When delivery was CONFIRMED by an Expo receipt (status=sent), or when the row was skipped/failed. Never set from a ticket alone.';
COMMENT ON COLUMN public.notification_queue.status IS
  'pending -> awaiting_receipt -> sent|failed, or skipped. sent means an Expo RECEIPT came back ok, never that the POST returned 200.';

-- Extend the status vocabulary. Verified 2026-08-24 that no other reader
-- depends on it: the broadcast/ops Edge Functions only INSERT (defaulting to
-- pending), the client never reads this table, and cron job 70 (the old
-- notification-based alerting) is disabled.
ALTER TABLE public.notification_queue
  DROP CONSTRAINT IF EXISTS notification_queue_status_check;
ALTER TABLE public.notification_queue
  ADD CONSTRAINT notification_queue_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'awaiting_receipt'::text,
    'sent'::text,
    'failed'::text,
    'skipped'::text
  ]));

-- The receipt pass's working set. Partial index: awaiting_receipt is a
-- transient state holding a handful of rows, never the 178-row history.
CREATE INDEX IF NOT EXISTS notification_queue_awaiting_receipt_idx
  ON public.notification_queue (last_attempted_at)
  WHERE status = 'awaiting_receipt';

-- The send pass's working set, oldest first.
CREATE INDEX IF NOT EXISTS notification_queue_pending_idx
  ON public.notification_queue (created_at)
  WHERE status = 'pending';

-- The 178 pre-existing `sent` rows are deliberately NOT rewritten.
--
-- They were marked by code that never checked response.ok and never read a
-- receipt, so their delivery is UNVERIFIED — which is not the same claim as
-- "they failed", and this migration does not know which. Relabelling them
-- would assert more than the evidence supports, and a bulk status rewrite of
-- production rows is exactly the kind of destructive admin action Hard Rule
-- #17 governs.
--
-- No rewrite is needed anyway: `expo_tickets IS NULL` cleanly separates the
-- old regime from the new one, so any delivery-rate measurement scopes to
--   WHERE expo_tickets IS NOT NULL
-- and the legacy rows simply fall outside it.
