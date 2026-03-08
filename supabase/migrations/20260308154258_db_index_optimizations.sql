-- 1. Partial Index for Active Time Entries (Massive boost for Views and Dashboards)
-- This index completely ignores deleted rows, keeping it tiny and incredibly fast.
CREATE INDEX IF NOT EXISTS idx_time_entries_active 
ON clockify_time_entries (start_time) 
WHERE deleted_at IS NULL;

-- 2. Composite Index tailored specifically for the Sync Engine's "Ghost Check"
-- Matches: eq("user_id", ...).gte("start_time", ...).is("deleted_at", null)
CREATE INDEX IF NOT EXISTS idx_time_entries_sync_engine 
ON clockify_time_entries (user_id, start_time) 
WHERE deleted_at IS NULL;

-- 3. String Indexes for Reference Syncs (.in("name", activeNames))
CREATE INDEX IF NOT EXISTS idx_clockify_users_name 
ON clockify_users USING btree (name);

CREATE INDEX IF NOT EXISTS idx_clockify_projects_name 
ON clockify_projects USING btree (name);

-- 4. Foreign Key Index (helps with cascading deletes/joins)
CREATE INDEX IF NOT EXISTS idx_clockify_projects_client 
ON clockify_projects(client_id);