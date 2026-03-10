-- Overwrite the "Business Hours" Sync to use the correct 'sync_api_secret'
select cron.schedule(
  'sync-clockify-entries',
  '0 6-18 * * 1-5',
  $$
  select net.http_post(
      url:=(select decrypted_secret from vault.decrypted_secrets where name = 'edge_function_url' limit 1),
      headers:=jsonb_build_object(
          'Content-Type', 'application/json',
          'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_api_secret' limit 1)
      ),
      body:='{}'::jsonb,
      timeout_milliseconds:=60000
  ) as request_id;
  $$
);

-- Overwrite the "Audit Entries" Sync to use the correct 'sync_api_secret'
select cron.schedule(
  'audit-clockify-history',
  '0 1 * * *',
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