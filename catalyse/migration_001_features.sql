-- Migration: Add admin notes, project outcomes, starter tasks, and proficiency tracking
-- Run after initial schema.sql

-- ============================================
-- ADMIN NOTES (Private, per volunteer)
-- ============================================

CREATE TABLE IF NOT EXISTS admin_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    volunteer_id INTEGER NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
    author_id INTEGER NOT NULL REFERENCES volunteers(id),  -- Which admin wrote it

    content TEXT NOT NULL,
    -- Categorize notes for easy filtering
    category TEXT CHECK(category IN ('skill_feedback', 'reliability', 'fit', 'general')) DEFAULT 'general',

    -- Optional: link to a specific project that prompted this note
    related_project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_notes_volunteer ON admin_notes(volunteer_id);

-- ============================================
-- PROJECT OUTCOMES
-- ============================================

-- Add outcome tracking columns to projects
-- (SQLite requires individual ALTER TABLE statements)

ALTER TABLE projects ADD COLUMN outcome TEXT CHECK(outcome IN (
    'successful',        -- Delivered well
    'partial',           -- Some results but incomplete
    'not_completed',     -- Didn't finish
    'ongoing'            -- Still in progress (no verdict yet)
));

ALTER TABLE projects ADD COLUMN outcome_notes TEXT;      -- Internal notes on how it went
ALTER TABLE projects ADD COLUMN completed_at TIMESTAMP;

-- ============================================
-- STARTER TASKS
-- ============================================

CREATE TABLE IF NOT EXISTS starter_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,  -- Optional link

    title TEXT NOT NULL,
    description TEXT NOT NULL,

    -- What skill is this verifying?
    skill_id INTEGER REFERENCES skills(id) ON DELETE SET NULL,

    -- Assignment
    assigned_to_id INTEGER REFERENCES volunteers(id) ON DELETE SET NULL,
    assigned_by_id INTEGER REFERENCES volunteers(id),

    -- Status
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN (
        'open',          -- Available
        'assigned',      -- Someone is working on it
        'submitted',     -- Volunteer submitted their work
        'reviewed',      -- Admin has reviewed
        'completed'      -- Done and verified
    )),

    -- Review
    review_rating TEXT CHECK(review_rating IN ('excellent', 'good', 'needs_improvement')),
    review_notes TEXT,        -- Private feedback for admin records
    feedback_to_volunteer TEXT, -- Feedback shared with the volunteer
    reviewed_by_id INTEGER REFERENCES volunteers(id),
    reviewed_at TIMESTAMP,

    -- Estimated effort
    estimated_hours REAL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_starter_tasks_project ON starter_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_starter_tasks_assigned ON starter_tasks(assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_starter_tasks_skill ON starter_tasks(skill_id);

-- ============================================
-- SKILL ENDORSEMENTS (lightweight track record)
-- ============================================

CREATE TABLE IF NOT EXISTS skill_endorsements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    volunteer_id INTEGER NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
    skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,

    -- Who endorsed and why
    endorsed_by_id INTEGER NOT NULL REFERENCES volunteers(id),  -- Admin who endorses
    source TEXT CHECK(source IN ('project_outcome', 'starter_task', 'direct_observation')) DEFAULT 'direct_observation',
    source_id INTEGER,  -- project_id or starter_task_id

    rating TEXT CHECK(rating IN ('verified', 'strong', 'developing')) DEFAULT 'verified',
    notes TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(volunteer_id, skill_id, endorsed_by_id)
);

CREATE INDEX IF NOT EXISTS idx_skill_endorsements_volunteer ON skill_endorsements(volunteer_id);
