-- smack_messages pending gate  (Gaffer Approval Gate — Stage 1)
--
-- A pending applicant must NOT read or post Chirps before approval. The current
-- SELECT and INSERT policies gate on pool membership WITHOUT a status filter, so
-- a status='pending' row satisfies them. The ONLY change vs the LIVE policy
-- bodies (pulled from pg_policies) is `AND status = 'active'` on the membership
-- subquery. Everything else — the `(select auth.uid())` initplan wrapping, both
-- suspension checks on INSERT, the role scopes (SELECT=authenticated,
-- INSERT=public), unqualified table refs — is reproduced verbatim. The third
-- policy, "Pool members can flag messages" (UPDATE), already gates on
-- status='active' and is intentionally left untouched.

-- SELECT (roles: authenticated) — verbatim + `AND status = 'active'`.
DROP POLICY IF EXISTS smack_messages_select ON public.smack_messages;
CREATE POLICY smack_messages_select ON public.smack_messages
  FOR SELECT
  TO authenticated
  USING (
    pool_id IN (
      SELECT pool_id FROM pool_members
       WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  );

-- INSERT (roles: public) — verbatim + `AND status = 'active'`; both suspension
-- clauses preserved exactly.
DROP POLICY IF EXISTS smack_messages_insert ON public.smack_messages;
CREATE POLICY smack_messages_insert ON public.smack_messages
  FOR INSERT
  TO public
  WITH CHECK (
    user_id = (select auth.uid())
    AND pool_id IN (
      SELECT pool_id FROM pool_members
       WHERE user_id = (select auth.uid()) AND status = 'active'
    )
    AND NOT EXISTS (
      SELECT 1 FROM pools
       WHERE id = smack_messages.pool_id AND is_suspended = true
    )
    AND NOT COALESCE(
      (SELECT is_platform_suspended FROM profiles WHERE id = (select auth.uid())),
      false)
  );
