-- =====================================================================
-- Stage 4 of service_role key rotation — repoint ALL 12 cron jobs off the
-- leaked legacy service_role JWT.
--
-- Each job now authenticates to its (verify_jwt=false) Edge Function with the
-- DEDICATED cron shared secret, sent in the `x-cron-secret` header and read from
-- Vault BY REFERENCE (`cron_shared_secret`). No secret value appears in this
-- file, in the apply call, or in the stored cron command (only the Vault name).
--
-- Prereqs (must be true before applying):
--   * The 12 functions are deployed with verify_jwt=false + the in-body
--     x-cron-secret gate (canary refresh-game-pick-stats verified: 200 with the
--     secret, 401 without).
--   * Vault secret `cron_shared_secret` == Edge Function Secret CRON_SHARED_SECRET.
--
-- After applying, verify:
--   SELECT j.jobname, d.status, d.start_time
--   FROM cron.job_run_details d JOIN cron.job j USING (jobid)
--   WHERE d.start_time > now() - interval '10 min'
--   ORDER BY d.start_time DESC;
--   -> all jobs 'succeeded' with HTTP 200.
-- =====================================================================

-- helper inlined per job: (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_shared_secret')

SELECT cron.schedule('nfl-import-schedule', '0 5 * * 2', $job$
  SELECT net.http_post(
    url := 'https://mzqtrpdiqhopjmxjccwy.supabase.co/functions/v1/nfl-import-schedule',
    headers := jsonb_build_object('x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_shared_secret'), 'Content-Type', 'application/json'),
    body := jsonb_build_object('competition','nfl_2026')
  );
$job$);

SELECT cron.schedule('nfl-finalize-week', '0 6 * * 2', $job$
  SELECT net.http_post(
    url := 'https://mzqtrpdiqhopjmxjccwy.supabase.co/functions/v1/nfl-finalize-week',
    headers := jsonb_build_object('x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_shared_secret'), 'Content-Type', 'application/json'),
    body := jsonb_build_object('competition','nfl_2026')
  );
$job$);

SELECT cron.schedule('nfl-fetch-odds', '0 10 * * 2', $job$
  SELECT net.http_post(
    url := 'https://mzqtrpdiqhopjmxjccwy.supabase.co/functions/v1/nfl-fetch-odds',
    headers := jsonb_build_object('x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_shared_secret'), 'Content-Type', 'application/json'),
    body := jsonb_build_object('competition','nfl_2026')
  );
$job$);

SELECT cron.schedule('nfl-rank-games', '15 10 * * 2', $job$
  SELECT net.http_post(
    url := 'https://mzqtrpdiqhopjmxjccwy.supabase.co/functions/v1/nfl-rank-games',
    headers := jsonb_build_object('x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_shared_secret'), 'Content-Type', 'application/json'),
    body := jsonb_build_object('competition','nfl_2026')
  );
$job$);

SELECT cron.schedule('nfl-open-picks', '0 11 * * 2', $job$
  SELECT net.http_post(
    url := 'https://mzqtrpdiqhopjmxjccwy.supabase.co/functions/v1/nfl-open-picks',
    headers := jsonb_build_object('x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_shared_secret'), 'Content-Type', 'application/json'),
    body := jsonb_build_object('competition','nfl_2026')
  );
$job$);

SELECT cron.schedule('nfl-update-scores', '*/5 * * * *', $job$
  SELECT net.http_post(
    url := 'https://mzqtrpdiqhopjmxjccwy.supabase.co/functions/v1/nfl-update-scores',
    headers := jsonb_build_object('x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_shared_secret'), 'Content-Type', 'application/json'),
    body := jsonb_build_object('competition','nfl_2026')
  );
$job$);

SELECT cron.schedule('nfl-calculate-scores', '*/30 * * * *', $job$
  SELECT net.http_post(
    url := 'https://mzqtrpdiqhopjmxjccwy.supabase.co/functions/v1/nfl-calculate-scores',
    headers := jsonb_build_object('x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_shared_secret'), 'Content-Type', 'application/json'),
    body := jsonb_build_object('competition','nfl_2026','auto_detect',true)
  );
$job$);

SELECT cron.schedule('smack-archive-messages', '0 4 * * *', $job$
  SELECT net.http_post(
    url := 'https://mzqtrpdiqhopjmxjccwy.supabase.co/functions/v1/smack-archive-messages',
    headers := jsonb_build_object('x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_shared_secret'), 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
$job$);

SELECT cron.schedule('refresh-game-pick-stats', '* * * * *', $job$
  SELECT net.http_post(
    url := 'https://mzqtrpdiqhopjmxjccwy.supabase.co/functions/v1/refresh-game-pick-stats',
    headers := jsonb_build_object('x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_shared_secret'), 'Content-Type', 'application/json'),
    body := jsonb_build_object('competition','nfl_2026')
  );
$job$);

SELECT cron.schedule('compute-hardware-weekly', '5,35 * * * *', $job$
  SELECT net.http_post(
    url := 'https://mzqtrpdiqhopjmxjccwy.supabase.co/functions/v1/compute-hardware',
    headers := jsonb_build_object('x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_shared_secret'), 'Content-Type', 'application/json'),
    body := jsonb_build_object('trigger','weekly_settle','competition','nfl_2026','season_year',2026)
  );
$job$);

SELECT cron.schedule('espn-health-check', '17 * * * *', $job$
  SELECT net.http_post(
    url := 'https://mzqtrpdiqhopjmxjccwy.supabase.co/functions/v1/espn-health-check',
    headers := jsonb_build_object('x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_shared_secret'), 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
$job$);

SELECT cron.schedule('process-notification-queue', '* * * * *', $job$
  SELECT net.http_post(
    url := 'https://mzqtrpdiqhopjmxjccwy.supabase.co/functions/v1/process-notification-queue',
    headers := jsonb_build_object('x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_shared_secret'), 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
$job$);
