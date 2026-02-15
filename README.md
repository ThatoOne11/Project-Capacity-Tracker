# Project Capacity Tracker

A robust, automated synchronization pipeline that pulls time-tracking data from **Clockify**, stores it in **Supabase** for historical analysis, and pushes aggregated monthly reports to **Airtable**.

## Architecture

1. **Source**: Clockify API (Time Entries, Users, Projects, Clients).
2. **Processing**: Supabase Edge Functions (Deno).
    - **Sync Service**: Incremental 15-minute syncing.
    - **Backfill Service**: Historical data import.
    - **Airtable Service**: Pushes aggregated views.

3. **Storage**: Supabase.
    - **Raw Data**: Tables for users, projects, and time entries.
    - **Logic**: Views for aggregation and Soft-Deletes for data integrity.

4. **Automation**: `pg_cron` + `pg_net` triggers the Edge Functions every 15 minutes.
5. **Security**: All API keys stored in **Supabase Vault**; Row Level Security (RLS) enabled.

## Local Dev Setup

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd project-capacity-tracker
```

### 2. Environment Variables

Create a `.env` file in `supabase/functions/` with the following keys.
_(These are needed for local testing.)_

```env
SUPABASE_URL="http://127.0.0.1:54321"
SUPABASE_SERVICE_ROLE_KEY="<your_local_service_role_key>"

CLOCKIFY_API_KEY="<your_clockify_api_key>"
CLOCKIFY_WORKSPACE_ID="<your_workspace_id>"

AIRTABLE_PAT="<your_personal_access_token>"
AIRTABLE_BASE_ID="<your_base_id>"
AIRTABLE_TABLE_ID="<your_table_id>"
```

### 3. Start Local Supabase

This boots up the database, studio, and edge function runtime.

```bash
supabase start
```

### 4. Deploy Migrations

Set up the tables, views, cron jobs, and RLS policies.

```bash
supabase db reset
```

### 5. Setup Vault Secrets (Crucial for Cron)

The database Cron job cannot read your `.env` file. You must add secrets to the **Supabase Vault** so the database can authenticate with the Edge Functions.

Run this SQL in your **Local Supabase Dashboard SQL Editor**:

```sql
-- 1. The URL the database should hit (Internal Docker URL for local)
select vault.create_secret(
  'http://host.docker.internal:54321/functions/v1/clockify-entries-sync',
  'edge_function_url'
);

-- 2. The Service Role Key (Found in output of `supabase status`)
select vault.create_secret(
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  'service_role_key'
);
```

### 6. Serve Functions

```bash
supabase functions serve --no-verify-jwt
```

## Commands

### Manual Backfill (Historical Data)

To import past data (e.g., from Jan 1st, 2026), run this curl command:

```bash
curl -L -X POST 'https://<PROJECT_REF>.supabase.co/functions/v1/backfill-clockify' \
  -H 'Authorization: Bearer <SERVICE_ROLE_KEY>' \
  -H 'Content-Type: application/json' \
  --data-raw '{
    "startDate": "2026-01-01T00:00:00Z"
  }'
```

### Force Sync (Incremental)

To trigger the 15-minute sync manually:

```bash
curl -L -X POST 'https://<PROJECT_REF>.supabase.co/functions/v1/clockify-entries-sync' \
  -H 'Authorization: Bearer <SERVICE_ROLE_KEY>'
```

### Monitoring

- **Database Logs**: Check the `net._http_response` table to see Cron job statuses.

```sql
SELECT
  id,
  status_code,
  error_msg,
  created
FROM net._http_response
ORDER BY created DESC
LIMIT 10;
```

- **Function Logs**: View via Supabase Dashboard > Edge Functions > Logs.

## Key Features

- **Upserts**: New or updated Clockify entries are updated in Supabase.
- **Soft Deletes**: Entries deleted in Clockify are detected and marked as `deleted_at` in Supabase.
- **Cleanup**: If an entry is removed/moved, Airtable records are "zeroed out" to maintain accuracy.
- Uses `pg_net` with a **5-minute timeout** to handle large syncs without locking the database.
