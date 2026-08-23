-- ============================================================================
-- 260822b_club_contest_column_defaults.sql
--
-- GIT SYNC of already-applied production state -- production ran FOUR
-- migrations ahead of the repo before this file. Everything here is live as of
-- 2026-08-22, applied directly because a real Partner (The Natural) was blocked
-- mid-creation. Safe to re-apply as a no-op: CREATE OR REPLACE, an idempotent
-- constraint recreate, and two UPDATEs whose target rows already hold the
-- written values.
--
-- WHY THIS FILE EXISTS AT ALL. Rebuilding from the repo without it would
-- silently restore three live bugs -- the same drift that bit nfl-update-scores
-- this morning, where the repo copy still called a hard-403'd ESPN host. A repo
-- that lies about production is a landmine, not an inconvenience.
--
-- Three defects, all the same shape: create_partner_pool's INSERT omitted
-- columns and inherited silent defaults.
--
--  (a) admin_audit_log_action_check rejected action='create_partner_pool'.
--      The allowed list is curated UPPERCASE_SNAKE. Rule #17's log-first
--      ordering is what saved this one: the whole transaction rolled back, so
--      there was no orphan pool and no burned invite slug. Fixed by adding
--      CLUB_CONTEST_CREATED to the constraint and writing that value.
--
--  (b) member_limit was never set, so the Contest took the column default of
--      10. The 11th person to use the invite code would have been refused with
--      POOL_FULL -- a venue's Contest quietly capped at ten. NULL is the
--      canonical unlimited: join_pool_by_code gates on
--      `IF v_member_limit IS NOT NULL AND ...`.
--
--  (c) owning_club_id was never set. PoolModule decides with
--      `isOfficial = pool.owning_club_id != null`, so the partner's OWN Contest
--      rendered as "Affiliated with The Natural" rather than Official -- and
--      per Hard Rule #25 the branded header band renders only for Official
--      Contests, so their brand colors were suppressed along with it.
--
-- The earlier 260822_partner_roles_simplification.sql still contains
-- action='create_partner_pool'. That file is history and is deliberately left
-- alone; this migration supersedes it and must sort after it (hence the `b`).
--
-- NOT APPLIED BY THE AUTHORING SESSION. Already live; the Claude session
-- verifies this file matches production before merge.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- (a) The audit action. Recreated NOT VALID, matching its prior state -- the
-- constraint has never been validated against the existing rows and this is
-- not the migration to start (a validation pass would scan the whole table and
-- could fail on historical values none of this touches).
--
-- IF EXISTS on the DROP is the one addition to the production statement: it
-- changes no resulting state, and keeps a from-scratch rebuild from aborting
-- if the constraint is ever renamed or dropped upstream.
-- ---------------------------------------------------------------------------
ALTER TABLE admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_log_action_check;
ALTER TABLE admin_audit_log ADD CONSTRAINT admin_audit_log_action_check
  CHECK (action = ANY (ARRAY[
    'POOL_SUSPENDED','POOL_UNSUSPENDED','USER_PLATFORM_SUSPENDED',
    'USER_PLATFORM_UNSUSPENDED','ADMIN_BROADCAST_SENT',
    'MODERATION_ESCALATION_ACTIONED','GAME_RESULT_OVERRIDDEN',
    'ROSTER_PASS_REGENERATED','PARTNER_CREATED','PARTNER_UPDATED',
    'PARTNER_DEACTIVATED','POOL_HARD_DELETED','POOL_ARCHIVED','POOL_CREATED',
    'MEMBER_REMOVED','ORGANIZER_BROADCAST','SMACKTALK_REMOVED',
    'BETA_TESTER_ADDED','BETA_TESTER_REMOVED','SEASON_PHASE_ADVANCED',
    'LEAGUE_CHAIRMAN_SET','CLUB_POOL_GAFFER_SET','SIMULATOR_RESET',
    'TESTER_SIGNUP_PROFILE_FAILED','WEEK_ADVANCED','POOL_DESIGNATED_PUBLIC',
    'GAME_ROWS_DELETED','WEEK_PICKS_OPENED','ACCOUNT_DELETED',
    'CLUB_CONTEST_CREATED'
  ])) NOT VALID;

-- ---------------------------------------------------------------------------
-- (b) + (c) applied to The Natural's existing Contest.
--
-- Already-satisfied in production (verified 2026-08-22: member_limit IS NULL,
-- owning_club_id = partner_id = 2cd012e2-34f7-4504-ab8f-f8ec1a5828b1), so
-- re-running writes the same values. On a from-scratch rebuild the row does
-- not exist and both statements are no-ops, which is correct -- the function
-- below writes these columns for every Contest created from here on.
-- ---------------------------------------------------------------------------
UPDATE pools SET member_limit = NULL
 WHERE id = '5833a7fc-8fc7-41b4-bdd3-144e015845e1';
UPDATE pools SET owning_club_id = partner_id
 WHERE id = '5833a7fc-8fc7-41b4-bdd3-144e015845e1';

-- ---------------------------------------------------------------------------
-- create_partner_pool -- transcribed from the live function definition, not
-- re-derived from the previous migration. Only the audit action and the pools
-- INSERT differ from the version merged earlier today; every other line is
-- byte-identical to it.
--
-- CREATE OR REPLACE (not DROP + CREATE) because the signature is unchanged --
-- which also means the ACL survives, unlike the drop in the previous
-- migration. The REVOKE/GRANT pair below is therefore belt-and-braces rather
-- than a repair, kept so the file still produces the right grants on a
-- from-scratch rebuild.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_partner_pool(p_partner_id uuid, p_competition text)
 RETURNS TABLE(pool_id uuid, pool_name text, invite_code text, invite_slug text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_caller         uuid;
  v_is_super_admin boolean;
  v_partner        partners%ROWTYPE;
  v_pool_id        uuid;
  v_invite_code    text;
  v_gaffer         uuid;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT is_super_admin INTO v_is_super_admin FROM profiles WHERE id = v_caller;
  IF NOT COALESCE(v_is_super_admin, false) THEN RAISE EXCEPTION 'Super admin required'; END IF;

  SELECT * INTO v_partner FROM partners WHERE id = p_partner_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Partner not found'; END IF;
  IF NOT COALESCE(v_partner.can_run_pools, false) THEN
    RAISE EXCEPTION 'Partner is sponsor-only; cannot run pools'; END IF;
  IF v_partner.club_pool_id IS NOT NULL THEN
    RAISE EXCEPTION 'Partner already has a Club Contest (%)', v_partner.club_pool_id; END IF;
  IF NOT EXISTS (SELECT 1 FROM competition_config cc
                  WHERE cc.competition = p_competition AND cc.key = 'is_active') THEN
    RAISE EXCEPTION 'Unknown competition: %', p_competition; END IF;

  SELECT pm.user_id INTO v_gaffer FROM partner_members pm
   WHERE pm.partner_id = p_partner_id ORDER BY pm.created_at ASC LIMIT 1;
  v_gaffer := COALESCE(v_gaffer, v_caller);

  v_pool_id := gen_random_uuid();
  v_invite_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));
  WHILE EXISTS (SELECT 1 FROM pools pl WHERE pl.invite_code = v_invite_code) LOOP
    v_invite_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));
  END LOOP;

  -- Rule #17: log first, then act. Action must be allowed by
  -- admin_audit_log_action_check (CLUB_CONTEST_CREATED added 2026-08-22).
  INSERT INTO admin_audit_log (admin_id, action, target_table, target_id, metadata)
  VALUES (v_caller, 'CLUB_CONTEST_CREATED', 'pools', v_pool_id,
          jsonb_build_object('partner_id', p_partner_id, 'partner_slug', v_partner.slug,
                             'competition', p_competition, 'invite_code', v_invite_code,
                             'gaffer', v_gaffer));

  -- Three columns written EXPLICITLY, each for a reason learned the hard way:
  --   member_limit   NULL = unlimited; omitting it takes the column default of
  --                  10 and silently caps a venue's Contest at ten people.
  --   owning_club_id = the partner. PoolModule's isOfficial test; without it the
  --                  Contest renders as "Affiliated with X" and loses its
  --                  branded header band (Hard Rule #25).
  --   pool_start_date explicit rather than riding CURRENT_DATE.
  INSERT INTO pools (id, name, created_by, organizer_id, competition, is_public,
                     invite_code, invite_slug, partner_id, owning_club_id,
                     brand_config, status, pool_start_date, member_limit)
  VALUES (v_pool_id, v_partner.name, v_caller, v_gaffer, p_competition, false,
          v_invite_code, v_partner.slug, v_partner.id, v_partner.id,
          v_partner.brand_config, 'active', CURRENT_DATE, NULL);

  INSERT INTO pool_members (pool_id, user_id, role, status)
  VALUES (v_pool_id, v_gaffer, 'organizer', 'active');

  UPDATE partners SET club_pool_id = v_pool_id WHERE id = p_partner_id;

  RETURN QUERY SELECT pl.id, pl.name, pl.invite_code, pl.invite_slug
               FROM pools pl WHERE pl.id = v_pool_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_partner_pool(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_partner_pool(uuid, text) TO authenticated, service_role;
