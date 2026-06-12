-- Operator Console Phase 2 — tester-account flag.
-- Spec: 260612_HotPick_OperatorConsole_Phase2_Spec §4a.
--
-- One additive column on profiles. Set to TRUE only by the bypass-tester-signup
-- Edge Function (service role) at account creation; never settable by the client
-- (no UPDATE policy grants it, and existing profiles RLS covers the read). Drives:
--   * auto-pick scoping in sim-operator (auto_pick_tom is Tom-only, but the flag
--     marks the wider tester cohort for lifetime-stat exclusion later),
--   * the leaderboard TEST badge in the Operator Console,
--   * the "Test Account — Sim Only" banner on the app Home Screen.
--
-- Safe additive change: NOT NULL DEFAULT false uses Postgres's fast default
-- (no table rewrite). No data migration.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_test_account boolean NOT NULL DEFAULT false;

-- Partial index — only tester rows are ever filtered on (small cohort, ≤10).
CREATE INDEX IF NOT EXISTS idx_profiles_is_test_account
  ON public.profiles (is_test_account)
  WHERE is_test_account = true;

COMMENT ON COLUMN public.profiles.is_test_account IS
  'Tester account flag. Set true only by bypass-tester-signup (service role) at '
  'creation; never client-settable. Excludes the account from lifetime stats and '
  'marks it in operator tooling. See Operator Console Phase 2 spec §4a.';
