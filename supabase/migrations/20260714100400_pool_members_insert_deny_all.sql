-- pool_members_insert → deny-all  (Gaffer Approval Gate — Stage 1 · Hard Rule #15)
--
-- Closes the self-activation hole: the prior policy `WITH CHECK (user_id =
-- auth.uid())` let a client directly INSERT a pool_members row as
-- status='active', skipping the gate AND the cap. Audit (2026-07-14) confirmed
-- NO client path inserts pool_members directly — every legitimate write is a
-- SECURITY DEFINER RPC (create_pool, join_pool_by_invite, join_public_contest,
-- admin/delegation fns) that bypasses RLS. So denying ALL direct client INSERT
-- breaks nothing and forces all membership creation server-side.
--
-- NOTE (on record, not a silent gap): pool_members_select is USING(true) — any
-- authenticated user can still READ any pool's membership rows, including
-- status='pending'. Pending-applicant invisibility is therefore CLIENT-enforced
-- only (read paths filter status='active'); RLS-level read enforcement is
-- deferred as a larger membership-read refactor. See LAUNCH_READINESS backlog.

DROP POLICY IF EXISTS pool_members_insert ON public.pool_members;
CREATE POLICY pool_members_insert ON public.pool_members
  FOR INSERT
  TO authenticated
  WITH CHECK (false);
