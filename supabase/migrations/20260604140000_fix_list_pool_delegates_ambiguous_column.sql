-- fix_list_pool_delegates_ambiguous_column
--
-- list_pool_delegates() RETURNS TABLE (user_id, email, role, status), which
-- makes those names PL/pgSQL variables for the whole function body. The
-- auth-check query referenced user_id / role / status UNqualified, so Postgres
-- raised "column reference \"user_id\" is ambiguous" on every call. The client
-- swallowed the error and rendered an empty list — so no delegates (pending or
-- active) ever showed.
--
-- Fix: alias pool_members (pm) and qualify the columns in the auth check.
-- Behaviour is otherwise identical to 20260604130000.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_pool_delegates(p_pool_id uuid)
RETURNS TABLE (user_id uuid, email text, role text, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    EXISTS (SELECT 1 FROM public.profiles
             WHERE id = auth.uid() AND is_super_admin = true)
    OR EXISTS (SELECT 1 FROM public.pool_members pm
                WHERE pm.pool_id = p_pool_id AND pm.user_id = auth.uid()
                  AND pm.role IN ('organizer', 'admin') AND pm.status = 'active')
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
    SELECT pm.user_id, u.email::text, pm.role, 'active'::text
      FROM public.pool_members pm
      JOIN auth.users u ON u.id = pm.user_id
     WHERE pm.pool_id = p_pool_id
       AND pm.role IN ('organizer', 'admin')
       AND pm.status = 'active'
    UNION ALL
    SELECT NULL::uuid, prg.email, prg.role, 'pending'::text
      FROM public.pending_role_grants prg
     WHERE prg.pool_id = p_pool_id
       AND prg.claimed_at IS NULL
     ORDER BY 4, 3, 2;
END;
$$;
