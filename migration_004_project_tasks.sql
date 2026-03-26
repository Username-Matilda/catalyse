-- Migration 004: Project Tasks
-- Allows projects to be broken into smaller, claimable tasks

CREATE TABLE IF NOT EXISTS project_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    assigned_to_id INTEGER REFERENCES volunteers(id),
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'assigned', 'done')),
    created_by_id INTEGER NOT NULL REFERENCES volunteers(id),
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_assigned ON project_tasks(assigned_to_id);
