-- Migration 009: Add needs_tasks project status
--
-- When a volunteer's want_to_own interest is accepted, the project now
-- moves to 'needs_tasks' instead of 'in_progress', giving the new owner
-- a chance to add tasks before the project starts.
--
-- SQLite requires table recreation to update CHECK constraints.

PRAGMA foreign_keys=OFF;

CREATE TABLE projects_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_review' CHECK(status IN (
        'pending_review',
        'needs_discussion',
        'seeking_owner',
        'seeking_help',
        'needs_tasks',
        'in_progress',
        'on_hold',
        'completed',
        'archived'
    )),
    owner_id INTEGER REFERENCES volunteers(id) ON DELETE SET NULL,
    proposed_by_id INTEGER REFERENCES volunteers(id) ON DELETE SET NULL,
    is_org_proposed BOOLEAN DEFAULT FALSE,
    project_type TEXT CHECK(project_type IN ('sprint', 'container', 'ongoing', 'one_off')),
    estimated_duration TEXT,
    time_commitment_hours_per_week INTEGER,
    urgency TEXT CHECK(urgency IN ('low', 'medium', 'high')) DEFAULT 'medium',
    review_notes TEXT,
    reviewed_by_id INTEGER REFERENCES volunteers(id),
    reviewed_at TIMESTAMP,
    feedback_to_proposer TEXT,
    collaboration_link TEXT,
    outcome TEXT CHECK(outcome IN ('successful', 'partial', 'not_completed', 'ongoing')),
    outcome_notes TEXT,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    country TEXT,
    is_seeking_help BOOLEAN DEFAULT FALSE,
    is_seeking_owner BOOLEAN DEFAULT FALSE,
    local_group TEXT
);

INSERT INTO projects_new SELECT * FROM projects;
DROP TABLE projects;
ALTER TABLE projects_new RENAME TO projects;

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_proposed_by ON projects(proposed_by_id);
CREATE INDEX IF NOT EXISTS idx_projects_country ON projects(country);
CREATE INDEX IF NOT EXISTS idx_projects_local_group ON projects(local_group);

PRAGMA foreign_keys=ON;
