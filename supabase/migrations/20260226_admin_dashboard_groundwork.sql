-- =============================================================================
-- Admin Dashboard Groundwork — HotPick Sports
-- Migration: 20260226
--
-- Adds organizer admin infrastructure:
--   1. Column additions to pools table
--   2. pool_events — event log for pool intelligence
--   3. member_engagement — per-member activity snapshots
--   4. organizer_notifications — broadcast/nudge history
--   5. pool_pulse — pool intelligence digest
--   6. check_notification_rate_limit() — rate limiting function
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend pools table with organizer and admin columns
-- ---------------------------------------------------------------------------

ALTER TABLE pools
ADD COLUMN IF NOT EXISTS organizer_id UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS brand_config JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS member_approval_required BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS max_members INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;

-- Backfill: set organizer_id to created_by for existing pools
UPDATE pools SET organizer_id = created_by WHERE organizer_id IS NULL;

-- Index for organizer's active pools
CREATE INDEX IF NOT EXISTS idx_pools_organizer
    ON pools(organizer_id)
    WHERE is_archived = false;

-- Index for pools with custom branding (future query optimization)
CREATE INDEX IF NOT EXISTS idx_pools_has_brand
    ON pools((brand_config IS NOT NULL))
    WHERE brand_config IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. pool_events — foundation of all intelligence and analytics
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pool_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Context
    pool_id UUID NOT NULL REFERENCES pools(id),
    competition TEXT NOT NULL,
    user_id UUID REFERENCES profiles(id),  -- NULL for system events

    -- Event classification
    event_type TEXT NOT NULL,

    -- Payload — flexible, event-specific data
    metadata JSONB NOT NULL DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Ensure only valid event types
    CONSTRAINT valid_event_type CHECK (
        event_type IN (
            'MEMBER_JOINED', 'MEMBER_LEFT', 'MEMBER_REMOVED',
            'PICK_SUBMITTED', 'PICKS_COMPLETE',
            'HOTPICK_DESIGNATED',
            'SCORE_UPDATED', 'STREAK_ACHIEVED', 'MILESTONE_REACHED',
            'LEADERBOARD_CHANGE',
            'SMACKTALK_SENT', 'SMACKTALK_FLAGGED', 'SMACKTALK_REMOVED',
            'ORGANIZER_BROADCAST', 'ORGANIZER_NUDGE',
            'POOL_CREATED', 'POOL_ARCHIVED',
            'ROUND_OPENED', 'ROUND_CLOSED', 'ROUND_SCORED'
        )
    )
);

-- Indexes for the queries that will actually run
CREATE INDEX IF NOT EXISTS idx_pool_events_pool_time
    ON pool_events(pool_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pool_events_type
    ON pool_events(pool_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pool_events_user
    ON pool_events(user_id, pool_id, created_at DESC);

-- RLS: organizers see their pool events, users see their own
ALTER TABLE pool_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organizers see their pool events"
ON pool_events FOR SELECT
USING (
    pool_id IN (
        SELECT id FROM pools WHERE organizer_id = auth.uid()
    )
);

CREATE POLICY "Users see their own events"
ON pool_events FOR SELECT
USING (user_id = auth.uid());

-- Inserts are service-role only (Edge Functions write events)

-- ---------------------------------------------------------------------------
-- 3. member_engagement — computed snapshot per member per pool
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS member_engagement (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    pool_id UUID NOT NULL REFERENCES pools(id),
    user_id UUID NOT NULL REFERENCES profiles(id),
    competition TEXT NOT NULL,

    -- Activity signals
    last_active_at TIMESTAMPTZ,
    last_pick_submitted_at TIMESTAMPTZ,
    rounds_participated INTEGER NOT NULL DEFAULT 0,
    rounds_possible INTEGER NOT NULL DEFAULT 0,
    participation_rate NUMERIC GENERATED ALWAYS AS (
        CASE WHEN rounds_possible > 0
        THEN rounds_participated::NUMERIC / rounds_possible
        ELSE 0 END
    ) STORED,

    -- Streak tracking
    current_correct_streak INTEGER NOT NULL DEFAULT 0,
    longest_correct_streak INTEGER NOT NULL DEFAULT 0,
    current_hotpick_streak INTEGER NOT NULL DEFAULT 0,

    -- Engagement signals
    smacktalk_messages_sent INTEGER NOT NULL DEFAULT 0,
    times_nudged INTEGER NOT NULL DEFAULT 0,
    last_nudged_at TIMESTAMPTZ,

    -- Status (computed by Edge Function)
    engagement_status TEXT NOT NULL DEFAULT 'active',
    -- Values: 'active', 'at_risk', 'dormant'

    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(pool_id, user_id, competition)
);

CREATE INDEX IF NOT EXISTS idx_member_engagement_pool
    ON member_engagement(pool_id, competition);

CREATE INDEX IF NOT EXISTS idx_member_engagement_status
    ON member_engagement(pool_id, engagement_status)
    WHERE engagement_status != 'active';

-- RLS
ALTER TABLE member_engagement ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own engagement"
ON member_engagement FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Organizers read pool engagement"
ON member_engagement FOR SELECT
USING (
    pool_id IN (
        SELECT id FROM pools WHERE organizer_id = auth.uid()
    )
);

-- Writes are service-role only (Edge Functions update engagement)

-- ---------------------------------------------------------------------------
-- 4. organizer_notifications — broadcast/nudge history with rate limiting
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS organizer_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    pool_id UUID NOT NULL REFERENCES pools(id),
    organizer_id UUID NOT NULL REFERENCES profiles(id),
    competition TEXT NOT NULL,

    -- Type and content
    notification_type TEXT NOT NULL,
    message TEXT,
    recipient_count INTEGER NOT NULL,
    recipient_user_ids UUID[],

    -- Delivery tracking
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    push_delivered INTEGER DEFAULT 0,
    push_failed INTEGER DEFAULT 0,

    CONSTRAINT valid_notification_type CHECK (
        notification_type IN ('broadcast', 'nudge', 'system')
    )
);

CREATE INDEX IF NOT EXISTS idx_organizer_notifications_pool
    ON organizer_notifications(pool_id, sent_at DESC);

-- RLS
ALTER TABLE organizer_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organizers manage their notifications"
ON organizer_notifications FOR ALL
USING (organizer_id = auth.uid())
WITH CHECK (organizer_id = auth.uid());

CREATE POLICY "Pool members read notifications"
ON organizer_notifications FOR SELECT
USING (
    pool_id IN (
        SELECT pool_id FROM pool_members WHERE user_id = auth.uid()
    )
);

-- ---------------------------------------------------------------------------
-- 5. pool_pulse — current intelligence digest per pool
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pool_pulse (
    pool_id UUID PRIMARY KEY REFERENCES pools(id),
    competition TEXT NOT NULL,
    items JSONB NOT NULL DEFAULT '[]',
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE pool_pulse ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pool members read pulse"
ON pool_pulse FOR SELECT
USING (
    pool_id IN (
        SELECT pool_id FROM pool_members WHERE user_id = auth.uid()
    )
);

-- Writes are service-role only (compute_pool_intelligence Edge Function)

-- ---------------------------------------------------------------------------
-- 6. Rate limit check function
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_notification_rate_limit(
    p_pool_id UUID,
    p_type TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    recent_count INTEGER;
BEGIN
    IF p_type = 'broadcast' THEN
        SELECT COUNT(*) INTO recent_count
        FROM organizer_notifications
        WHERE pool_id = p_pool_id
          AND notification_type = 'broadcast'
          AND sent_at > now() - INTERVAL '24 hours';
        RETURN recent_count < 3;  -- max 3 broadcasts per day
    ELSIF p_type = 'nudge' THEN
        SELECT COUNT(*) INTO recent_count
        FROM organizer_notifications
        WHERE pool_id = p_pool_id
          AND notification_type = 'nudge'
          AND sent_at > now() - INTERVAL '1 hour';
        RETURN recent_count < 1;  -- max 1 nudge per hour
    END IF;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
