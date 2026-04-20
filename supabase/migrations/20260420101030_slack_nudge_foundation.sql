-- 1. Add the caching column for Option 5
ALTER TABLE public.clockify_users ADD COLUMN slack_id TEXT;
COMMENT ON COLUMN public.clockify_users.slack_id IS 'Cached Slack member ID for automated DMs.';

-- 2. Create the strict RPC to calculate unassigned time for the PAYROLL PERIOD
CREATE OR REPLACE FUNCTION public.get_unassigned_time(p_date DATE)
RETURNS TABLE (
    user_id UUID,
    user_name TEXT,
    user_email TEXT,
    slack_id TEXT,
    unassigned_hours NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cycle_start TIMESTAMPTZ;
    v_cycle_end TIMESTAMPTZ;
BEGIN
    -- Mimic the payroll_aggregates_view logic: 23rd to 22nd SAST
    -- Shift back 22 days, truncate to the 1st of the month, then add 22 days to get the 23rd
    v_cycle_start := (DATE_TRUNC('month', p_date - INTERVAL '22 days') + INTERVAL '22 days') AT TIME ZONE 'Africa/Johannesburg';
    
    -- The cycle ends exactly one month later
    v_cycle_end := v_cycle_start + INTERVAL '1 month';

    RETURN QUERY
    SELECT 
        u.id AS user_id,
        u.name AS user_name,
        u.email AS user_email,
        u.slack_id AS slack_id,
        ROUND((EXTRACT(EPOCH FROM SUM(t.duration)) / 3600)::NUMERIC, 2) AS unassigned_hours
    FROM clockify_time_entries t
    JOIN clockify_users u ON t.user_id = u.id
    LEFT JOIN clockify_projects p ON t.project_id = p.id
    WHERE t.start_time >= v_cycle_start
      AND t.start_time < v_cycle_end
      AND t.deleted_at IS NULL
      AND t.duration IS NOT NULL
      AND (t.project_id IS NULL OR p.clockify_id = 'NO-PROJECT')
    GROUP BY u.id, u.name, u.email, u.slack_id
    HAVING SUM(EXTRACT(EPOCH FROM t.duration)) > 0;
END;
$$;

-- Secure the RPC
REVOKE EXECUTE ON FUNCTION public.get_unassigned_time(DATE) FROM public;
GRANT EXECUTE ON FUNCTION public.get_unassigned_time(DATE) TO service_role;