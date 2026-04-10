-- =============================================================================
-- CANONICAL SCHEMA — Project Capacity Tracker V2
-- =============================================================================

-- -------------------------
-- Extensions
-- -------------------------
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- -------------------------
-- 1. Reference Tables
-- -------------------------
CREATE TABLE IF NOT EXISTS clockify_clients (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    clockify_id TEXT        UNIQUE NOT NULL,
    name        TEXT        NOT NULL,
    airtable_id TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clockify_users (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    clockify_id TEXT        UNIQUE NOT NULL,
    name        TEXT        NOT NULL,
    email       TEXT,
    airtable_id TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clockify_projects (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    clockify_id TEXT        UNIQUE NOT NULL,
    name        TEXT        NOT NULL,
    client_id   UUID        REFERENCES clockify_clients(id) ON DELETE SET NULL,
    airtable_id TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------
-- 2. Time Entries
-- -------------------------
CREATE TABLE IF NOT EXISTS clockify_time_entries (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    clockify_id TEXT        UNIQUE NOT NULL,
    description TEXT,
    start_time  TIMESTAMPTZ NOT NULL,
    end_time    TIMESTAMPTZ,
    duration    INTERVAL,
    user_id     UUID        NOT NULL REFERENCES clockify_users(id),
    project_id  UUID        REFERENCES clockify_projects(id) ON DELETE SET NULL,
    deleted_at  TIMESTAMPTZ DEFAULT NULL,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------
-- 3. Indexes
-- -------------------------

-- Partial index for active entries — ignores deleted rows entirely,
-- keeping the index small and fast for view queries and dashboards.
CREATE INDEX IF NOT EXISTS idx_time_entries_active
    ON clockify_time_entries (start_time)
    WHERE deleted_at IS NULL;

-- Composite index for the sync engine ghost check:
-- .eq("user_id").gte("start_time").is("deleted_at", null)
CREATE INDEX IF NOT EXISTS idx_time_entries_sync_engine
    ON clockify_time_entries (user_id, start_time)
    WHERE deleted_at IS NULL;

-- Reference sync name lookups: .in("name", activeNames)
CREATE INDEX IF NOT EXISTS idx_clockify_users_name
    ON clockify_users USING btree (name);

CREATE INDEX IF NOT EXISTS idx_clockify_projects_name
    ON clockify_projects USING btree (name);

-- Foreign key join acceleration
CREATE INDEX IF NOT EXISTS idx_clockify_projects_client
    ON clockify_projects (client_id);

-- -------------------------
-- 4. updated_at Trigger
-- -------------------------
CREATE OR REPLACE FUNCTION public.update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Lock the search path to prevent function hijacking (security hardening).
ALTER FUNCTION public.update_modified_column() SET search_path = '';

DROP TRIGGER IF EXISTS update_clockify_time_entries_modtime
    ON clockify_time_entries;

CREATE TRIGGER update_clockify_time_entries_modtime
    BEFORE UPDATE ON clockify_time_entries
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- -------------------------
-- 5. Row Level Security
-- -------------------------
ALTER TABLE clockify_users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE clockify_clients      ENABLE ROW LEVEL SECURITY;
ALTER TABLE clockify_projects     ENABLE ROW LEVEL SECURITY;
ALTER TABLE clockify_time_entries ENABLE ROW LEVEL SECURITY;

-- Edge functions run as service_role and must bypass RLS to read/write freely.
CREATE POLICY "Service Role Full Access" ON clockify_users
    FOR ALL TO service_role USING (true);

CREATE POLICY "Service Role Full Access" ON clockify_clients
    FOR ALL TO service_role USING (true);

CREATE POLICY "Service Role Full Access" ON clockify_projects
    FOR ALL TO service_role USING (true);

CREATE POLICY "Service Role Full Access" ON clockify_time_entries
    FOR ALL TO service_role USING (true);

-- -------------------------
-- 6. Reporting Views
-- -------------------------

-- Monthly aggregates: groups active entries by user/project/calendar month
-- in SAST timezone to match what Clockify's dashboard displays.
CREATE OR REPLACE VIEW monthly_aggregates_view WITH (security_invoker = on) AS
SELECT
    u.airtable_id   AS airtable_user_id,
    u.name          AS user_name,
    COALESCE(
        p.airtable_id,
        (SELECT airtable_id FROM clockify_projects WHERE clockify_id = 'NO-PROJECT')
    )               AS airtable_project_id,
    COALESCE(p.name, 'No Project') AS project_name,
    TO_CHAR(
        DATE_TRUNC('month', t.start_time AT TIME ZONE 'Africa/Johannesburg'),
        'FMMonth YYYY'
    )               AS month,
    ROUND(
        (EXTRACT(EPOCH FROM SUM(t.duration)) / 3600)::numeric, 2
    )               AS total_hours
FROM clockify_time_entries t
JOIN  clockify_users    u ON t.user_id    = u.id
LEFT JOIN clockify_projects p ON t.project_id = p.id
WHERE t.deleted_at IS NULL
  AND t.duration   IS NOT NULL
GROUP BY
    u.airtable_id, u.name,
    p.airtable_id, p.name,
    TO_CHAR(
        DATE_TRUNC('month', t.start_time AT TIME ZONE 'Africa/Johannesburg'),
        'FMMonth YYYY'
    );

-- Payroll aggregates: groups active entries by the 23rd–22nd payroll cycle
-- in SAST timezone. Shifting back 22 days maps the 23rd to the 1st of the
-- bucket month, allowing standard DATE_TRUNC grouping.
CREATE OR REPLACE VIEW payroll_aggregates_view WITH (security_invoker = on) AS
WITH shifted_entries AS (
    SELECT
        t.user_id,
        t.project_id,
        t.duration,
        t.deleted_at,
        DATE_TRUNC(
            'month',
            (t.start_time AT TIME ZONE 'Africa/Johannesburg') - INTERVAL '22 days'
        ) AS cycle_month
    FROM clockify_time_entries t
    WHERE t.duration IS NOT NULL
)
SELECT
    u.airtable_id   AS airtable_user_id,
    u.name          AS user_name,
    COALESCE(
        p.airtable_id,
        (SELECT airtable_id FROM clockify_projects WHERE clockify_id = 'NO-PROJECT')
    )               AS airtable_project_id,
    COALESCE(p.name, 'No Project') AS project_name,
    '23 ' || TO_CHAR(s.cycle_month, 'FMMon')
    || ' to 22 '
    || TO_CHAR(s.cycle_month + INTERVAL '1 month', 'FMMon YYYY') AS month,
    ROUND(
        (EXTRACT(EPOCH FROM SUM(s.duration)) / 3600)::numeric, 2
    )               AS total_hours
FROM shifted_entries s
JOIN  clockify_users    u ON s.user_id    = u.id
LEFT JOIN clockify_projects p ON s.project_id = p.id
WHERE s.deleted_at IS NULL
GROUP BY
    u.airtable_id, u.name,
    p.airtable_id, p.name,
    s.cycle_month;