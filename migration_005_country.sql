-- Migration 005: Country field for global expansion
-- Adds a structured country field to volunteers and projects for filtering

ALTER TABLE volunteers ADD COLUMN country TEXT;
ALTER TABLE projects ADD COLUMN country TEXT;

-- Create indexes for filtering
CREATE INDEX IF NOT EXISTS idx_volunteers_country ON volunteers(country);
CREATE INDEX IF NOT EXISTS idx_projects_country ON projects(country);
