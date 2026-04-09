# Project Capacity Tracker

[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=ThatoOne11_Project-Capacity-Tracker&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=ThatoOne11_Project-Capacity-Tracker)
[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=ThatoOne11_Project-Capacity-Tracker&metric=code_smells)](https://sonarcloud.io/summary/new_code?id=ThatoOne11_Project-Capacity-Tracker)
[![Lines of Code](https://sonarcloud.io/api/project_badges/measure?project=ThatoOne11_Project-Capacity-Tracker&metric=ncloc)](https://sonarcloud.io/summary/new_code?id=ThatoOne11_Project-Capacity-Tracker)

A synchronisation pipeline that pulls time-tracking data from **Clockify**, stores it in **Supabase** for historical analysis, and pushes mathematically calculated capacity reports to **Airtable**.

---

## Architecture

### Data Flow

```
Clockify API
     │
     ▼
clockify-entries-sync          ← Triggered by pg_cron every business hour
     │   └── backfill-clockify ← Triggered manually for historical imports
     │
     ▼
Supabase (PostgreSQL)          ← Source of truth for all raw time data
     │
     ▼
airtable-sync                  ← Triggered automatically when changes are detected
     │
     ▼
Airtable                       ← Live capacity + payroll reports for stakeholders
```

### Edge Functions

| Function                | Trigger                              | Purpose                                                                                                                                               |
| ----------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clockify-entries-sync` | pg_cron (hourly) + manual            | Pulls recent time entries from Clockify into Supabase. Triggers `airtable-sync` automatically if changes are detected                                 |
| `airtable-sync`         | Triggered by `clockify-entries-sync` | Two-phase sync: establishes all Airtable reference IDs, then diffs SQL aggregates against Airtable and patches only what changed                      |
| `airtable-overwatch`    | Manual / external caller             | Read-only Airtable proxy. Accepts a `tableId` and optional filter, returns raw records. Used for ad-hoc inspection without direct Airtable API access |
| `backfill-clockify`     | Manual cURL                          | Imports historical time entries from a given start date. Safe to re-run — all upserts are idempotent                                                  |

### Sync Strategies

**Clockify → Supabase (Hybrid)**

- **Business Hours** — Hourly incremental sync covering the last 24 hours
- **Nightly Audit** — 3 AM deep scan covering the last 30 days to catch edits and deletions

**Supabase → Airtable (Two-Phase)**

- **Phase 1: Reference Sync** — Ensures every active user, project, and client has an Airtable record and a stored `airtable_id` in Supabase before any numbers move
- **Phase 2: Diff Calculator** — Reads SQL aggregate views, compares against live Airtable records, and issues only the minimum PATCH/POST operations required

### V2 Features

- **GhostBuster:**
  When a record is manually deleted in Airtable, the next sync detects the `ROW_DOES_NOT_EXIST` error, extracts the dead record ID, nullifies it across all Supabase reference tables, and exits gracefully. The following cron run auto-heals the link by re-creating or re-matching the record. No human intervention required.

- **Auto-Heal:**
  When a user manually creates a record in Airtable that matches a Supabase record by name (case and whitespace insensitive), the system detects the match, links the existing Airtable ID back to Supabase, and skips creation. A Slack notification is sent confirming the heal.

- **Conflict Shield:**
  If two records in Airtable normalise to the same name (e.g. `"Boco"` and `"BOCO "`), the system refuses to guess which is correct, skips the record entirely, and fires a critical Slack alert requesting human intervention.

- **Overwatch**
  A lightweight read-only Airtable proxy function that can be called by external tools or scripts to inspect any Airtable table without needing direct seat access. Supports `filterByFormula`, `fields`, and `maxRecords`.

### Security — Two-Key System

| Key          | Name                        | Purpose                                                                                                     |
| ------------ | --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Doorbell Key | `SYNC_API_SECRET`           | Opaque token attached to every HTTP trigger. Validated via timing-safe comparison to prevent timing attacks |
| Vault Key    | `SUPABASE_SERVICE_ROLE_KEY` | JWT kept strictly in Deno memory. Used to bypass RLS so edge functions can read and write freely            |

---

## Database Schema

### Tables

```
clockify_clients      — id, clockify_id, name, airtable_id, created_at
clockify_users        — id, clockify_id, name, email, airtable_id, created_at
clockify_projects     — id, clockify_id, name, client_id, airtable_id, created_at
clockify_time_entries — id, clockify_id, description, start_time, end_time,
                        duration, user_id, project_id, deleted_at, updated_at
```

### Views

| View                      | Purpose                                                                   |
| ------------------------- | ------------------------------------------------------------------------- |
| `monthly_aggregates_view` | Aggregates active entries by user/project/calendar month in SAST timezone |
| `payroll_aggregates_view` | Aggregates active entries by the 23rd–22nd payroll cycle in SAST timezone |

### Migrations

Schema history is maintained as 3 canonical migration files introduced in the V2 squash (April 2026):

| File                                    | Contents                                                  |
| --------------------------------------- | --------------------------------------------------------- |
| `20260409232522_init_schema.sql`        | Tables, indexes, trigger, RLS policies, reporting views   |
| `20260409232559_cron_job_hardening.sql` | pg_cron job definitions for hourly sync and nightly audit |
| `20260409232648_seed_guard.sql`         | NO-PROJECT sentinel row                                   |

---

## Local Dev Setup

### 1. Clone

```bash
git clone <repo-url>
cd project-capacity-tracker
```

### 2. Environment Variables

Create `supabase/.env`:

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

# Slack
SLACK_WEBHOOK_URL="<your_slack_webhook_url>"
```

### 3. Start Supabase

```bash
supabase start
```

### 4. Reset Database

Applies all 3 migrations and seeds the NO-PROJECT sentinel row:

```bash
supabase db reset
```

### 5. Set Vault Secrets

The pg_cron jobs cannot read `.env` — secrets must be in the Supabase Vault so `pg_net` can attach them to outbound HTTP requests. Run this in the **Local Studio SQL Editor** (`http://localhost:54323`):

```sql
-- Internal Docker URL for the edge function (local only)
SELECT vault.create_secret(
    'http://host.docker.internal:54321/functions/v1/clockify-entries-sync',
    'edge_function_url'
);

-- Must match SYNC_API_SECRET in your .env
SELECT vault.create_secret(
    'sb_secret_local_123456789',
    'sync_api_secret'
);
```

### 6. Serve Functions

```bash
supabase functions serve --env-file ./supabase/.env
```

---

## Running Tests

```bash
deno test --allow-env --allow-net supabase/functions/
```

### Test Coverage

| Module                  | Test File                           | What It Covers                                                                           |
| ----------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------- |
| `_shared`               | `auth.utils.test.ts`                | Secret guard: missing secret, missing header, wrong token, correct token, quoted env var |
| `_shared`               | `clockify.service.test.ts`          | Zod schema validation on valid and invalid Clockify API responses                        |
| `airtable-sync`         | `diff.calculator.test.ts`           | Insert and update payloads; assignment shields; auto-heal of missing assigned hours      |
| `airtable-sync`         | `airtable.service.test.ts`          | Batch chunking enforces Airtable's 10-record limit                                       |
| `airtable-sync`         | `reference-sync.service.test.ts`    | Auto-heal, new record creation, duplicate conflict alert                                 |
| `airtable-sync`         | `sync-orchestrator.service.test.ts` | Deduplication of updates; GhostBuster graceful exit; unrelated error re-throw            |
| `airtable-overwatch`    | `overwatch.controller.test.ts`      | Empty payload, missing tableId, successful fetch, downstream error propagation           |
| `backfill-clockify`     | `backfill.controller.test.ts`       | Default date fallback, valid payload, type validation, malformed JSON                    |
| `clockify-entries-sync` | `sync.controller.test.ts`           | FAST/DEEP mode detection, type validation                                                |

---

## Manual Operations

### Backfill Historical Data

Imports all time entries from a given date forward for the entire team:

```bash
curl -L -X POST 'https://<PROJECT_REF>.supabase.co/functions/v1/backfill-clockify' \
  -H 'x-sync-secret: <SYNC_API_SECRET>' \
  -H 'Content-Type: application/json' \
  --data-raw '{
    "startDate": "2026-01-01T00:00:00Z"
  }'
```

Backfill a single user only:

```bash
curl -L -X POST 'https://<PROJECT_REF>.supabase.co/functions/v1/backfill-clockify' \
  -H 'x-sync-secret: <SYNC_API_SECRET>' \
  -H 'Content-Type: application/json' \
  --data-raw '{
    "startDate": "2026-01-01T00:00:00Z",
    "userId": "<clockify_user_id>"
  }'
```

### Force Incremental Sync (Last 24h)

```bash
curl -L -X POST 'https://<PROJECT_REF>.supabase.co/functions/v1/clockify-entries-sync' \
  -H 'x-sync-secret: <SYNC_API_SECRET>' \
  -H 'Content-Type: application/json' \
  --data-raw '{}'
```

### Force Audit Sync (Last 30 Days)

```bash
curl -L -X POST 'https://<PROJECT_REF>.supabase.co/functions/v1/clockify-entries-sync' \
  -H 'x-sync-secret: <SYNC_API_SECRET>' \
  -H 'Content-Type: application/json' \
  --data-raw '{
    "lookbackDays": 30
  }'
```

### Inspect Any Airtable Table (Overwatch)

```bash
curl -L -X POST 'https://<PROJECT_REF>.supabase.co/functions/v1/airtable-overwatch' \
  -H 'x-sync-secret: <SYNC_API_SECRET>' \
  -H 'Content-Type: application/json' \
  --data-raw '{
    "tableId": "<your_table_id>",
    "filterByFormula": "{Status}=\"Active\"",
    "fields": ["Name", "Status"]
  }'
```

---

## Monitoring

### Cron Job Status

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

---

## Key Edge Cases

| Scenario                                               | Behaviour                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Time logged to a project with no Airtable record       | System auto-creates the Airtable record and links it before syncing hours                  |
| Employee corrects a timesheet to a different project   | Audit sync zeroes the old project's hours and updates the new one                          |
| Entry deleted in Clockify                              | Nightly audit soft-deletes it in Supabase and removes the hours from Airtable              |
| Record manually deleted in Airtable                    | GhostBuster detects the dead ID, nullifies it in Supabase, and auto-heals on the next sync |
| Record manually created in Airtable with matching name | Auto-Heal links the existing record instead of creating a duplicate                        |
| Two Airtable records with the same normalised name     | Conflict Shield skips the record and fires a critical Slack alert                          |
| Ross sets Planned Hours with 0 Actual Hours            | Diff Calculator skips the row to preserve Ross's roadmap                                   |
| Running timer (no end time)                            | Excluded from all aggregate views via `WHERE duration IS NOT NULL`                         |
