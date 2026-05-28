-- create_platform_pool
--
-- One-time seed of the hidden Platform Pool. Every Player is
-- auto-enrolled (via the existing trigger_auto_enroll_global_pools)
-- but the pool is `is_hidden_from_users = true` so it doesn't appear
-- in any Player UI — only super-admin Pool Management can see it.
--
-- Purpose: analytics baseline. Staff can read engagement, retention,
-- behavioral signals without Players seeing each other's activity in
-- a giant communal pool. Also used as the in-app delivery target for
-- platform-wide admin broadcasts (which write organizer_notifications
-- rows attached to this pool).
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_admin uuid;
  v_pool_id uuid;
  v_existing uuid;
BEGIN
  -- Find the super-admin to attribute the pool to. Falls back to NULL
  -- (which most pool insert paths tolerate) if no super-admin exists.
  SELECT id INTO v_admin FROM profiles WHERE is_super_admin = true ORDER BY created_at LIMIT 1;

  -- Idempotent — only create if no hidden global pool exists yet.
  SELECT id INTO v_existing
    FROM pools
   WHERE is_global = true
     AND is_hidden_from_users = true
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE NOTICE 'Platform Pool already exists (%); skipping create', v_existing;
  ELSE
    INSERT INTO pools (
      id, name, competition, created_by, organizer_id,
      is_public, is_global, is_hidden_from_users,
      status, member_limit, is_founding_pool
    ) VALUES (
      gen_random_uuid(),
      'Platform Pool',
      'nfl_2026',
      v_admin,
      v_admin,
      false,
      true,
      true,
      'active',
      NULL,
      false
    )
    RETURNING id INTO v_pool_id;

    -- Backfill: enroll every existing user into the new pool.
    INSERT INTO pool_members (pool_id, user_id, role, status)
    SELECT v_pool_id, p.id, 'member', 'active' FROM profiles p
    ON CONFLICT (pool_id, user_id) DO NOTHING;

    RAISE NOTICE 'Created Platform Pool % and backfilled members', v_pool_id;
  END IF;
END $$;
