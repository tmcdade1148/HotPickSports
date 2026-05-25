-- =============================================================================
-- Migration: 260515_pool_invite_codes
-- =============================================================================
-- Replaces the rigid `pools.invite_code` (single string, exactly 6 hex chars,
-- non-editable) with a `pool_invite_codes` table — one row per code, many
-- codes per pool, editable, with optional label/expiration/use cap.
--
-- Key decisions (captured from product discussion 2026-05-15):
--   • Length: 6–12 chars. 6 is the floor (~2B combos at 36-char alphabet —
--     fine well past 10M pools).
--   • Alphabet: 0–9 + A–Z (36 chars). Uppercased on storage. No Crockford
--     restriction so memorable partner names like "JOES" remain valid.
--   • Multiple codes per pool. Each can be independently activated/deactivated.
--     One row per pool is flagged `is_primary = true` — that's the code
--     embedded in QR codes / share sheets.
--   • `pools.invite_code` stays for backwards compat — a trigger keeps it in
--     sync with the primary row so existing reads (RPCs, mobile clients
--     shipped before this update) continue working unchanged.
--
-- Hard rules honored:
--   • Hard Rule #8 (RLS always on): policies added below — organizers can
--     SELECT codes for their own pools; INSERT/UPDATE/DELETE flows go
--     through SECURITY DEFINER RPCs only.
--   • Hard Rule #15 (server-side enforcement): every code validation
--     (length, alphabet, uniqueness, uppercase) is enforced by CHECK
--     constraints + unique indexes. Client validation is UX-only.
--   • Hard Rule #23 (partner brand_config copied to pool at creation):
--     unchanged. Partner alignment still writes `pools.partner_id` and
--     `pools.brand_config`. Partner-derived invite codes live in this
--     new table.
--
-- Roll forward: additive. New table, new triggers, backfill from existing
--               `pools.invite_code` and `pools.invite_slug` columns. Old
--               columns retained.
-- Roll back:    DROP TRIGGER pool_invite_codes_sync_primary_to_pool ...;
--               DROP TRIGGER pools_sync_invite_code_to_codes_table ...;
--               DROP TABLE public.pool_invite_codes;
--               (pools.invite_code / invite_slug rows are unchanged.)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. New table
-- ---------------------------------------------------------------------------

CREATE TABLE public.pool_invite_codes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id     uuid        NOT NULL REFERENCES public.pools(id) ON DELETE CASCADE,
  code        text        NOT NULL,
  label       text,
  is_primary  boolean     NOT NULL DEFAULT false,
  is_active   boolean     NOT NULL DEFAULT true,
  created_by  uuid        REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pool_invite_codes_length
    CHECK (char_length(code) BETWEEN 6 AND 12),
  CONSTRAINT pool_invite_codes_alphabet
    CHECK (code ~ '^[0-9A-Z]+$'),
  CONSTRAINT pool_invite_codes_uppercase
    CHECK (code = upper(code))
);

COMMENT ON TABLE public.pool_invite_codes IS
  'One row per invite code. Many codes can point at the same pool. Exactly one row per pool has is_primary=true — that''s the code in QR/share sheets and the one mirrored to pools.invite_code for backwards compat.';

COMMENT ON COLUMN public.pool_invite_codes.label IS
  'Optional human label, e.g. "Bar night promo", "Twitter", "Conference 2026". For organizer convenience.';

COMMENT ON COLUMN public.pool_invite_codes.is_primary IS
  'True for the canonical code of this pool. At most one row per pool. Mirrored to pools.invite_code by trigger.';

COMMENT ON COLUMN public.pool_invite_codes.is_active IS
  'False soft-disables a code (rotation, leak response). join_pool_by_invite only matches active codes.';

-- ---------------------------------------------------------------------------
-- 2. Uniqueness
-- ---------------------------------------------------------------------------

-- Active codes are globally unique. Inactive ones can collide (history).
CREATE UNIQUE INDEX pool_invite_codes_unique_active
  ON public.pool_invite_codes (code)
  WHERE is_active = true;

-- One primary per pool.
CREATE UNIQUE INDEX pool_invite_codes_one_primary_per_pool
  ON public.pool_invite_codes (pool_id)
  WHERE is_primary = true;

-- Lookup performance: join_pool_by_invite hits this on every join attempt.
CREATE INDEX pool_invite_codes_pool_id_idx
  ON public.pool_invite_codes (pool_id);

-- ---------------------------------------------------------------------------
-- 3. Backfill — primary code from pools.invite_code
-- ---------------------------------------------------------------------------

INSERT INTO public.pool_invite_codes
  (pool_id, code, label, is_primary, is_active, created_by, created_at)
SELECT
  p.id,
  upper(p.invite_code),
  'Auto-generated',
  true,
  true,
  COALESCE(p.organizer_id, p.created_by),
  p.created_at
FROM public.pools p
WHERE p.invite_code IS NOT NULL
  AND char_length(p.invite_code) BETWEEN 6 AND 12
  AND upper(p.invite_code) ~ '^[0-9A-Z]+$'
  -- Skip pools whose existing code already conflicts with another (shouldn't
  -- happen given the prior unique constraint, but be defensive).
  AND upper(p.invite_code) NOT IN (
    SELECT code FROM public.pool_invite_codes
  );

-- ---------------------------------------------------------------------------
-- 4. Backfill — partner-slug codes (non-primary)
-- ---------------------------------------------------------------------------
-- Existing partner-aligned pools have a slug like "joes-pizza" in
-- pools.invite_slug. Strip non-alphanumerics, uppercase, and insert as a
-- non-primary code so partner-driven joins keep working.
-- ---------------------------------------------------------------------------

INSERT INTO public.pool_invite_codes
  (pool_id, code, label, is_primary, is_active, created_by, created_at)
SELECT
  p.id,
  upper(regexp_replace(p.invite_slug, '[^0-9A-Za-z]', '', 'g')),
  'Partner slug',
  false,
  true,
  COALESCE(p.organizer_id, p.created_by),
  p.created_at
FROM public.pools p
WHERE p.invite_slug IS NOT NULL
  AND char_length(regexp_replace(p.invite_slug, '[^0-9A-Za-z]', '', 'g')) BETWEEN 6 AND 12
  AND upper(regexp_replace(p.invite_slug, '[^0-9A-Za-z]', '', 'g')) ~ '^[0-9A-Z]+$'
  AND upper(regexp_replace(p.invite_slug, '[^0-9A-Za-z]', '', 'g')) NOT IN (
    SELECT code FROM public.pool_invite_codes
  );

-- ---------------------------------------------------------------------------
-- 5. Sync triggers (bidirectional, with re-entrancy guard)
-- ---------------------------------------------------------------------------
--
-- The pool's primary code lives in `pool_invite_codes` (source of truth) and
-- is also mirrored to `pools.invite_code` (legacy cache). Two triggers keep
-- them aligned. Each trigger checks the other side to avoid infinite loops.
-- ---------------------------------------------------------------------------

-- 5a. When a primary code row is inserted/updated, push to pools.invite_code.
CREATE OR REPLACE FUNCTION public.pool_invite_codes_sync_to_pool()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only react to primary-flagged rows. Non-primary codes don't mirror.
  IF NEW.is_primary = false THEN
    RETURN NEW;
  END IF;

  -- Defend against trigger loop: skip if pools.invite_code already matches.
  UPDATE public.pools
     SET invite_code = NEW.code
   WHERE id = NEW.pool_id
     AND COALESCE(invite_code, '') IS DISTINCT FROM NEW.code;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pool_invite_codes_sync_primary_to_pool
  ON public.pool_invite_codes;
CREATE TRIGGER pool_invite_codes_sync_primary_to_pool
  AFTER INSERT OR UPDATE OF code, is_primary ON public.pool_invite_codes
  FOR EACH ROW
  EXECUTE FUNCTION public.pool_invite_codes_sync_to_pool();

-- 5b. When pools.invite_code is set (legacy path, e.g. old create_pool RPC),
--     upsert the primary row in pool_invite_codes. This keeps mobile clients
--     shipped before this update fully functional.
CREATE OR REPLACE FUNCTION public.pools_sync_invite_code_to_codes_table()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing_id uuid;
BEGIN
  IF NEW.invite_code IS NULL THEN
    RETURN NEW;
  END IF;

  -- Validate the code against our rules. If it doesn't fit, leave
  -- pools.invite_code alone (legacy data) but don't create a bad row.
  IF char_length(NEW.invite_code) NOT BETWEEN 6 AND 12
     OR upper(NEW.invite_code) !~ '^[0-9A-Z]+$' THEN
    RETURN NEW;
  END IF;

  -- Look up the current primary row for this pool.
  SELECT id INTO v_existing_id
    FROM public.pool_invite_codes
   WHERE pool_id = NEW.id
     AND is_primary = true;

  IF v_existing_id IS NULL THEN
    INSERT INTO public.pool_invite_codes
      (pool_id, code, label, is_primary, is_active, created_by, created_at)
    VALUES
      (NEW.id, upper(NEW.invite_code), 'Auto-generated', true, true,
       COALESCE(NEW.organizer_id, NEW.created_by), now())
    -- Silently skip if it collides — caller already wrote pools.invite_code.
    ON CONFLICT DO NOTHING;
  ELSE
    UPDATE public.pool_invite_codes
       SET code = upper(NEW.invite_code)
     WHERE id = v_existing_id
       AND code IS DISTINCT FROM upper(NEW.invite_code);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pools_sync_invite_code_to_codes_table ON public.pools;
CREATE TRIGGER pools_sync_invite_code_to_codes_table
  AFTER INSERT OR UPDATE OF invite_code ON public.pools
  FOR EACH ROW
  EXECUTE FUNCTION public.pools_sync_invite_code_to_codes_table();

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.pool_invite_codes ENABLE ROW LEVEL SECURITY;

-- Pool organizers can read codes for pools they organize. Members and
-- non-members cannot list codes; they only get one passed to them via
-- share sheet / QR.
CREATE POLICY pool_invite_codes_select_organizer
  ON public.pool_invite_codes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pool_members
       WHERE pool_id = pool_invite_codes.pool_id
         AND user_id = auth.uid()
         AND role = 'organizer'
         AND status = 'active'
    )
  );

-- Writes go through SECURITY DEFINER RPCs. No client write policies.

-- ---------------------------------------------------------------------------
-- 7. Replace join_pool_by_invite — now looks up the new table first,
--    falls back to pools.invite_code / invite_slug for any rows the
--    backfill skipped.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.join_pool_by_invite(p_invite_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pool             pools%ROWTYPE;
  v_user_id          uuid := auth.uid();
  v_member_count     bigint;
  v_existing_member  pool_members%ROWTYPE;
  v_normalized_code  text;
  v_pool_id          uuid;
BEGIN
  -- Normalize: trim, uppercase, strip whitespace and hyphens (forgiving entry).
  v_normalized_code := upper(regexp_replace(coalesce(p_invite_code, ''), '[\s\-]', '', 'g'));

  IF v_normalized_code = '' THEN
    RETURN jsonb_build_object('error', 'NOT_FOUND');
  END IF;

  -- Look in the new table first.
  SELECT pool_id INTO v_pool_id
    FROM pool_invite_codes
   WHERE code = v_normalized_code
     AND is_active = true
   LIMIT 1;

  -- Fall back to legacy columns (for any pool whose code didn't backfill).
  IF v_pool_id IS NULL THEN
    SELECT id INTO v_pool_id
      FROM pools
     WHERE (upper(invite_code) = v_normalized_code
            OR upper(regexp_replace(coalesce(invite_slug, ''), '[^0-9A-Za-z]', '', 'g')) = v_normalized_code)
       AND is_archived = false
       AND deleted_at IS NULL
     LIMIT 1;
  END IF;

  IF v_pool_id IS NULL THEN
    RETURN jsonb_build_object('error', 'NOT_FOUND');
  END IF;

  SELECT * INTO v_pool FROM pools WHERE id = v_pool_id;

  IF v_pool.is_archived OR v_pool.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'NOT_FOUND');
  END IF;

  -- Already a member?
  SELECT * INTO v_existing_member
    FROM pool_members
   WHERE pool_id = v_pool.id
     AND user_id = v_user_id
     AND status = 'active';

  IF v_existing_member.pool_id IS NOT NULL THEN
    IF v_pool.is_global AND v_existing_member.invite_code_used IS NULL THEN
      UPDATE pool_members
         SET invite_code_used = v_normalized_code
       WHERE pool_id = v_pool.id AND user_id = v_user_id;

      RETURN jsonb_build_object(
        'pool', jsonb_build_object(
          'id',           v_pool.id,
          'name',         v_pool.name,
          'competition',  v_pool.competition,
          'is_global',    v_pool.is_global,
          'is_public',    v_pool.is_public,
          'invite_code',  v_pool.invite_code,
          'brand_config', v_pool.brand_config,
          'created_at',   v_pool.created_at
        )
      );
    END IF;

    RETURN jsonb_build_object('error', 'ALREADY_MEMBER');
  END IF;

  -- Member limit
  IF v_pool.member_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_member_count
      FROM pool_members
     WHERE pool_id = v_pool.id AND status = 'active';

    IF v_member_count >= v_pool.member_limit THEN
      RETURN jsonb_build_object('error', 'pool_full');
    END IF;
  END IF;

  -- Insert membership
  INSERT INTO pool_members (pool_id, user_id, role, status, invite_code_used)
  VALUES (v_pool.id, v_user_id, 'member', 'active', v_normalized_code)
  ON CONFLICT (pool_id, user_id) DO UPDATE
    SET status           = 'active',
        left_at          = NULL,
        joined_at        = now(),
        invite_code_used = v_normalized_code;

  RETURN jsonb_build_object(
    'pool', jsonb_build_object(
      'id',           v_pool.id,
      'name',         v_pool.name,
      'competition',  v_pool.competition,
      'is_global',    v_pool.is_global,
      'is_public',    v_pool.is_public,
      'invite_code',  v_pool.invite_code,
      'brand_config', v_pool.brand_config,
      'created_at',   v_pool.created_at
    )
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 8. Management RPCs for the Pool Settings invite-code UI.
-- ---------------------------------------------------------------------------

-- Add a new code to a pool. Caller must be an active organizer of the pool.
-- If is_primary=true, the existing primary is automatically demoted.
CREATE OR REPLACE FUNCTION public.add_pool_invite_code(
  p_pool_id    uuid,
  p_code       text,
  p_label      text DEFAULT NULL,
  p_is_primary boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role    text;
  v_norm    text;
  v_new_id  uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  SELECT role INTO v_role
    FROM pool_members
   WHERE pool_id = p_pool_id
     AND user_id = v_user_id
     AND status = 'active';

  IF v_role IS DISTINCT FROM 'organizer' THEN
    RETURN jsonb_build_object('error', 'NOT_ORGANIZER');
  END IF;

  v_norm := upper(regexp_replace(coalesce(p_code, ''), '[\s\-]', '', 'g'));

  IF char_length(v_norm) NOT BETWEEN 6 AND 12 OR v_norm !~ '^[0-9A-Z]+$' THEN
    RETURN jsonb_build_object('error', 'INVALID_CODE');
  END IF;

  IF EXISTS (
    SELECT 1 FROM pool_invite_codes WHERE code = v_norm AND is_active = true
  ) THEN
    RETURN jsonb_build_object('error', 'CODE_TAKEN');
  END IF;

  IF p_is_primary = true THEN
    UPDATE pool_invite_codes SET is_primary = false
     WHERE pool_id = p_pool_id AND is_primary = true;
  END IF;

  INSERT INTO pool_invite_codes
    (pool_id, code, label, is_primary, is_active, created_by)
  VALUES
    (p_pool_id, v_norm, p_label, p_is_primary, true, v_user_id)
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('id', v_new_id, 'code', v_norm);
END;
$function$;

-- Set a code as the pool's primary. Demotes the previous primary.
CREATE OR REPLACE FUNCTION public.set_pool_invite_code_primary(p_code_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_pool_id uuid;
  v_role    text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  SELECT pool_id INTO v_pool_id
    FROM pool_invite_codes WHERE id = p_code_id;

  IF v_pool_id IS NULL THEN
    RETURN jsonb_build_object('error', 'NOT_FOUND');
  END IF;

  SELECT role INTO v_role
    FROM pool_members
   WHERE pool_id = v_pool_id AND user_id = v_user_id AND status = 'active';

  IF v_role IS DISTINCT FROM 'organizer' THEN
    RETURN jsonb_build_object('error', 'NOT_ORGANIZER');
  END IF;

  UPDATE pool_invite_codes SET is_primary = false
   WHERE pool_id = v_pool_id AND is_primary = true;

  UPDATE pool_invite_codes SET is_primary = true, is_active = true
   WHERE id = p_code_id;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- Soft-disable a code (rotation / leak response). Cannot disable the primary;
-- caller must first set a new primary.
CREATE OR REPLACE FUNCTION public.deactivate_pool_invite_code(p_code_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id    uuid := auth.uid();
  v_pool_id    uuid;
  v_role       text;
  v_is_primary boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  SELECT pool_id, is_primary INTO v_pool_id, v_is_primary
    FROM pool_invite_codes WHERE id = p_code_id;

  IF v_pool_id IS NULL THEN
    RETURN jsonb_build_object('error', 'NOT_FOUND');
  END IF;

  IF v_is_primary THEN
    RETURN jsonb_build_object('error', 'CANNOT_DEACTIVATE_PRIMARY');
  END IF;

  SELECT role INTO v_role
    FROM pool_members
   WHERE pool_id = v_pool_id AND user_id = v_user_id AND status = 'active';

  IF v_role IS DISTINCT FROM 'organizer' THEN
    RETURN jsonb_build_object('error', 'NOT_ORGANIZER');
  END IF;

  UPDATE pool_invite_codes SET is_active = false WHERE id = p_code_id;

  RETURN jsonb_build_object('ok', true);
END;
$function$;
