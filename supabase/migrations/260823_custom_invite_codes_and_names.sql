-- ============================================================================
-- 260823_custom_invite_codes_and_names.sql
--
-- Partner Tooling v1.2 §3: custom invite codes (immutable once players join,
-- old codes valid forever), custom Contest names at creation, and a
-- Director-editable Contest name.
--
-- NOT APPLIED BY THE AUTHORING SESSION. Applied via MCP at merge.
--
-- ---------------------------------------------------------------------------
-- DEVIATION FROM THE SPEC, STATED UP FRONT: no `pool_invite_aliases` table.
--
-- The spec's §3.1 creates a new table to hold retired codes. That mechanism
-- ALREADY EXISTS as `pool_invite_codes` (migration 260515) and is live and
-- maintained: 49 rows, one written for The Natural's Club Contest at
-- 2026-08-22 23:57 by the pools->codes sync trigger. It is literally
-- documented as "one row per code, many codes per pool", with `is_active` for
-- soft-retirement.
--
-- Building the new table alongside it would have been actively harmful, for
-- three reasons, each verified rather than assumed:
--
--  1. THE APP WOULD NOT HAVE SEEN THE ALIASES. The spec adds the alias lookup
--     to join_pool_by_code. Nothing calls join_pool_by_code — not the client
--     (globalStore.ts:474 calls join_pool_by_invite), not an Edge Function.
--     Only rpc_join_pool_by_code wraps it, and nothing calls that either. The
--     path that actually runs is join_pool_by_invite, which reads
--     pool_invite_codes. Aliases in a new table would have been invisible to
--     every real join, so Decision 2 ("retired codes stay valid FOREVER")
--     would have been silently 0% true in production.
--
--  2. THE OLD CODE WAS GOING TO BE DESTROYED ANYWAY. The spec's RPC does
--     `UPDATE pools SET invite_code = ...`. The AFTER UPDATE trigger
--     pools_sync_invite_code_to_codes_table then rewrites the pool's existing
--     primary row IN PLACE, so the old code disappears from the table the live
--     join path consults.
--
--  3. UNIQUENESS BECOMES A DATABASE GUARANTEE INSTEAD OF RPC LOGIC. The
--     partial unique index pool_invite_codes_unique_active makes every active
--     code globally unique across all pools -- current and retired alike. The
--     spec's §9 accepted "alias-vs-current cannot be a constraint" as a
--     residual; using the existing table removes that residual entirely. The
--     only check left in RPC logic is against pools.invite_slug, which really
--     does live in another table.
--
-- Everything the spec LOCKED still holds; only the storage changed:
--   Decision 1  code locked once any non-organizer member joins  -- enforced
--   Decision 2  retired codes valid forever  -- they stay is_active, demoted
--               to is_primary=false, which is exactly what join_pool_by_invite
--               already matches on
--   Decision 3  6-12 chars, [A-Z0-9]  -- already CHECK constraints on the
--               table (length/alphabet/uppercase), so the DB enforces it even
--               if an RPC ever forgets
--   Decision 4  uniqueness across every namespace  -- see below
--   Decision 5  Directors get name only, never code  -- two separate RPCs
--   Decision 7  a real table with real uniqueness, not a text[]  -- honored,
--               by a table that already had it
--
-- NAMESPACE COUNT: the spec says three. It is FOUR, and the fourth is the one
-- that matters most: pool_invite_codes.code (active), which is the first thing
-- join_pool_by_invite looks at. The three named in the spec are
-- pools.invite_code, the alias store, and pools.invite_slug. Here the first two
-- collapse into pool_invite_codes and are enforced by the unique index; slug is
-- checked in the two writing RPCs.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Audit actions. BOTH new values, in the SAME migration as the RPCs that write
-- them -- omitting this is exactly how Start Club Contest failed on
-- 2026-08-22: the value was not in the curated list, the audit INSERT was
-- rejected, and Rule #17's log-first ordering rolled the whole transaction
-- back. Recreated NOT VALID, matching its current state.
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
    'CLUB_CONTEST_CREATED','POOL_INVITE_CODE_CHANGED','POOL_RENAMED'
  ])) NOT VALID;

-- ---------------------------------------------------------------------------
-- Shared check: is this code already reachable by some OTHER pool?
--
-- Two namespaces the unique index cannot cover on its own:
--   * another pool's active code row -- the index would reject the INSERT, but
--     a clean error beats a constraint violation surfacing as a 500
--   * another pool's invite_slug -- join_pool_by_invite matches a
--     slug with its non-alphanumerics stripped, so a custom code equal to
--     another pool's slug hijacks that pool's join path
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._invite_code_taken(p_code text, p_pool_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM pool_invite_codes
     WHERE code = p_code AND is_active = true
       AND (p_pool_id IS NULL OR pool_id <> p_pool_id)
  ) OR EXISTS (
    SELECT 1 FROM pools
     WHERE upper(regexp_replace(coalesce(invite_slug, ''), '[^0-9A-Za-z]', '', 'g')) = p_code
       AND (p_pool_id IS NULL OR id <> p_pool_id)
  );
$$;

REVOKE ALL ON FUNCTION public._invite_code_taken(text, uuid) FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- set_pool_invite_code -- the ONLY path that changes a live Contest's code.
-- Super admin only: Directors get the name, never the code (Decision 5). A
-- code is printed on table tents; a name is not.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_pool_invite_code(p_pool_id uuid, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller  uuid := auth.uid();
  v_code    text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_old     text;
  v_members int;
BEGIN
  IF v_caller IS NULL THEN RETURN jsonb_build_object('error', 'NOT_AUTHENTICATED'); END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_caller AND is_super_admin) THEN
    RETURN jsonb_build_object('error', 'NOT_AUTHORIZED'); END IF;

  -- Same rule the client enforces (INVITE_CODE_MIN/MAX + normalizeRosterPass,
  -- which strips [^A-Za-z0-9] and uppercases -- identical to the regexp above)
  -- and the same rule the table's CHECK constraints enforce underneath.
  IF length(v_code) < 6 OR length(v_code) > 12 THEN
    RETURN jsonb_build_object('error', 'BAD_FORMAT'); END IF;

  SELECT invite_code INTO v_old FROM pools WHERE id = p_pool_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'POOL_NOT_FOUND'); END IF;
  IF v_old = v_code THEN RETURN jsonb_build_object('ok', true, 'unchanged', true); END IF;

  -- Decision 1: locked the moment anyone beyond the organizer has joined.
  -- A venue prints the code; a later edit silently kills every printed asset.
  SELECT count(*) INTO v_members FROM pool_members
   WHERE pool_id = p_pool_id AND role <> 'organizer' AND status = 'active';
  IF v_members > 0 THEN
    RETURN jsonb_build_object('error', 'CODE_LOCKED', 'members', v_members); END IF;

  IF public._invite_code_taken(v_code, p_pool_id) THEN
    RETURN jsonb_build_object('error', 'CODE_TAKEN'); END IF;

  INSERT INTO admin_audit_log (admin_id, action, target_table, target_id, metadata)
  VALUES (v_caller, 'POOL_INVITE_CODE_CHANGED', 'pools', p_pool_id,
          jsonb_build_object('from', v_old, 'to', v_code));

  -- Decision 2, the whole point: the old code KEEPS WORKING. It is demoted to
  -- is_primary=false but stays is_active=true, and join_pool_by_invite matches
  -- on `code = X AND is_active` without caring about is_primary. Nothing is
  -- deleted here, ever -- see Red Flag #3.
  UPDATE pool_invite_codes
     SET is_primary = false
   WHERE pool_id = p_pool_id AND is_primary = true;

  -- Belt-and-braces for a pool whose old code never made it into the table
  -- (one live pool is in that state today). Without this the old code would
  -- only exist on pools.invite_code, which we are about to overwrite.
  IF v_old IS NOT NULL AND length(v_old) BETWEEN 6 AND 12
     AND upper(v_old) ~ '^[0-9A-Z]+$'
     AND NOT EXISTS (SELECT 1 FROM pool_invite_codes
                      WHERE pool_id = p_pool_id AND code = upper(v_old)) THEN
    INSERT INTO pool_invite_codes (pool_id, code, label, is_primary, is_active, created_by)
    VALUES (p_pool_id, upper(v_old), 'Retired', false, true, v_caller)
    ON CONFLICT DO NOTHING;
  END IF;

  -- The new primary. The AFTER INSERT trigger mirrors it to pools.invite_code,
  -- so we deliberately do NOT write that column ourselves -- one writer, no
  -- chance of the two disagreeing.
  INSERT INTO pool_invite_codes (pool_id, code, label, is_primary, is_active, created_by)
  VALUES (p_pool_id, v_code, 'Custom', true, true, v_caller);

  RETURN jsonb_build_object('ok', true, 'code', v_code, 'alias_kept', v_old);
END;
$$;

REVOKE ALL ON FUNCTION public.set_pool_invite_code(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_pool_invite_code(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- set_pool_name -- super admin OR any Director of the pool's partner.
-- Cosmetic, so it has none of the code's restrictions: no membership gate, no
-- uniqueness. Cap is 30 to match the create form's maxLength.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_pool_name(p_pool_id uuid, p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller  uuid := auth.uid();
  v_name    text := btrim(coalesce(p_name, ''));
  v_partner uuid;
  v_old     text;
BEGIN
  IF v_caller IS NULL THEN RETURN jsonb_build_object('error', 'NOT_AUTHENTICATED'); END IF;

  SELECT partner_id, name INTO v_partner, v_old FROM pools WHERE id = p_pool_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'POOL_NOT_FOUND'); END IF;

  IF NOT (
    EXISTS (SELECT 1 FROM profiles WHERE id = v_caller AND is_super_admin = true)
    OR (v_partner IS NOT NULL AND EXISTS (
          SELECT 1 FROM partner_members
           WHERE partner_id = v_partner AND user_id = v_caller))
  ) THEN
    RETURN jsonb_build_object('error', 'NOT_AUTHORIZED');
  END IF;

  IF v_name = '' THEN RETURN jsonb_build_object('error', 'EMPTY_NAME'); END IF;
  IF length(v_name) > 30 THEN RETURN jsonb_build_object('error', 'NAME_TOO_LONG'); END IF;
  IF v_name = v_old THEN RETURN jsonb_build_object('ok', true, 'unchanged', true); END IF;

  INSERT INTO admin_audit_log (admin_id, action, target_table, target_id, metadata)
  VALUES (v_caller, 'POOL_RENAMED', 'pools', p_pool_id,
          jsonb_build_object('from', v_old, 'to', v_name));

  UPDATE pools SET name = v_name WHERE id = p_pool_id;

  RETURN jsonb_build_object('ok', true, 'name', v_name);
END;
$$;

REVOKE ALL ON FUNCTION public.set_pool_name(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_pool_name(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- create_partner_pool -- optional custom name and code at creation.
--
-- DROP + CREATE, not CREATE OR REPLACE: adding two defaulted parameters makes
-- a NEW signature (uuid,text,text,text). Leaving the old (uuid,text) in place
-- would make create_partner_pool(partner, competition) ambiguous and every
-- call would fail to resolve.
--
-- p_competition still has NO default (v1.1 Decision 5, Red Flag #3): the
-- server default used to be 'nfl_2025_sim' and would have put the first real
-- Partner's Contest in the tester sandbox.
--
-- Everything else is byte-identical to the live function, including
-- search_path 'public','extensions' -- gen_random_bytes() is pgcrypto, which
-- lives in the extensions schema on this project.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_partner_pool(uuid, text);

CREATE FUNCTION public.create_partner_pool(
  p_partner_id  uuid,
  p_competition text,
  p_name        text DEFAULT NULL,
  p_invite_code text DEFAULT NULL
) RETURNS TABLE(pool_id uuid, pool_name text, invite_code text, invite_slug text)
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
  v_name           text;
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

  -- NULL name -> the partner's own name, exactly as before.
  v_name := btrim(coalesce(p_name, ''));
  IF v_name = '' THEN v_name := v_partner.name; END IF;
  IF length(v_name) > 30 THEN RAISE EXCEPTION 'Name too long (max 30)'; END IF;

  -- Gaffer default: a live Director if one exists, else the caller.
  SELECT pm.user_id INTO v_gaffer FROM partner_members pm
   WHERE pm.partner_id = p_partner_id ORDER BY pm.created_at ASC LIMIT 1;
  v_gaffer := COALESCE(v_gaffer, v_caller);

  v_pool_id := gen_random_uuid();

  -- NULL code -> the random loop, exactly as before. A supplied code runs the
  -- SAME format and namespace checks as set_pool_invite_code.
  IF p_invite_code IS NOT NULL AND btrim(p_invite_code) <> '' THEN
    v_invite_code := upper(regexp_replace(p_invite_code, '[^A-Za-z0-9]', '', 'g'));
    IF length(v_invite_code) < 6 OR length(v_invite_code) > 12 THEN
      RAISE EXCEPTION 'Invite code must be 6-12 letters or digits'; END IF;
    IF public._invite_code_taken(v_invite_code, NULL) THEN
      RAISE EXCEPTION 'Invite code % is already taken', v_invite_code; END IF;
  ELSE
    v_invite_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));
    WHILE public._invite_code_taken(v_invite_code, NULL) LOOP
      v_invite_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));
    END LOOP;
  END IF;

  -- Rule #17: log first, then act. Action must be allowed by
  -- admin_audit_log_action_check (CLUB_CONTEST_CREATED added 2026-08-22).
  INSERT INTO admin_audit_log (admin_id, action, target_table, target_id, metadata)
  VALUES (v_caller, 'CLUB_CONTEST_CREATED', 'pools', v_pool_id,
          jsonb_build_object('partner_id', p_partner_id, 'partner_slug', v_partner.slug,
                             'competition', p_competition, 'invite_code', v_invite_code,
                             'gaffer', v_gaffer, 'custom_name', p_name IS NOT NULL,
                             'custom_code', p_invite_code IS NOT NULL));

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
  VALUES (v_pool_id, v_name, v_caller, v_gaffer, p_competition, false,
          v_invite_code, v_partner.slug, v_partner.id, v_partner.id,
          v_partner.brand_config, 'active', CURRENT_DATE, NULL);

  INSERT INTO pool_members (pool_id, user_id, role, status)
  VALUES (v_pool_id, v_gaffer, 'organizer', 'active');

  UPDATE partners SET club_pool_id = v_pool_id WHERE id = p_partner_id;

  RETURN QUERY SELECT pl.id, pl.name, pl.invite_code, pl.invite_slug
               FROM pools pl WHERE pl.id = v_pool_id;
END;
$function$;

-- DROP + CREATE resets the ACL to EXECUTE-to-PUBLIC, which would hand anon a
-- grant it does not have. Restore the grants the dropped function carried.
REVOKE ALL ON FUNCTION public.create_partner_pool(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_partner_pool(uuid, text, text, text) TO authenticated, service_role;
