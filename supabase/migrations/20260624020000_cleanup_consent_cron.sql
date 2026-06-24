-- =============================================================================
-- Daily cron job: cleanup subscription_only consents whose subscription has
-- expired. Calls the cleanup-subscription-consent Edge Function via pg_net.
--
-- Requires the Edge Function to be deployed first:
--     supabase functions deploy cleanup-subscription-consent --no-verify-jwt
--
-- And these settings to be in place (set once via SQL Editor as project owner):
--     ALTER DATABASE postgres SET app.settings.supabase_url = 'https://<ref>.supabase.co';
--     ALTER DATABASE postgres SET app.settings.service_role_key = '<service-role-key>';
--
-- The schedule is 03:00 UTC daily (~05:00 CEST / 04:00 CET in Switzerland).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Drop the schedule if it already exists so this migration is idempotent.
SELECT cron.unschedule('cleanup-subscription-consent-daily')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cleanup-subscription-consent-daily'
);

SELECT cron.schedule(
  'cleanup-subscription-consent-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/cleanup-subscription-consent',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
