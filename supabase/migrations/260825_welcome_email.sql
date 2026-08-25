-- ============================================================================
-- 260825_welcome_email.sql
--
-- The Welcome Note. One warm email from Tom, 24 hours after signup, plus the
-- general-purpose sending path (log, opt-out, cutoff) that later emails reuse.
--
-- Take a manual Supabase backup before applying.
--
-- THE SAFETY PROPERTY OF THIS WHOLE BUILD is section 3's cutoff: a naive
-- "older than 24h, never emailed" query matches the entire existing user base,
-- and a welcome note cannot be un-sent. Three independent things prevent that:
--   1. welcome_email_start_at — a hard floor written at apply time (below)
--   2. a 72-hour ceiling in the candidate query
--   3. email_log's unique index — one row per user per email type, ever
-- Any ONE of them failing still leaves two. See welcome_email_candidates().
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Make is_test_account trustworthy.
--
-- Verified 2026-08-25: 151 auth users, only 8 carried is_test_account = true,
-- while 38 further @hotpicksports.com accounts (reviewer@, organizer@, player@,
-- apple@, google@, dummy@, super@, partner@, clubmanager@, tmcdade+testNN@ …)
-- carried false. The email-domain exclusion in the candidate query below is the
-- belt; this backfill is the braces, and it makes the FLAG itself dependable for
-- every future query that asks "is this a real user" — aggregates, statistics,
-- data licensing (CLAUDE.md, test-account red flag).
--
-- The domain rule alone would have missed four more internal buckets, all found
-- by reading the actual local parts rather than trusting the pattern:
--   sim-*@hotpick.local      (8)  the seeded mock cast, bulk-created 2026-04-09
--   *@hotpickspprts.com      (1)  tmcdade+test19, typo'd domain
--   *@hotpicks.com           (1)  tester_ipad_ed, has a flagged twin on the
--                                 correct domain
--   demo@hotpick.app         (1)
--
-- SUPER ADMINS ARE DELIBERATELY NOT FLAGGED. admin@hotpicksports.com and
-- tpmcdade@yahoo.com are internal, but is_test_account also drives an in-app
-- "Test Account" banner and an operator-console badge, and super admins are
-- already excluded from aggregates by their own long-standing mechanism
-- (CLAUDE.md). Two mechanisms, no overlap; the candidate query excludes them
-- separately.
--
-- Tom's personal accounts on consumer domains (tpmcdade@yahoo.com,
-- thomas@honeyandpunch.com, tom@mcdade.com, tmcdade@me.com) are NOT flagged
-- either. They are real accounts he plays from — flagging them would put a Test
-- Account banner in his own app and drop him out of his own standings.
-- ---------------------------------------------------------------------------
UPDATE profiles p
   SET is_test_account = true
  FROM auth.users au
 WHERE au.id = p.id
   AND p.is_test_account = false
   AND COALESCE(p.is_super_admin, false) = false
   AND (
        au.email ILIKE '%@hotpicksports.com'
     OR au.email ILIKE '%@hotpick.local'
     OR au.email ILIKE '%@hotpickspprts.com'
     OR au.email ILIKE '%@hotpicks.com'
     OR au.email ILIKE '%@hotpick.app'
   );

-- ---------------------------------------------------------------------------
-- 2. Email opt-out + an opaque per-user unsubscribe token.
--
-- The token is NOT the user_id and NOT the email address. A guessable
-- unsubscribe URL lets anyone opt anyone out, and a user_id in a query string is
-- an identifier leak.
-- ---------------------------------------------------------------------------
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS email_opt_out    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_unsub_token uuid   NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS notification_preferences_unsub_token_idx
  ON notification_preferences (email_unsub_token);

-- 17 of 151 users have no notification_preferences row at all (verified
-- 2026-08-25), so a token cannot be assumed to exist just because a user does.
-- Backfill the gap now; the sender also upserts before it reads a token, so a
-- future account created down some path that skips preferences still gets a
-- working unsubscribe link rather than a broken one.
INSERT INTO notification_preferences (user_id)
SELECT au.id FROM auth.users au
 WHERE NOT EXISTS (SELECT 1 FROM notification_preferences np WHERE np.user_id = au.id)
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. The send log. One row per user per email type, EVER.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_type text NOT NULL,
  sent_to    text NOT NULL,
  status     text NOT NULL,   -- 'sending' | 'sent' | 'failed' | 'skipped'
  detail     text,            -- provider id, or why it failed / was skipped
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_log_once_per_type
  ON email_log (user_id, email_type);

ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;
-- No policies: service role only. Nothing in the client reads this.

COMMENT ON TABLE email_log IS
  'One row per user per email_type, ever — enforced by email_log_once_per_type. '
  'The sender CLAIMS a row with status=''sending'' BEFORE calling the provider '
  'and resolves it to ''sent'' or ''failed'' after. Claiming first is what makes '
  'double-sending structurally impossible rather than merely unlikely: writing '
  'the row after the provider call leaves a window where two overlapping '
  'invocations both send and only the second insert fails. ''sent'' is still '
  'written ONLY from a successful provider response.';

-- ---------------------------------------------------------------------------
-- 4. The cutoff. now() AT APPLY TIME, never a hand-typed date.
--
-- ON CONFLICT DO NOTHING is deliberate and load-bearing: re-running this file
-- must never move an existing floor backwards and re-open the whole user base.
-- ---------------------------------------------------------------------------
INSERT INTO competition_config (competition, key, value, description)
VALUES ('global', 'welcome_email_start_at', to_jsonb(now()::text),
  'Hard floor for the welcome email. Accounts created before this instant are '
  'NEVER eligible. Prevents the first cron tick from emailing the entire '
  'existing user base a welcome note. Do not move this backwards.')
ON CONFLICT (competition, key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. What counts as a real Contest — ONE definition (spec section 6).
--
-- The demo pool is is_hidden_from_users = true and so is already caught by that
-- clause; competition <> 'nfl_demo' is kept as a named guard because "the demo
-- must never make someone look like they joined a Contest" is the rule people
-- will search for, and 45 active demo memberships sit in pool_members looking
-- exactly like real ones to anything that counts rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION real_contest_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
    FROM pool_members pm
    JOIN pools p ON p.id = pm.pool_id
   WHERE pm.user_id = p_user_id
     AND pm.status = 'active'
     AND p.is_archived = false
     AND p.deleted_at IS NULL
     AND p.competition <> 'nfl_demo'
     AND p.is_hidden_from_users = false;
$$;

REVOKE EXECUTE ON FUNCTION real_contest_count(uuid) FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- 6. Who gets the welcome email.
--
-- Lives in SQL, not in the Edge Function, for two reasons. The eligibility rule
-- is the dangerous part of this build and it belongs somewhere it can be read
-- and dry-run directly. And auth.users is not reachable over PostgREST at all,
-- so the sender needs an RPC regardless.
--
-- FAIL-CLOSED FLOOR: if welcome_email_start_at is missing, the subquery returns
-- NULL, `created_at > NULL` is NULL, and every row is filtered out. A missing
-- floor therefore emails NOBODY rather than everybody. Keep it that way — do not
-- "helpfully" COALESCE it to a default.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION welcome_email_candidates()
RETURNS TABLE (
  user_id       uuid,
  email         text,
  first_name    text,
  real_contests integer,
  unsub_token   uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT au.id,
         au.email::text,
         p.first_name,
         real_contest_count(au.id),
         np.email_unsub_token
    FROM auth.users au
    LEFT JOIN profiles p                  ON p.id = au.id
    LEFT JOIN notification_preferences np ON np.user_id = au.id
   WHERE au.email IS NOT NULL
     AND au.email <> ''
     -- the window: older than a day, younger than three
     AND au.created_at < now() - interval '24 hours'
     AND au.created_at > now() - interval '72 hours'
     -- the floor (see FAIL-CLOSED note above)
     AND au.created_at > (SELECT (value #>> '{}')::timestamptz
                            FROM competition_config
                           WHERE competition = 'global' AND key = 'welcome_email_start_at')
     -- internal accounts, three independent ways
     AND COALESCE(p.is_test_account, false) = false
     AND au.email NOT ILIKE '%@hotpicksports.com'
     AND COALESCE(p.is_super_admin, false) = false
     -- consent
     AND COALESCE(np.email_opt_out, false) = false
     -- never twice
     AND NOT EXISTS (SELECT 1 FROM email_log el
                      WHERE el.user_id = au.id AND el.email_type = 'welcome');
$$;

REVOKE EXECUTE ON FUNCTION welcome_email_candidates() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Hourly, and PAUSED.
--
-- Hourly rather than daily so the note lands 24–25 hours after signup instead of
-- up to 48. Created inactive on purpose: dry-run, review the recipient list, send
-- one live test to Tom, and only then
--     SELECT cron.alter_job(jobid, active := true);
--
-- Kill switch, no deploy needed:
--     SELECT cron.alter_job(jobid, active := false);
-- ---------------------------------------------------------------------------
SELECT cron.schedule('send-welcome-emails', '0 * * * *', $job$
  SELECT net.http_post(
    url := 'https://mzqtrpdiqhopjmxjccwy.supabase.co/functions/v1/send-welcome-emails',
    headers := jsonb_build_object(
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_shared_secret'),
      'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000);
$job$);

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'send-welcome-emails'),
  active := false);
