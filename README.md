# Project Capacity Tracker

[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=ThatoOne11_Project-Capacity-Tracker&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=ThatoOne11_Project-Capacity-Tracker)
[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=ThatoOne11_Project-Capacity-Tracker&metric=code_smells)](https://sonarcloud.io/summary/new_code?id=ThatoOne11_Project-Capacity-Tracker)
[![Lines of Code](https://sonarcloud.io/api/project_badges/measure?project=ThatoOne11_Project-Capacity-Tracker&metric=ncloc)](https://sonarcloud.io/summary/new_code?id=ThatoOne11_Project-Capacity-Tracker)

A robust, enterprise-grade synchronization pipeline that pulls time-tracking data from **Clockify**, stores it securely in **Supabase** for historical analysis, and pushes mathematically calculated capacity reports to **Airtable**.

## Architecture

1. **Source**: Clockify API (Time Entries, Users, Projects, Clients).
2. **Processing**: Supabase Edge Functions.
   - **Hybrid Sync Strategy**:
     - _Business Hours_: Hourly active syncing (Last 24 hours).
     - _Audit_: Nightly deep-scan for self-healing and soft-deleting ghost entries (Last 30 days).

   - **Airtable Service**: A strict, Two-Phase sync.
     - _Phase 1_: Explicit Reference Sync (Maps `airtable_id` to Supabase).
     - _Phase 2_: Diff Calculator (Mathematically compares SQL aggregates against Airtable to patch only what changed).

3. **Storage**: Supabase.
   - **Raw Data**: Relational tables for users, projects, and time entries with Enterprise PostgreSQL Indexing.
   - **Logic**: Pure SQL Views for calculating payroll and capacity.
4. **Automation**: `pg_cron` + `pg_net` triggers the Edge Functions via HTTP POST.
5. **Security (Two-Key System)**:
   - **Doorbell Key (`SYNC_API_SECRET`)**: An opaque token used to safely trigger the HTTP endpoints.
   - **Vault Key (`SUPABASE_SERVICE_ROLE_KEY`)**: A JWT kept strictly inside Deno memory to safely bypass Row Level Security (RLS).

## Local Dev Setup

### 1. Clone & Install

```bash
git clone <repo-url>
cd project-capacity-tracker
```

### 2. Environment Variables

Create a `supabase/.env` file. _(These are needed for local testing.)_

```env
# Supabase
SYNC_API_SECRET="sb_secret_local_123456789"

# Clockify
CLOCKIFY_API_KEY="<your_clockify_api_key>"
CLOCKIFY_WORKSPACE_ID="<your_workspace_id>"

# Airtable
AIRTABLE_PAT="<your_personal_access_token>"
AIRTABLE_BASE_ID="<your_base_id>"

AIRTABLE_EMPLOYEES_TABLE_ID="<your_table_id>"
AIRTABLE_PROJECTS_TABLE_ID="<your_table_id>"
AIRTABLE_CLIENTS_TABLE_ID="<your_table_id>"

AIRTABLE_PROJECT_ASSIGNMENTS_TABLE_ID="<your_table_id>"
AIRTABLE_PEOPLE_ASSIGNMENTS_TABLE_ID="<your_table_id>"
AIRTABLE_PAYROLL_TABLE_ID="<your_table_id>"

# SLack Alerts
SLACK_WEBHOOK_URL="<your_slack_webhook_url>"
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

### 5. Setup Vault Secrets (Crucial for Local Cron Jobs)

The database Cron job cannot read your `.env` file. You must add secrets to the **Supabase Vault** so `pg_net` can attach your `SYNC_API_SECRET` to its HTTP requests.

Run this SQL in your **Local Supabase Dashboard SQL Editor**:

```sql
-- 1. The URL the database should hit (Internal Docker URL for local)
select vault.create_secret(
  'http://host.docker.internal:54321/functions/v1/clockify-entries-sync',
  'edge_function_url'
);

-- 2. The Opaque HTTP Trigger Key (Matches your .env)
select vault.create_secret(
  'sb_secret_local_123456789',
  'sync_api_secret'
);
```

### 6. Serve Functions

_(Note: We do not use `--no-verify-jwt` anymore, as the HTTP gateway Kong allows all requests through to our custom Auth Guard)._

```bash
supabase functions serve --env-file ./supabase/.env
```

## Commands

### Manual Backfill (Historical Data)

To import past data (e.g., from Jan 1st, 2026), run this cURL command:

```bash
curl -L -X POST 'https://<PROJECT_REF>.supabase.co/functions/v1/backfill-clockify' \
  -H 'x-sync-secret: <SYNC_API_SECRET>' \
  -H 'Content-Type: application/json' \
  --data-raw '{
    "startDate": "2026-01-01T00:00:00Z"
  }'
```

### Force "Fast" Sync (Incremental)

To trigger the standard hourly sync manually (checks last 24h):

```bash
curl -L -X POST 'https://<PROJECT_REF>.supabase.co/functions/v1/clockify-entries-sync' \
  -H 'x-sync-secret: <SYNC_API_SECRET>' \
  -H 'Content-Type: application/json' \
  --data-raw '{}'
```

### Force "Audit" Sync (Deep Clean)

To trigger the deep cleanup manually (checks last 30 days):

```bash
curl -L -X POST 'https://<PROJECT_REF>.supabase.co/functions/v1/clockify-entries-sync' \
  -H 'x-sync-secret: <SYNC_API_SECRET>' \
  -H 'Content-Type: application/json' \
  --data-raw '{
    "lookbackDays": 30
  }'
```

## Monitoring & Debugging

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

## Key Edge Cases Handled

1. **Unplanned Work**: If time is logged to a project not budgeted in Airtable, the system auto-creates the assignment row.
2. **Timesheet Corrections**: If an employee logs time to the wrong project and fixes it, the system automatically zeroes out the old project and updates the new one.
3. **Ghost Catching**: If an entry is deleted in Clockify, the 3 AM Audit catches it, soft-deletes it in Supabase, and removes the hours from Airtable.
4. **PM Budget Preservation**: If an Airtable row has Planned Hours but 0 Actual Hours, the Diff Calculator safely ignores it to preserve the PM's roadmap.
