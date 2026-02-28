-- Trigger so we know exactly when a row was last touched (by 15-min sync vs 3am audit)

-- 1. Create a reusable function to handle timestamp updates
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 2. Attach the trigger to the time entries table
-- This forces 'updated_at' to change every time an UPDATE happens
DROP TRIGGER IF EXISTS update_clockify_time_entries_modtime ON clockify_time_entries;

CREATE TRIGGER update_clockify_time_entries_modtime
    BEFORE UPDATE ON clockify_time_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();