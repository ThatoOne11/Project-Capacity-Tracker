-- 1. Add the caching column for Option 5
ALTER TABLE public.clockify_users ADD COLUMN slack_id TEXT;
COMMENT ON COLUMN public.clockify_users.slack_id IS 'Cached Slack member ID for automated DMs.';

-- 2. Create the strict RPC to calculate unassigned time
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
BEGIN
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
    WHERE t.start_time >= p_date::TIMESTAMPTZ
      -- Captures exactly the 24-hour window of the target date
      AND t.start_time < (p_date + INTERVAL '1 day')::TIMESTAMPTZ
      AND t.deleted_at IS NULL
      AND t.duration IS NOT NULL
      -- It is unassigned if it's completely NULL, or linked to the NO-PROJECT sentinel
      AND (t.project_id IS NULL OR p.clockify_id = 'NO-PROJECT')
    GROUP BY u.id, u.name, u.email, u.slack_id
    HAVING SUM(EXTRACT(EPOCH FROM t.duration)) > 0;
END;
$$;

-- Secure the RPC
REVOKE EXECUTE ON FUNCTION public.get_unassigned_time(DATE) FROM public;
GRANT EXECUTE ON FUNCTION public.get_unassigned_time(DATE) TO service_role;