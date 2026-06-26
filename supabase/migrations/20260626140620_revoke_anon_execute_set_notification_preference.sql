-- Lock set_notification_preference to authenticated callers only.
-- The function self-guards (raises not_authenticated when auth.uid() is NULL), but
-- Supabase default privileges auto-grant EXECUTE to anon on newly created functions,
-- so the original migration's REVOKE ... FROM PUBLIC did not remove the named anon
-- grant. This aligns the grants with the function's documented intent and the
-- project's revoke_anon_execute_* convention for sensitive SECURITY DEFINER RPCs.
REVOKE EXECUTE ON FUNCTION public.set_notification_preference(text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_notification_preference(text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_notification_preference(text, boolean) TO authenticated;
