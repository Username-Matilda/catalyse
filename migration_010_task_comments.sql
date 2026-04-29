-- Migration 010: Task Comments
-- Allows project contributors and owners to comment on tasks

CREATE TABLE IF NOT EXISTS project_task_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
    author_id INTEGER REFERENCES volunteers(id) ON DELETE SET NULL,

    content TEXT NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_project_task_comments_task ON project_task_comments(task_id);
