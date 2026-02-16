-- Runs a deep scan (30 days) every night to catch edited/deleted clockify entries.
-- 1. Schedule the Audit Job
select cron.schedule(
  'audit-clockify-history',
  '0 1 * * *', --  03:00 AM SAST
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
      body:='{"lookbackDays": 30}'::jsonb, -- Payload: Look back 30 days
      timeout_milliseconds:=300000 -- Timeout: 5 minutes so it doesn't fail.
  ) as request_id;
  $$
);