-- pool_events_member_export_event
-- Extend the pool_events.event_type CHECK constraint with the new value
-- emitted by export_pool_members. Without this, the RPC's audit INSERT
-- would fail and break the export.

ALTER TABLE public.pool_events DROP CONSTRAINT IF EXISTS valid_event_type;

ALTER TABLE public.pool_events
  ADD CONSTRAINT valid_event_type CHECK (
    event_type = ANY (ARRAY[
      'MEMBER_JOINED',
      'MEMBER_LEFT',
      'MEMBER_REMOVED',
      'MEMBER_EXPORT_REQUESTED',
      'PICK_SUBMITTED',
      'PICKS_COMPLETE',
      'HOTPICK_DESIGNATED',
      'SCORE_UPDATED',
      'STREAK_ACHIEVED',
      'MILESTONE_REACHED',
      'LEADERBOARD_CHANGE',
      'SMACKTALK_SENT',
      'SMACKTALK_FLAGGED',
      'SMACKTALK_REMOVED',
      'ORGANIZER_BROADCAST',
      'ORGANIZER_NUDGE',
      'POOL_CREATED',
      'POOL_ARCHIVED',
      'ROUND_OPENED',
      'ROUND_CLOSED',
      'ROUND_SCORED'
    ])
  );
