-- =====================================================================
-- Defense-in-depth: pin search_path on the two remaining SECURITY DEFINER
-- "finisher" functions to the hardened ordering used by the rest of the
-- privileged surface (pg_catalog first), matching migration
-- 20260608153000_revoke_anon_execute_and_pin_search_path.sql.
--
-- Both are already locked to service_role/postgres EXECUTE only (the #233
-- revoke covered them) and already SET search_path = public — so this is not a
-- vulnerability fix, just consistency: pg_catalog-first prevents a shadowed
-- built-in (e.g. a malicious public.now()) from ever resolving ahead of the
-- catalog inside a SECURITY DEFINER body.
--
-- ALTER (not CREATE OR REPLACE) so the function bodies are untouched.
--   anonymize_deleted_user(uuid)            -- delete-account anonymization
--   finalize_latest_completed_week(text)    -- weekly finalize finisher
-- =====================================================================
ALTER FUNCTION public.anonymize_deleted_user(uuid)
  SET search_path TO 'pg_catalog', 'public', 'extensions';

ALTER FUNCTION public.finalize_latest_completed_week(text)
  SET search_path TO 'pg_catalog', 'public', 'extensions';
