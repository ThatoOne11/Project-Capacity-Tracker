-- 1. Reference Tables
CREATE TABLE IF NOT EXISTS clockify_clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clockify_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clockify_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clockify_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clockify_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clockify_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    client_id UUID REFERENCES clockify_clients(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Time Entries
CREATE TABLE IF NOT EXISTS clockify_time_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clockify_id TEXT UNIQUE NOT NULL,
    description TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    duration INTERVAL,
    user_id UUID NOT NULL REFERENCES clockify_users(id),
    project_id UUID REFERENCES clockify_projects(id) ON DELETE SET NULL,
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_time_entries_user ON clockify_time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_project ON clockify_time_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_start_time ON clockify_time_entries(start_time);

-- 3. Reporting View
CREATE OR REPLACE VIEW monthly_aggregates_view  with (security_invoker = on) AS
SELECT
    u.name AS user_name,
    COALESCE(p.name, 'No Project') AS project_name,
    TO_CHAR(DATE_TRUNC('month', t.start_time), 'FMMonth YYYY') AS month,
    ROUND((EXTRACT(EPOCH FROM SUM(t.duration)) / 3600)::numeric, 2) AS total_hours
FROM clockify_time_entries t
JOIN clockify_users u ON t.user_id = u.id
LEFT JOIN clockify_projects p ON t.project_id = p.id
WHERE t.deleted_at IS NULL
GROUP BY 
    u.name, 
    p.name, 
    TO_CHAR(DATE_TRUNC('month', t.start_time), 'FMMonth YYYY');

-- 4. RLS Policies
ALTER TABLE clockify_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE clockify_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clockify_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE clockify_time_entries ENABLE ROW LEVEL SECURITY;

-- Allow the Service Role (Edge Functions) to do everything
CREATE POLICY "Service Role Full Access" ON clockify_users FOR ALL TO service_role USING (true);
CREATE POLICY "Service Role Full Access" ON clockify_clients FOR ALL TO service_role USING (true);
CREATE POLICY "Service Role Full Access" ON clockify_projects FOR ALL TO service_role USING (true);
CREATE POLICY "Service Role Full Access" ON clockify_time_entries FOR ALL TO service_role USING (true);