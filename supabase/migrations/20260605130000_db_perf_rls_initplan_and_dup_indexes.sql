-- db_perf_rls_initplan_and_dup_indexes
--
-- Performance pass surfaced by the Supabase performance advisor.
--
-- 1. auth_rls_initplan (63 policies across 37 tables): RLS policies that call
--    auth.uid()/auth.role()/current_setting() bare re-evaluate them once PER
--    ROW. Wrapping the call in a scalar subquery — ( SELECT auth.uid() ) — lets
--    the planner evaluate it once per query (InitPlan). Identical semantics,
--    large win on big scans. Applied dynamically to every flagged public
--    policy; skips already-wrapped ones so it is safe to re-run / on fresh
--    deploys. The whole block is one transaction: if any rewrite is malformed
--    it aborts and nothing changes (all-or-nothing).
--
-- 2. duplicate_index: drop the redundant copies. partners keeps its unique
--    constraint index (partners_slug_key); the bare idx_partners_slug is a
--    duplicate. smack_messages has two identical (pool_id, created_at DESC)
--    indexes — keep one.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r    record;
  stmt text;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND ( (qual IS NOT NULL AND (qual ~ 'auth\.(uid|role|jwt|email)\(' OR qual ~ 'current_setting'))
         OR (with_check IS NOT NULL AND (with_check ~ 'auth\.(uid|role|jwt|email)\(' OR with_check ~ 'current_setting')) )
      AND NOT (coalesce(qual, '') ~ 'SELECT auth' OR coalesce(with_check, '') ~ 'SELECT auth')
  LOOP
    stmt := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    IF r.qual IS NOT NULL THEN
      stmt := stmt || ' USING (' || regexp_replace(regexp_replace(r.qual,
        'auth\.(uid|role|jwt|email)\(\)', '( SELECT auth.\1() )', 'g'),
        'current_setting\(([^()]*)\)', '( SELECT current_setting(\1) )', 'g') || ')';
    END IF;
    IF r.with_check IS NOT NULL THEN
      stmt := stmt || ' WITH CHECK (' || regexp_replace(regexp_replace(r.with_check,
        'auth\.(uid|role|jwt|email)\(\)', '( SELECT auth.\1() )', 'g'),
        'current_setting\(([^()]*)\)', '( SELECT current_setting(\1) )', 'g') || ')';
    END IF;
    EXECUTE stmt;
  END LOOP;
END $$;

-- Redundant duplicate indexes (neither backs a constraint).
DROP INDEX IF EXISTS public.idx_partners_slug;
DROP INDEX IF EXISTS public.idx_smack_messages_created;
