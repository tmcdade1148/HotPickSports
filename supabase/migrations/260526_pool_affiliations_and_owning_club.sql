-- =============================================================================
-- Migration: 260526_pool_affiliations_and_owning_club
-- =============================================================================
-- Restructures the partner ↔ pool relationship so that:
--   (a) A Club (partner) can have MANY official Contests, not just one.
--       e.g., ESPN runs "ESPN Northeast", "ESPN West", etc.
--   (b) An independent Contest's Gaffer can affiliate with MANY Clubs.
--       Each affiliation carries its own brand_config snapshot, so rendering
--       never live-joins to `partners` (Hard Rule #23).
--
-- Three Contest types result, distinguishable in one query:
--   • Official Club Contest  — pools.owning_club_id IS NOT NULL
--   • Roster (affiliated)    — pools.owning_club_id IS NULL AND has ≥1 affiliation
--   • Independent            — pools.owning_club_id IS NULL AND has 0 affiliations
--
-- Naming note: an earlier draft used "endorsement" / "endorsed by". The Club
-- doesn't actively vouch — the Gaffer self-submits via PartnerDirectoryScreen
-- — so "affiliation" / "affiliated with" is the accurate vocabulary.
--
-- Key decisions (captured from product discussion 2026-05-26):
--   • `partners.club_pool_id` (singular) becomes too narrow; replaced by the
--     inverse pointer `pools.owning_club_id`. One Club → many official pools.
--   • Affiliations live in their own join table, not a JSONB array on pools,
--     so RLS, brand snapshots, and the "no affiliations on Official Contests"
--     constraint can all be enforced at the row level.
--   • A pool with `owning_club_id` set is FORBIDDEN from having any
--     affiliations — the Club's own Contest represents that Club exclusively.
--     Enforced by trigger (not CHECK — cross-table predicate).
--   • `pools.partner_id` is retained for one release cycle as a mirror of the
--     primary affiliation. New code should read from
--     `pool_partner_affiliations`. Drop scheduled for the release after next.
--   • Partner Admin auth derives from owning_club_id: any active
--     organizer/admin of a pool with owning_club_id = X is a Partner Admin
--     for Club X. With multiple official pools, multiple humans can hold the
--     role — by design (regional admins). Single-source-of-truth control can
--     be layered on later via `partners.primary_pool_id` if needed.
--   • Existing RPCs `join_partner_roster` / `leave_partner_roster` are kept
--     as thin wrappers around the new affiliation RPCs so the mobile clients
--     shipped before the redesign continue to work.
--
-- Hard rules honored:
--   • #8  (RLS always on): policies added on every new table.
--   • #15 (server-side enforcement): all writes via SECURITY DEFINER RPCs.
--   • #23 (partner brand_config copied to pool at creation): every affiliation
--         row carries its own `brand_config_snapshot`. Renderers never join
--         to `partners` for branding.
--   • #24 (Clubs attract Contests, not the reverse): affiliation writes are
--         organizer-side via existing PartnerDirectoryScreen flow; this
--         migration only changes the storage shape.
--
-- Roll forward: additive. New column, new table, new triggers, new RPCs.
--               Backfill from `partners.club_pool_id` and `pools.partner_id`.
--               Legacy columns left in place.
-- Roll back:    DROP TRIGGER ...; DROP FUNCTION ...;
--               DROP TABLE public.pool_partner_affiliations;
--               ALTER TABLE public.pools DROP COLUMN owning_club_id;
--               (partners.club_pool_id and pools.partner_id are untouched.)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. pools.owning_club_id — inverse of the singular partners.club_pool_id
-- ---------------------------------------------------------------------------

ALTER TABLE public.pools
  ADD COLUMN IF NOT EXISTS owning_club_id uuid
    REFERENCES public.partners(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.pools.owning_club_id IS
  'Non-NULL means this pool is an Official Contest of that Club. A Club can have many such pools (e.g., ESPN regional Contests). Mutually exclusive with rows in pool_partner_affiliations — enforced by trigger.';

CREATE INDEX IF NOT EXISTS pools_owning_club_id_idx
  ON public.pools (owning_club_id)
  WHERE owning_club_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. pool_partner_affiliations — many-to-many join with brand snapshot
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pool_partner_affiliations (
  pool_id               uuid        NOT NULL REFERENCES public.pools(id)    ON DELETE CASCADE,
  partner_id            uuid        NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  brand_config_snapshot jsonb       NOT NULL,
  is_primary            boolean     NOT NULL DEFAULT false,
  created_by            uuid        REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pool_id, partner_id)
);

COMMENT ON TABLE public.pool_partner_affiliations IS
  'A Contest can be affiliated with many Clubs (a Gaffer submits to multiple rosters). One row per (pool, club). Snapshot of the Club brand_config at affiliation time — never live-joined to `partners` for rendering (Hard Rule #23). Forbidden on pools where owning_club_id IS NOT NULL — Official Club Contests do not borrow other Clubs'' badges.';

COMMENT ON COLUMN public.pool_partner_affiliations.is_primary IS
  'The affiliation whose brand is featured most prominently on the Contest card (single stripe color, lead logo in the cluster). At most one per pool. Mirrored to pools.partner_id for backwards compat until that column is dropped.';

-- At most one primary affiliation per pool.
CREATE UNIQUE INDEX IF NOT EXISTS pool_partner_affiliations_one_primary_per_pool
  ON public.pool_partner_affiliations (pool_id)
  WHERE is_primary = true;

CREATE INDEX IF NOT EXISTS pool_partner_affiliations_partner_id_idx
  ON public.pool_partner_affiliations (partner_id);

-- ---------------------------------------------------------------------------
-- 3. Cross-table integrity triggers
-- ---------------------------------------------------------------------------
-- Rule: a pool is EITHER an Official Club Contest (owning_club_id set) OR can
-- carry affiliations (rows in pool_partner_affiliations). Never both.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_no_affiliations_on_owned_contests()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_owning_club uuid;
BEGIN
  SELECT owning_club_id INTO v_owning_club
    FROM public.pools
   WHERE id = NEW.pool_id;

  IF v_owning_club IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot affiliate pool %: it is an Official Contest of Club % (owning_club_id set). Official Contests do not carry external affiliations.',
      NEW.pool_id, v_owning_club
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pool_partner_affiliations_block_on_owned
  ON public.pool_partner_affiliations;
CREATE TRIGGER pool_partner_affiliations_block_on_owned
  BEFORE INSERT OR UPDATE OF pool_id ON public.pool_partner_affiliations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_no_affiliations_on_owned_contests();

CREATE OR REPLACE FUNCTION public.enforce_no_owning_club_when_affiliated()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.owning_club_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only enforce on transitions that actually set or change owning_club_id.
  IF TG_OP = 'UPDATE'
     AND OLD.owning_club_id IS NOT DISTINCT FROM NEW.owning_club_id THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pool_partner_affiliations WHERE pool_id = NEW.id
  ) THEN
    RAISE EXCEPTION
      'Cannot set owning_club_id on pool %: it already carries affiliations. Remove affiliations first, or keep it as a roster Contest.',
      NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pools_block_owning_club_when_affiliated ON public.pools;
CREATE TRIGGER pools_block_owning_club_when_affiliated
  BEFORE INSERT OR UPDATE OF owning_club_id ON public.pools
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_no_owning_club_when_affiliated();

-- ---------------------------------------------------------------------------
-- 4. Mirror trigger: pool_partner_affiliations.is_primary → pools.partner_id
-- ---------------------------------------------------------------------------
-- Keeps the legacy singular column in sync with the primary affiliation so
-- mobile clients shipped before the new model keep rendering their stripe.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_primary_affiliation_to_pools_partner_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_pool_id     uuid;
  v_new_partner uuid;
BEGIN
  v_pool_id := COALESCE(NEW.pool_id, OLD.pool_id);

  SELECT partner_id INTO v_new_partner
    FROM public.pool_partner_affiliations
   WHERE pool_id = v_pool_id
     AND is_primary = true
   LIMIT 1;

  UPDATE public.pools
     SET partner_id = v_new_partner
   WHERE id = v_pool_id
     AND partner_id IS DISTINCT FROM v_new_partner;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS pool_partner_affiliations_sync_to_pools
  ON public.pool_partner_affiliations;
CREATE TRIGGER pool_partner_affiliations_sync_to_pools
  AFTER INSERT OR UPDATE OF is_primary, partner_id OR DELETE
  ON public.pool_partner_affiliations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_primary_affiliation_to_pools_partner_id();

-- ---------------------------------------------------------------------------
-- 5. Backfill — partners.club_pool_id → pools.owning_club_id
-- ---------------------------------------------------------------------------

UPDATE public.pools p
   SET owning_club_id = pt.id
  FROM public.partners pt
 WHERE pt.club_pool_id = p.id
   AND p.owning_club_id IS NULL;

-- ---------------------------------------------------------------------------
-- 6. Backfill — pools.partner_id (roster members) → pool_partner_affiliations
-- ---------------------------------------------------------------------------
-- A pool with partner_id set but NOT itself a Club Pool is a roster member.
-- Each becomes a single primary affiliation carrying the existing
-- pools.brand_config as its snapshot.
-- ---------------------------------------------------------------------------

INSERT INTO public.pool_partner_affiliations
  (pool_id, partner_id, brand_config_snapshot, is_primary, created_by, created_at)
SELECT
  p.id,
  p.partner_id,
  COALESCE(p.brand_config, '{}'::jsonb),
  true,
  COALESCE(p.organizer_id, p.created_by),
  p.created_at
FROM public.pools p
WHERE p.partner_id IS NOT NULL
  AND p.owning_club_id IS NULL              -- never on Official Contests
  AND NOT EXISTS (
    SELECT 1 FROM public.pool_partner_affiliations a
     WHERE a.pool_id = p.id AND a.partner_id = p.partner_id
  );

-- ---------------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.pool_partner_affiliations ENABLE ROW LEVEL SECURITY;

-- Any active member of the pool can read its affiliations — Contest cards
-- need this on every render. Non-members do not see affiliation detail
-- (they only see what's on the public invite share sheet).
CREATE POLICY pool_partner_affiliations_select_members
  ON public.pool_partner_affiliations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pool_members pm
       WHERE pm.pool_id = pool_partner_affiliations.pool_id
         AND pm.user_id = auth.uid()
         AND pm.status = 'active'
    )
  );

-- Writes go through the SECURITY DEFINER RPCs in section 8 only. No client
-- write policies — silent RLS-filtered writes are a documented red flag.

-- ---------------------------------------------------------------------------
-- 8. RPCs — organizer-side affiliation management
-- ---------------------------------------------------------------------------

-- Add (or refresh) a Club affiliation on the caller's Contest. Snapshots the
-- Club's current brand_config at write time. If `p_is_primary` is true,
-- demotes any existing primary on this pool.
CREATE OR REPLACE FUNCTION public.add_pool_affiliation(
  p_pool_id    uuid,
  p_partner_id uuid,
  p_is_primary boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id     uuid := auth.uid();
  v_role        text;
  v_owning_club uuid;
  v_partner     partners%ROWTYPE;
  v_first_row   boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'NOT_AUTHENTICATED');
  END IF;

  -- Caller must be an active organizer (or admin) of the pool.
  SELECT role INTO v_role
    FROM pool_members
   WHERE pool_id = p_pool_id
     AND user_id = v_user_id
     AND status = 'active';

  IF v_role NOT IN ('organizer', 'admin') THEN
    RETURN jsonb_build_object('error', 'NOT_ORGANIZER');
  END IF;

  -- Reject affiliations on Official Club Contests (the trigger would also
  -- catch this, but a clean error path is friendlier).
  SELECT owning_club_id INTO v_owning_club FROM pools WHERE id = p_pool_id;
  IF v_owning_club IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'POOL_IS_OFFICIAL_CONTEST');
  END IF;

  SELECT * INTO v_partner FROM partners WHERE id = p_partner_id;
  IF v_partner.id IS NULL OR v_partner.is_active = false THEN
    RETURN jsonb_build_object('error', 'PARTNER_NOT_AVAILABLE');
  END IF;

  -- Decide is_primary: if this is the first affiliation, force true.
  SELECT NOT EXISTS (
    SELECT 1 FROM pool_partner_affiliations WHERE pool_id = p_pool_id
  ) INTO v_first_row;

  IF v_first_row THEN
    p_is_primary := true;
  END IF;

  -- Demote existing primary if we're claiming it.
  IF p_is_primary THEN
    UPDATE pool_partner_affiliations
       SET is_primary = false
     WHERE pool_id = p_pool_id
       AND is_primary = true
       AND partner_id <> p_partner_id;
  END IF;

  INSERT INTO pool_partner_affiliations
    (pool_id, partner_id, brand_config_snapshot, is_primary, created_by)
  VALUES
    (p_pool_id, p_partner_id, COALESCE(v_partner.brand_config, '{}'::jsonb),
     p_is_primary, v_user_id)
  ON CONFLICT (pool_id, partner_id) DO UPDATE
    SET brand_config_snapshot = COALESCE(v_partner.brand_config, '{}'::jsonb),
        is_primary            = EXCLUDED.is_primary;

  RETURN jsonb_build_object('ok', true, 'is_primary', p_is_primary);
END;
$function$;

-- Remove a Club affiliation from the caller's Contest. If the removed row
-- was primary, promote the next-oldest remaining affiliation to primary.
CREATE OR REPLACE FUNCTION public.remove_pool_affiliation(
  p_pool_id    uuid,
  p_partner_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id      uuid := auth.uid();
  v_role         text;
  v_was_primary  boolean;
  v_next_primary uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'NOT_AUTHENTICATED');
  END IF;

  SELECT role INTO v_role
    FROM pool_members
   WHERE pool_id = p_pool_id
     AND user_id = v_user_id
     AND status = 'active';

  IF v_role NOT IN ('organizer', 'admin') THEN
    RETURN jsonb_build_object('error', 'NOT_ORGANIZER');
  END IF;

  SELECT is_primary INTO v_was_primary
    FROM pool_partner_affiliations
   WHERE pool_id = p_pool_id AND partner_id = p_partner_id;

  IF v_was_primary IS NULL THEN
    RETURN jsonb_build_object('error', 'NOT_FOUND');
  END IF;

  DELETE FROM pool_partner_affiliations
   WHERE pool_id = p_pool_id AND partner_id = p_partner_id;

  IF v_was_primary THEN
    SELECT partner_id INTO v_next_primary
      FROM pool_partner_affiliations
     WHERE pool_id = p_pool_id
     ORDER BY created_at ASC
     LIMIT 1;

    IF v_next_primary IS NOT NULL THEN
      UPDATE pool_partner_affiliations
         SET is_primary = true
       WHERE pool_id = p_pool_id AND partner_id = v_next_primary;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 9. Legacy wrappers — keep PartnerDirectoryScreen and any shipped mobile
--    clients working without redeploy.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.join_partner_roster(
  p_pool_id    uuid,
  p_partner_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Old single-Club semantics: each call replaced the previous primary.
  -- Preserve that behavior by forcing is_primary = true. New code paths
  -- that need a non-primary affiliation should call add_pool_affiliation
  -- directly with p_is_primary = false.
  RETURN public.add_pool_affiliation(p_pool_id, p_partner_id, true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.leave_partner_roster(
  p_pool_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_partner_id uuid;
BEGIN
  -- Old semantics: pool had exactly one partner; "leave" removed it.
  -- New model: remove the primary affiliation; if others exist, the
  -- remove_pool_affiliation RPC promotes the next-oldest to primary.
  SELECT partner_id INTO v_partner_id
    FROM pool_partner_affiliations
   WHERE pool_id = p_pool_id
     AND is_primary = true
   LIMIT 1;

  IF v_partner_id IS NULL THEN
    -- Fall back to the legacy mirror column if no affiliation rows exist
    -- (a pool that pre-dates the migration with only pools.partner_id set
    -- — the trigger should have backfilled, but be defensive).
    SELECT partner_id INTO v_partner_id FROM pools WHERE id = p_pool_id;
    IF v_partner_id IS NULL THEN
      RETURN jsonb_build_object('error', 'NOT_AFFILIATED');
    END IF;
    -- Legacy path: clear the mirror column directly.
    UPDATE pools SET partner_id = NULL, brand_config = NULL WHERE id = p_pool_id;
    RETURN jsonb_build_object('ok', true, 'legacy', true);
  END IF;

  RETURN public.remove_pool_affiliation(p_pool_id, v_partner_id);
END;
$function$;
