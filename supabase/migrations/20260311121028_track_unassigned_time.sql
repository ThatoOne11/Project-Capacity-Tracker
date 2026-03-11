-- 1. Create a dummy "No Project" in the projects table so Airtable has something to link to
INSERT INTO clockify_projects (id, clockify_id, name)
VALUES (gen_random_uuid(), 'NO-PROJECT', 'No Project')
ON CONFLICT (clockify_id) DO NOTHING;

-- 2. Update Monthly View to inject the dummy Project's Airtable ID
CREATE OR REPLACE VIEW monthly_aggregates_view WITH (security_invoker = on) AS
SELECT
    u.airtable_id AS airtable_user_id,
    u.name AS user_name,
    COALESCE(p.airtable_id, (SELECT airtable_id FROM clockify_projects WHERE clockify_id = 'NO-PROJECT')) AS airtable_project_id,
    COALESCE(p.name, 'No Project') AS project_name,
    TO_CHAR(DATE_TRUNC('month', t.start_time AT TIME ZONE 'Africa/Johannesburg'), 'FMMonth YYYY') AS month,
    ROUND((EXTRACT(EPOCH FROM SUM(t.duration)) / 3600)::numeric, 2) AS total_hours
FROM clockify_time_entries t
JOIN clockify_users u ON t.user_id = u.id
LEFT JOIN clockify_projects p ON t.project_id = p.id
WHERE t.deleted_at IS NULL AND t.duration IS NOT NULL
GROUP BY 
    u.airtable_id, u.name, 
    p.airtable_id, p.name, 
    TO_CHAR(DATE_TRUNC('month', t.start_time AT TIME ZONE 'Africa/Johannesburg'), 'FMMonth YYYY');

-- 3. Update Payroll View to inject the dummy Project's Airtable ID
CREATE OR REPLACE VIEW payroll_aggregates_view WITH (security_invoker = on) AS
WITH shifted_entries AS (
    SELECT
        t.user_id,
        t.project_id,
        t.duration,
        t.deleted_at,
        DATE_TRUNC('month', (t.start_time AT TIME ZONE 'Africa/Johannesburg') - INTERVAL '22 days') AS cycle_month
    FROM clockify_time_entries t
    WHERE t.duration IS NOT NULL
)
SELECT
    u.airtable_id AS airtable_user_id,
    u.name AS user_name,
    COALESCE(p.airtable_id, (SELECT airtable_id FROM clockify_projects WHERE clockify_id = 'NO-PROJECT')) AS airtable_project_id,
    COALESCE(p.name, 'No Project') AS project_name,
    '23 ' || TO_CHAR(s.cycle_month, 'FMMon') || ' to 22 ' || TO_CHAR(s.cycle_month + INTERVAL '1 month', 'FMMon YYYY') AS month, 
    ROUND((EXTRACT(EPOCH FROM SUM(s.duration)) / 3600)::numeric, 2) AS total_hours
FROM shifted_entries s
JOIN clockify_users u ON s.user_id = u.id
LEFT JOIN clockify_projects p ON s.project_id = p.id
WHERE s.deleted_at IS NULL
GROUP BY 
    u.airtable_id, u.name,
    p.airtable_id, p.name,
    s.cycle_month;