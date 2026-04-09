-- =============================================================================
-- Sentinel Data Guard
--
-- Inserts the NO-PROJECT sentinel row used by both aggregate views to give
-- Airtable a linkable target for time entries logged with no project selected.
-- ON CONFLICT makes this fully idempotent across db reset runs.
-- =============================================================================

INSERT INTO clockify_projects (id, clockify_id, name)
VALUES (gen_random_uuid(), 'NO-PROJECT', 'No Project')
ON CONFLICT (clockify_id) DO NOTHING;