-- =============================================================================
-- Cron Job — Automated Slack Nudges for Unassigned Time
--
-- Requires a new Vault secret to be set before the cron job will fire:
--   slack_bot_url — full HTTPS URL of the new slack-bot edge function
--
-- For local dev, set this via the SQL editor after `supabase start`:
--   select vault.create_secret('http://host.docker.internal:54321/functions/v1/slack-bot', 'slack_bot_url');
-- =============================================================================

-- Schedule: Mon–Fri at 16:00 SAST (14:00 UTC)
SELECT cron.schedule(
    'unassigned-time-nudge',
    '0 14 * * 1-5',
    $$
    SELECT net.http_post(
        url:=(
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'slack_bot_url'
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
        -- Route exactly to our new service
        body:='{"action": "unassigned_nudge"}'::jsonb,
        timeout_milliseconds:=60000
    ) AS request_id;
    $$
);