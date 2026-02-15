-- 1. Enable extensions
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- 2. Schedule the Cron Job
select cron.schedule(
  'sync-clockify-entries', 
  '*/15 * * * *',              
  $$
  select net.http_post(
      url:=(
          select decrypted_secret 
          from vault.decrypted_secrets 
          where name = 'edge_function_url' 
          limit 1
      ),
      headers:=jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
              select decrypted_secret 
              from vault.decrypted_secrets 
              where name = 'service_role_key' 
              limit 1
          )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000 -- Set 5 minute timeout so it doesn't fail.
  ) as request_id;
  $$
);