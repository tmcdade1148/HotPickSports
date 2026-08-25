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
-- 7. The letter itself, in config.
--
-- Subject and body live here, NOT in the Edge Function, so Tom can rewrite the
-- note and dry-run it without a developer round-trip or a redeploy. Edits take
-- effect on the next hourly tick.
--
-- PLACEHOLDERS the sender substitutes:
--   {{first_name}}        the recipient's first name, or "there" when absent.
--                         30 of 143 profiles have no first name, so the fallback
--                         is the normal path, not an edge case.
--   {{unsubscribe_url}}   REQUIRED. The sender refuses to send a body that does
--                         not contain it — see the guard in the function. Tom
--                         controls the wording and placement; he cannot
--                         accidentally delete the opt-out and put the first
--                         email HotPick ever sends out of compliance.
--   {{house_code}}        the CURRENT house Contest code, read at send time from
--                         house_contest_code — the same key the Join screen
--                         reads. Never write the code as a literal here.
--
--                         THIS IS THE KILL SWITCH, not a convenience. Setting
--                         house_contest_code = "" is the ten-second door-close
--                         for a full Contest or a moderation incident. With a
--                         literal in this copy that switch would only be HALF
--                         closed: the Join screen line would vanish while this
--                         email kept mailing new signups a code to a Contest that
--                         was believed shut, and an email cannot be recalled.
--                         Half a kill switch is worse than a manual one, because
--                         you think you have pulled it.
--
--                         Cohort rolling is the same mechanism doing its lesser
--                         job: roll to 26B and the letter follows on its own.
--   {{IF_NO_CONTEST}}…{{/IF_NO_CONTEST}}
--                         renders ONLY when BOTH hold: the reader is in zero real
--                         Contests (section 6 definition, demo pool excluded) AND
--                         house_contest_code is non-empty. An empty code
--                         suppresses the WHOLE block — the letter must never read
--                         "use the code ." with a blank where a code should be.
--                         The sender collapses any run of blank lines left
--                         behind, so the block can be laid out readably here and
--                         "Your Picks. On the record." still follows the Contest
--                         paragraph cleanly when the block does not render.
--
-- FAIL CLOSED: an empty or missing subject or body sends NOTHING and reports
-- why. Blanking welcome_email_body is therefore a second kill switch, alongside
-- pausing the cron. A leftover {{placeholder}} after rendering also refuses —
-- a typo like {{first_nme}} must never ship in a founder's email.
--
-- No em dashes in the copy: hotpick-brand-voice treats them as the clearest
-- fingerprint of machine-written text, which is the last thing a personal note
-- from the founder should read as. Keep it that way when editing.
-- ---------------------------------------------------------------------------
-- TOM'S WORDS, SEEDED VERBATIM. This went through hotpick-brand-voice and
-- hotpick-legal-guardrails (zero Tier 1 terms) and Tom rewrote it himself.
-- Nobody edits the wording in code. If it ever needs to change, Tom edits the
-- config key.
--
-- Two claims in the copy were checked against the live database before seeding,
-- so nobody has to re-derive them if the wording is questioned:
--   "One login. Not many places do that." — join_pool_by_invite has NO per-user
--   cap; it only checks the per-pool member_limit. Being in many Contests is
--   true. CAUTION for any future rewrite: create_pool DOES cap at
--   free_tier_max_pools, so the copy deliberately says "be in" rather than
--   "start". Do not reword toward starting Contests without re-checking that cap.
--   "Bragging rights TBD" is already running on hotpicksports.com. It is a brand
--   asset, matched exactly, not a draft.
INSERT INTO competition_config (competition, key, value, description)
VALUES
  ('global', 'welcome_email_subject', to_jsonb($subj$Welcome to HotPick Sports$subj$::text),
   'Subject line of the welcome email. Supports {{first_name}}. Empty = nothing sends.'),
  ('global', 'welcome_email_body', to_jsonb($body$Hey {{first_name}},

We're glad you're here.

These are the early days and I don't take you being here for granted. I hope you and your friends keep playing with us for years to come.

Starting a Contest takes less than a minute, then you share the invite code with friends, family or co-workers. The more the merrier. And if someone else starts one, you can be in theirs too. One login. Not many places do that.

{{IF_NO_CONTEST}}
If you're just here to play while you gather your Players, use the code {{house_code}}. That'll get you into the public Contest.
{{/IF_NO_CONTEST}}

Your Picks. On the record. Bragging rights TBD.

Anything not working right, or you just want to tell me something's dumb, reply here or write support@hotpicksports.com. It's a short list of people reading it.

Tom
Founder, HotPick Sports

---
Don't want these? Unsubscribe: {{unsubscribe_url}}
$body$::text),
   'Body of the welcome email, plain text. Placeholders: {{first_name}} (falls back to "there"), {{unsubscribe_url}} (REQUIRED, the send refuses without it), {{house_code}}, and the {{IF_NO_CONTEST}}...{{/IF_NO_CONTEST}} block. Edits take effect on the next hourly tick. Empty = nothing sends. Dry-run after editing to read it back before anyone receives it.')
ON CONFLICT (competition, key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 8. Hourly, and PAUSED.
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
