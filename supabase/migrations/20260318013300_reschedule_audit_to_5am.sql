-- Reschedule the Nightly Audit to 5:00 AM SAST (03:00 AM UTC) to avoid 01:00 UTC backups
select cron.schedule(
  'audit-clockify-history',
  '0 3 * * *', 
  $$
  select net.http_post(
      url:=(select decrypted_secret from vault.decrypted_secrets where name = 'edge_function_url' limit 1),
      headers:=jsonb_build_object(
          'Content-Type', 'application/json',
          'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_api_secret' limit 1)
      ),
      body:='{"lookbackDays": 30}'::jsonb,
      timeout_milliseconds:=300000
  ) as request_id;
  $$
);