-- Migration 008: Local group field for UK regional chapters
ALTER TABLE volunteers ADD COLUMN local_group TEXT;
ALTER TABLE projects ADD COLUMN local_group TEXT;

CREATE INDEX IF NOT EXISTS idx_volunteers_local_group ON volunteers(local_group);
CREATE INDEX IF NOT EXISTS idx_projects_local_group ON projects(local_group);
