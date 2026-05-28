-- fix_notification_cron_auth
--
-- The process-notification-queue cron was failing every minute with:
--   ERROR: unrecognized configuration parameter "supabase.service_role_key"
-- because the command used current_setting('supabase.service_role_key')
-- and that GUC isn't set in this database. Result: 0 push notifications
-- had been delivered for the lifetime of the cron job.
--
-- Every other cron in this project hardcodes the long-lived service-role
-- JWT directly in the command. Match that pattern.

SELECT cron.unschedule('process-notification-queue');

SELECT cron.schedule(
  'process-notification-queue',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mzqtrpdiqhopjmxjccwy.supabase.co/functions/v1/process-notification-queue',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16cXRycGRpcWhvcGpteGpjY3d5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjUwMjAwNCwiZXhwIjoyMDcyMDc4MDA0fQ.7wVpoHOFKkOw958FwL4vOs7MkStVDu2DJWbEng7hAPA',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
