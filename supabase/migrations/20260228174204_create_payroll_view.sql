-- Creates a view for Payroll Cycles (23rd to 22nd) using SAST Timezone
CREATE OR REPLACE VIEW payroll_aggregates_view WITH (security_invoker = on) AS
WITH shifted_entries AS (
    SELECT
        t.user_id,
        t.project_id,
        t.duration,
        t.deleted_at,
        -- LOGIC:
        -- 1. AT TIME ZONE 'Africa/Johannesburg': Converts UTC to local SAST to prevent midnight overlaps.
        -- 2. - INTERVAL '22 days': Shifts the date back so the 23rd of a month becomes the 1st.
        -- 3. DATE_TRUNC: Groups all these shifted dates into a clean "Month" bucket.
        DATE_TRUNC('month', (t.start_time AT TIME ZONE 'Africa/Johannesburg') - INTERVAL '22 days') AS cycle_month
    FROM clockify_time_entries t
)
SELECT
    u.name AS user_name,
    COALESCE(p.name, 'No Project') AS project_name,
    '23 ' || TO_CHAR(s.cycle_month, 'FMMon') || ' to 22 ' || TO_CHAR(s.cycle_month + INTERVAL '1 month', 'FMMon YYYY') AS month, -- Formats the string to match "23 Jan to 22 Feb 2026"
    ROUND((EXTRACT(EPOCH FROM SUM(s.duration)) / 3600)::numeric, 2) AS total_hours
FROM shifted_entries s
JOIN clockify_users u ON s.user_id = u.id
LEFT JOIN clockify_projects p ON s.project_id = p.id
WHERE s.deleted_at IS NULL
GROUP BY 
    u.name, 
    COALESCE(p.name, 'No Project'),
    s.cycle_month;