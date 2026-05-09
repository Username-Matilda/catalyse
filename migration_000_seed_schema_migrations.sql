-- Migration 000: Seed schema_migrations for pre-existing databases
-- Marks migrations 001-009 as already applied so they are not re-run on existing installs.
-- The WHERE EXISTS guard ensures this is a no-op on fresh databases where project_tasks
-- does not yet exist and the real migrations still need to run.

INSERT OR IGNORE INTO schema_migrations (filename)
SELECT filename FROM (
    VALUES
        ('migration_001_features.sql'),
        ('migration_002_admin_bugs.sql'),
        ('migration_003_passwords.sql'),
        ('migration_004_project_tasks.sql'),
        ('migration_005_country.sql'),
        ('migration_006_email_digest.sql'),
        ('migration_007_seeking_flags.sql'),
        ('migration_008_local_group.sql'),
        ('migration_009_needs_tasks_status.sql')
) AS t(filename)
WHERE EXISTS (
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'project_tasks'
);
