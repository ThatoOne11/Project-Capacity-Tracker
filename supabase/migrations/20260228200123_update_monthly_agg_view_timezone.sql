-- Drops the old view and replaces it with the SAST timezone-aware version
CREATE OR REPLACE VIEW monthly_aggregates_view WITH (security_invoker = on) AS
SELECT
    u.name AS user_name,
    COALESCE(p.name, 'No Project') AS project_name,
    -- Apply SAST Timezone before truncating to the month to align with Clockify Dashboard
    TO_CHAR(DATE_TRUNC('month', t.start_time AT TIME ZONE 'Africa/Johannesburg'), 'FMMonth YYYY') AS month,
    ROUND((EXTRACT(EPOCH FROM SUM(t.duration)) / 3600)::numeric, 2) AS total_hours
FROM clockify_time_entries t
JOIN clockify_users u ON t.user_id = u.id
LEFT JOIN clockify_projects p ON t.project_id = p.id
WHERE t.deleted_at IS NULL
GROUP BY 
    u.name, 
    COALESCE(p.name, 'No Project'), 
    TO_CHAR(DATE_TRUNC('month', t.start_time AT TIME ZONE 'Africa/Johannesburg'), 'FMMonth YYYY');