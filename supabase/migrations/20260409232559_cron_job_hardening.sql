-- =============================================================================
-- Cron Jobs — Business Hours Sync + Nightly Audit
--
-- Requires two Vault secrets to be set before cron jobs will fire:
--   edge_function_url — full HTTPS URL of the clockify-entries-sync function
--   sync_api_secret   — matches the SYNC_API_SECRET edge function env var
--
-- For local dev, set these via the SQL editor after `supabase start`:
--   select vault.create_secret('<url>', 'edge_function_url');
--   select vault.create_secret('<secret>', 'sync_api_secret');
-- =============================================================================

-- Business Hours Sync: Mon–Fri 08:00–20:00 SAST (06:00–18:00 UTC)
-- Triggers an incremental 24-hour lookback sync on every active weekday hour.
SELECT cron.schedule(
    'sync-clockify-entries',
    '0 6-18 * * 1-5',
    $$
    SELECT net.http_post(
        url:=(
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'edge_function_url'
            LIMIT 1
        ),
        headers:=jsonb_build_object(
            'Content-Type',  'application/json',
            'x-sync-secret', (
                SELECT decrypted_secret
                FROM vault.decrypted_secrets
                WHERE name = 'sync_api_secret'
                LIMIT 1
            )
        ),
        body:='{}'::jsonb,
        timeout_milliseconds:=300000
    ) AS request_id;
    $$
);

-- Nightly Audit: Daily 05:00 SAST (03:00 UTC)
-- Triggers a 30-day deep scan to catch edits and deletions in Clockify.
-- Scheduled at 03:00 UTC to avoid overlap with Supabase's 01:00 UTC backup window.
SELECT cron.schedule(
    'audit-clockify-history',
    '0 3 * * *',
    $$
    SELECT net.http_post(
        url:=(
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'edge_function_url'
            LIMIT 1
        ),
        headers:=jsonb_build_object(
            'Content-Type',  'application/json',
            'x-sync-secret', (
                SELECT decrypted_secret
                FROM vault.decrypted_secrets
                WHERE name = 'sync_api_secret'
                LIMIT 1
            )
        ),
        body:='{"lookbackDays": 30}'::jsonb,
        timeout_milliseconds:=300000
    ) AS request_id;
    $$
);