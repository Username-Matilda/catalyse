-- Migration 009: Add 'needs_tasks' to projects.status CHECK constraint
--
-- When a volunteer's want_to_own interest is accepted, the project moves to
-- 'needs_tasks' instead of 'in_progress', giving the new owner a chance to
-- add tasks before the project starts.
--
-- IDEMPOTENCY: Safe to re-run. The UPDATE has a WHERE clause guard that
-- only modifies the schema if 'needs_tasks' is not already present.
--
-- WHY NOT TABLE RECREATION: The previous version of this migration used
-- the CREATE/INSERT/DROP/RENAME pattern to update the CHECK constraint.
-- That pattern is destructive when re-run because PRAGMA foreign_keys=OFF
-- is silently ignored inside an active transaction (which Python's sqlite3
-- module opens implicitly), causing DROP TABLE projects to cascade-delete
-- every row in project_tasks. This rewrite uses sqlite_master directly so
-- no table is dropped and no FK cascade can fire.

PRAGMA writable_schema = ON;

UPDATE sqlite_master
SET sql = REPLACE(
    sql,
    '''seeking_help''',
    '''seeking_help'',
        ''needs_tasks'''
)
WHERE type = 'table'
  AND name = 'projects'
  AND sql LIKE '%''seeking_help''%'
  AND sql NOT LIKE '%''needs_tasks''%';

PRAGMA writable_schema = OFF;
