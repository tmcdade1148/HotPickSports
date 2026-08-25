-- ============================================================================
-- 260825_open_door_house_contest_and_chirps_switch.sql
--
-- The Open Door. Gives a download that arrives WITHOUT an invite code somewhere
-- to go, and makes the absence of Chirps in that place an argument for starting
-- or joining a private Contest rather than a missing feature.
--
-- Four moving parts: a per-Contest Chirps posting switch enforced in RLS, the
-- switch turned off on exactly one pool, the member cap removed from that same
-- pool, and the house code surfaced through config so it can roll (or vanish)
-- without a deploy.
--
-- BLAST RADIUS: chirps_enabled defaults TRUE, so every existing Contest is
-- completely unaffected. Exactly one pool id is set false. There is deliberately
-- NO predicate (is_public / is_global) driving this — a predicate would silently
-- disable Chirps on Contests nobody intended to change.
--
-- Take a manual Supabase backup before applying.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The switch.
-- ---------------------------------------------------------------------------
ALTER TABLE pools
  ADD COLUMN IF NOT EXISTS chirps_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN pools.chirps_enabled IS
  'False disables MEMBER posting to Chirps for this Contest. System messages '
  '(post_system_message, SECURITY DEFINER) are unaffected and reads stay open. '
  'Used by open/house Contests of strangers, where a social feed is a '
  'moderation liability and its absence is a reason to join a private Contest.';

-- ---------------------------------------------------------------------------
-- 2. Enforce it in RLS. A client-side hide is a curtain, not a lock — anyone
--    with the app could still POST straight through the API (Hard Rule #8).
--
--    The four existing clauses below were copied VERBATIM from the live policy
--    on 2026-08-25 via:
--      SELECT with_check FROM pg_policies WHERE policyname='smack_messages_insert';
--    They are not retyped from the spec. RLS mistakes fail SILENTLY — a dropped
--    clause reopens suspended-pool or suspended-user posting with no error
--    anywhere — so if you ever re-run this file, re-pull the live definition
--    first and diff it against what is here.
--
--    The new clause is the last one, in the same shape as the is_suspended gate
--    directly above it.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS smack_messages_insert ON smack_messages;

CREATE POLICY smack_messages_insert ON smack_messages FOR INSERT
WITH CHECK (
  (user_id = (SELECT auth.uid()))
  AND (pool_id IN (
        SELECT pool_members.pool_id FROM pool_members
         WHERE pool_members.user_id = (SELECT auth.uid())
           AND pool_members.status = 'active'))
  AND (NOT EXISTS (
        SELECT 1 FROM pools
         WHERE pools.id = smack_messages.pool_id AND pools.is_suspended = true))
  AND (NOT COALESCE((
        SELECT profiles.is_platform_suspended FROM profiles
         WHERE profiles.id = (SELECT auth.uid())), false))
  -- NEW: member posting requires the Contest's Chirps switch to be on.
  AND (EXISTS (
        SELECT 1 FROM pools
         WHERE pools.id = smack_messages.pool_id AND pools.chirps_enabled = true))
);

-- ---------------------------------------------------------------------------
-- 3. Turn posting off for the house Contest ONLY. One id, no predicate.
--    NFL HotPick 26A (nfl_2026, code HOTPICK26A).
-- ---------------------------------------------------------------------------
UPDATE pools SET chirps_enabled = false
 WHERE id = 'd8ac04f1-3b16-45a7-9cfa-b259adf72ec5';

-- ---------------------------------------------------------------------------
-- 4. Remove the member cap on the house Contest. Removed, not raised: this is
--    HotPick's own Contest, and tier limits are a billing construct that should
--    not apply to the front door.
--
--    join_pool_by_invite only evaluates the cap inside `IF v_pool.member_limit
--    IS NOT NULL`, so NULL skips the whole block and show_wall comes back NULL —
--    no paywall at member 51. It was 50.
-- ---------------------------------------------------------------------------
UPDATE pools SET member_limit = NULL
 WHERE id = 'd8ac04f1-3b16-45a7-9cfa-b259adf72ec5';

-- ---------------------------------------------------------------------------
-- 5. The house code, config-driven. Never hardcoded in the client: it rolls to
--    26B/26C as cohorts fill, and an EMPTY value is the kill switch that hides
--    the Join-screen line instantly, with no deploy.
-- ---------------------------------------------------------------------------
INSERT INTO competition_config (competition, key, value, description)
VALUES ('global', 'house_contest_code', '"HOTPICK26A"'::jsonb,
  'Invite code surfaced on JoinPoolScreen for users who arrive without one. '
  'Rolls to 26B/26C as cohorts fill. Set to "" to hide the line instantly — '
  'this is the kill switch for a full Contest or a moderation incident.')
ON CONFLICT (competition, key) DO UPDATE SET value = EXCLUDED.value;

-- ---------------------------------------------------------------------------
-- 6. Carry chirps_enabled through the client pool shape.
--
--    globalStore's pool list uses `.select('*')`, so it picks the column up for
--    free — but join_pool_by_invite returns _pool_client_json(v_pool), and the
--    client appends THAT object straight into userPools. Without this key, a
--    user who has just joined the house Contest would carry an undefined flag
--    until the next refetch, see a composer that should not be there, and have
--    the post rejected by the policy above. One key, and the two paths agree.
--
--    Every other key is unchanged and in its original order.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._pool_client_json(p pools)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'id',             p.id,
    'name',           p.name,
    'competition',    p.competition,
    'is_global',      p.is_global,
    'is_public',      p.is_public,
    'invite_code',    p.invite_code,
    'brand_config',   p.brand_config,
    'created_at',     p.created_at,
    'organizer_id',   p.organizer_id,
    'chirps_enabled', p.chirps_enabled
  );
$function$;
