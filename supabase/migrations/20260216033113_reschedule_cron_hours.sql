-- 1. "Business Hours" Sync
select cron.schedule(
  'sync-clockify-entries',
  '0 6-18 * * 1-5',        -- Mon-Fri, 08:00 SAST to 20:00 SAST
  $$
  select net.http_post(
      url:=(select decrypted_secret from vault.decrypted_secrets where name = 'edge_function_url' limit 1),
      headers:=jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
      ),
      body:='{}'::jsonb,
      timeout_milliseconds:=60000
  ) as request_id;
  $$
);

-- 2. "Audit Entries" Sync
select cron.schedule(
  'audit-clockify-history',
  '0 1 * * *',             -- Everyday at 03:00AM SAST
  $$
  select net.http_post(
      url:=(select decrypted_secret from vault.decrypted_secrets where name = 'edge_function_url' limit 1),
      headers:=jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
      ),
      body:='{"lookbackDays": 30}'::jsonb,
      timeout_milliseconds:=300000
  ) as request_id;
  $$
);