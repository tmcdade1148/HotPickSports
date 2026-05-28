-- phase2_suspension_hidden_pools_audit
--
-- Phase 2 schema. Implements the suspension model from the April 2026
-- Super Admin spec, adds the hidden-Platform-Pool flag, extends
-- admin_audit_log + pool_events with the new action values, and updates
-- RLS to block writes from suspended pools / suspended users.
--
-- Divergence from spec: smack_messages keeps its existing
-- moderation_status enum (pending/escalated/...) — we do NOT add the
-- spec's separate `organizer_notified_at` / `escalated_to_admin_at`
-- columns. The existing cron `escalate_stale_flagged_messages` already
-- implements the 24h promotion. We add a NEW trigger that escalates
-- *immediately* when the message is flagged in a hidden pool, since
-- hidden pools have no organizer to action it.
-- ---------------------------------------------------------------------------

-- 1. Pool suspension columns
ALTER TABLE public.pools
  ADD COLUMN IF NOT EXISTS is_suspended       boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspended_at       timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_by       uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS suspension_reason  text,
  ADD COLUMN IF NOT EXISTS is_hidden_from_users boolean NOT NULL DEFAULT false;

-- 2. User suspension columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_platform_suspended    boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS platform_suspended_at    timestamptz,
  ADD COLUMN IF NOT EXISTS platform_suspended_by    uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS platform_suspension_reason text;

-- 3. admin_audit_log: extend the action CHECK with new values
DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
    FROM pg_constraint
   WHERE conrelid = 'public.admin_audit_log'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%action%';
  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.admin_audit_log DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

ALTER TABLE public.admin_audit_log
  ADD CONSTRAINT admin_audit_log_action_check CHECK (
    action = ANY (ARRAY[
      'POOL_SUSPENDED',
      'POOL_UNSUSPENDED',
      'USER_PLATFORM_SUSPENDED',
      'USER_PLATFORM_UNSUSPENDED',
      'ADMIN_BROADCAST_SENT',
      'MODERATION_ESCALATION_ACTIONED',
      'GAME_RESULT_OVERRIDDEN',
      'ROSTER_PASS_REGENERATED',
      'PARTNER_CREATED',
      'PARTNER_UPDATED',
      'PARTNER_DEACTIVATED',
      'POOL_HARD_DELETED'
    ])
  );

-- 4. RLS — block writes from / into suspended pools + suspended users

-- smack_messages INSERT: caller can't be platform-suspended AND target
-- pool can't be pool-suspended.
DROP POLICY IF EXISTS smack_messages_insert ON public.smack_messages;
CREATE POLICY smack_messages_insert ON public.smack_messages
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND pool_id IN (
      SELECT pool_id FROM pool_members WHERE user_id = auth.uid()
    )
    AND NOT EXISTS (
      SELECT 1 FROM pools WHERE id = smack_messages.pool_id AND is_suspended = true
    )
    AND NOT COALESCE((SELECT is_platform_suspended FROM profiles WHERE id = auth.uid()), false)
  );

-- season_picks INSERT/UPDATE: caller can't be platform-suspended.
-- Picks are pool-independent (Hard Rule #2), so we don't gate on pool
-- suspension — a suspended pool's *view* of standings just shows the
-- suspension banner, the user's underlying picks data is unaffected.
DROP POLICY IF EXISTS season_picks_insert ON public.season_picks;
CREATE POLICY season_picks_insert ON public.season_picks
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND NOT COALESCE((SELECT is_platform_suspended FROM profiles WHERE id = auth.uid()), false)
  );

DROP POLICY IF EXISTS season_picks_update ON public.season_picks;
CREATE POLICY season_picks_update ON public.season_picks
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND NOT COALESCE((SELECT is_platform_suspended FROM profiles WHERE id = auth.uid()), false)
  );

-- 5. Auto-escalate flagged messages in hidden pools
-- Hidden pools (Platform Pool) have no organizer to action a flagged
-- message in the 24h window. When a message in a hidden pool gets
-- flagged, immediately mark it 'escalated' instead of 'pending'.
CREATE OR REPLACE FUNCTION public.smack_auto_escalate_hidden()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hidden boolean;
BEGIN
  IF NEW.is_flagged = true
     AND NEW.moderation_status = 'pending'
     AND (OLD.is_flagged IS DISTINCT FROM NEW.is_flagged
          OR OLD.moderation_status IS DISTINCT FROM NEW.moderation_status) THEN
    SELECT is_hidden_from_users INTO v_hidden
      FROM pools WHERE id = NEW.pool_id;
    IF v_hidden THEN
      NEW.moderation_status := 'escalated';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS smack_auto_escalate_hidden_t ON public.smack_messages;
CREATE TRIGGER smack_auto_escalate_hidden_t
  BEFORE UPDATE OF is_flagged, moderation_status ON public.smack_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.smack_auto_escalate_hidden();
