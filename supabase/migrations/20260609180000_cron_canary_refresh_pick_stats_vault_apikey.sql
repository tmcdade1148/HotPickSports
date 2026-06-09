-- =====================================================================
-- Stage 4 (CANARY) of service_role key rotation — cron auth via new key.
--
-- Repoints ONE cron job (refresh-game-pick-stats, every minute) from the leaked
-- legacy service_role JWT in `Authorization: Bearer` to the new sb_secret_ key,
-- read from Vault BY REFERENCE and sent in the `apikey` header.
--
-- The secret VALUE is never in this file or the apply call — only the Vault name
-- `sb_secret_key`. This is the canary for the verify_jwt + apikey question: all
-- these functions have verify_jwt=true; we prove the gateway accepts an apikey-only
-- call on a fast-cycling job before rolling the remaining 11 jobs.
--
-- Verify after apply:
--   SELECT status, return_message, start_time
--   FROM cron.job_run_details
--   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname='refresh-game-pick-stats')
--   ORDER BY start_time DESC LIMIT 3;
--   -> expect status 'succeeded' and the http_post 200 within ~1 minute.
-- If it fails (gateway rejects apikey on a verify_jwt=true function), the fix is to
-- set that function's verify_jwt=false (it is gated by the secret) — decided on the
-- canary result, not assumed — before writing the remaining-11 migration.
-- =====================================================================

SELECT cron.schedule(
  'refresh-game-pick-stats',
  '* * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://mzqtrpdiqhopjmxjccwy.supabase.co/functions/v1/refresh-game-pick-stats',
    headers := jsonb_build_object(
      'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'sb_secret_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('competition', 'nfl_2026')
  );
  $job$
);
