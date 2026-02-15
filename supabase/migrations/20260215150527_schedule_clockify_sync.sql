-- 1. Enable necessary extensions
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- 2. Schedule the Cron Job using Dynamic Secrets Lookup
select cron.schedule(
  'clockify-incremental-poll', 
  '*/15 * * * *',              
  $$
  select net.http_post(
      -- A. Fetch the URL dynamically from Vault
      url:=(
          select decrypted_secret 
          from vault.decrypted_secrets 
          where name = 'edge_function_url' 
          limit 1
      ),
      -- B. Fetch the Key dynamically and build headers
      headers:=jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
              select decrypted_secret 
              from vault.decrypted_secrets 
              where name = 'service_role_key' 
              limit 1
          )
      )
  ) as request_id;
  $$
);