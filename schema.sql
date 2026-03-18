-- Catalyse: PauseAI UK Volunteer & Project Matching Platform
-- Database Schema

PRAGMA foreign_keys = ON;

-- ============================================
-- SKILLS TAXONOMY
-- ============================================

CREATE TABLE skill_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES skill_categories(id),
    name TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category_id, name)
);

CREATE INDEX idx_skills_category ON skills(category_id);

-- ============================================
-- VOLUNTEERS
-- ============================================

CREATE TABLE volunteers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    bio TEXT,

    -- Contact options (all optional)
    discord_handle TEXT,
    signal_number TEXT,
    whatsapp_number TEXT,
    contact_preference TEXT CHECK(contact_preference IN ('email', 'discord', 'signal', 'whatsapp')),
    contact_notes TEXT,

    -- Availability
    availability_hours_per_week INTEGER,
    location TEXT,

    -- Privacy settings
    share_contact_directly BOOLEAN DEFAULT FALSE,  -- If false, use contact form only
    profile_visible BOOLEAN DEFAULT TRUE,

    -- Other skills not in taxonomy
    other_skills TEXT,

    -- Consent tracking (GDPR)
    consent_profile_visible BOOLEAN DEFAULT FALSE,
    consent_contact_by_owners BOOLEAN DEFAULT FALSE,
    consent_given_at TIMESTAMP,

    -- Auth (simple token-based for lightweight auth)
    auth_token TEXT UNIQUE,
    auth_token_expires_at TIMESTAMP,

    -- Metadata
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP  -- Soft delete for GDPR
);

CREATE INDEX idx_volunteers_email ON volunteers(email);
CREATE INDEX idx_volunteers_auth_token ON volunteers(auth_token);
CREATE INDEX idx_volunteers_deleted ON volunteers(deleted_at);

-- Junction table: volunteer <-> skills
CREATE TABLE volunteer_skills (
    volunteer_id INTEGER NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
    skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    proficiency_level TEXT CHECK(proficiency_level IN ('beginner', 'intermediate', 'expert')) DEFAULT 'intermediate',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (volunteer_id, skill_id)
);

CREATE INDEX idx_volunteer_skills_skill ON volunteer_skills(skill_id);

-- ============================================
-- PROJECTS
-- ============================================

CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,

    -- Status workflow
    status TEXT NOT NULL DEFAULT 'pending_review' CHECK(status IN (
        'pending_review',    -- Volunteer-proposed, awaiting team review
        'needs_discussion',  -- Good idea, needs conversation about fit
        'seeking_owner',     -- Approved, needs someone to lead
        'seeking_help',      -- Has owner, needs contributors
        'in_progress',       -- Active work
        'on_hold',           -- Paused
        'completed',         -- Done!
        'archived'           -- No longer relevant
    )),

    -- Ownership
    owner_id INTEGER REFERENCES volunteers(id) ON DELETE SET NULL,
    proposed_by_id INTEGER REFERENCES volunteers(id) ON DELETE SET NULL,
    is_org_proposed BOOLEAN DEFAULT FALSE,  -- TRUE = org proposed, FALSE = volunteer proposed

    -- Requirements
    project_type TEXT CHECK(project_type IN ('sprint', 'container', 'ongoing', 'one_off')),
    estimated_duration TEXT,  -- e.g., "2 weeks", "3 months"
    time_commitment_hours_per_week INTEGER,
    urgency TEXT CHECK(urgency IN ('low', 'medium', 'high')) DEFAULT 'medium',

    -- For moderation
    review_notes TEXT,           -- Internal notes from reviewers
    reviewed_by_id INTEGER REFERENCES volunteers(id),
    reviewed_at TIMESTAMP,
    feedback_to_proposer TEXT,   -- Message sent back if needs_discussion

    -- Contact/collaboration
    collaboration_link TEXT,     -- Notion doc, Google doc, etc.

    -- Outcome tracking
    outcome TEXT CHECK(outcome IN ('successful', 'partial', 'not_completed', 'ongoing')),
    outcome_notes TEXT,
    completed_at TIMESTAMP,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_owner ON projects(owner_id);
CREATE INDEX idx_projects_proposed_by ON projects(proposed_by_id);

-- Junction table: project <-> skills required
CREATE TABLE project_skills (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    is_required BOOLEAN DEFAULT TRUE,  -- TRUE = required, FALSE = nice-to-have
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, skill_id)
);

CREATE INDEX idx_project_skills_skill ON project_skills(skill_id);

-- ============================================
-- PROJECT INTERESTS (Volunteer wants to help)
-- ============================================

CREATE TABLE project_interests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    volunteer_id INTEGER NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    interest_type TEXT NOT NULL CHECK(interest_type IN ('want_to_contribute', 'want_to_own')),
    message TEXT,  -- Why they're interested

    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'declined', 'withdrawn')),
    response_message TEXT,  -- Owner's response

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP,

    UNIQUE(volunteer_id, project_id)
);

CREATE INDEX idx_project_interests_project ON project_interests(project_id);
CREATE INDEX idx_project_interests_volunteer ON project_interests(volunteer_id);

-- ============================================
-- CONTACT MESSAGES (Privacy-preserving contact)
-- ============================================

CREATE TABLE contact_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_volunteer_id INTEGER NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
    to_volunteer_id INTEGER NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,

    subject TEXT NOT NULL,
    message TEXT NOT NULL,

    -- Context (optional)
    related_project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,

    -- Status
    read_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_contact_messages_to ON contact_messages(to_volunteer_id);
CREATE INDEX idx_contact_messages_from ON contact_messages(from_volunteer_id);

-- ============================================
-- PROJECT UPDATES (Progress tracking)
-- ============================================

CREATE TABLE project_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    author_id INTEGER REFERENCES volunteers(id) ON DELETE SET NULL,

    content TEXT NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_project_updates_project ON project_updates(project_id);

-- ============================================
-- GDPR: DATA DELETION REQUESTS
-- ============================================

CREATE TABLE deletion_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    volunteer_id INTEGER NOT NULL,  -- No FK since volunteer may be deleted
    volunteer_email TEXT,           -- Stored for verification

    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'completed')),

    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- ============================================
-- NOTIFICATIONS (for email digest, etc.)
-- ============================================

CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    volunteer_id INTEGER NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,

    type TEXT NOT NULL,  -- 'new_interest', 'project_approved', 'message_received', etc.
    title TEXT NOT NULL,
    body TEXT,
    link TEXT,           -- URL to relevant page

    read_at TIMESTAMP,
    emailed_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_volunteer ON notifications(volunteer_id);
CREATE INDEX idx_notifications_unread ON notifications(volunteer_id, read_at);

-- ============================================
-- ADMIN NOTES (Private, per volunteer)
-- ============================================

CREATE TABLE admin_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    volunteer_id INTEGER NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
    author_id INTEGER NOT NULL REFERENCES volunteers(id),

    content TEXT NOT NULL,
    category TEXT CHECK(category IN ('skill_feedback', 'reliability', 'fit', 'general')) DEFAULT 'general',
    related_project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_admin_notes_volunteer ON admin_notes(volunteer_id);

-- ============================================
-- STARTER TASKS
-- ============================================

CREATE TABLE starter_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,

    title TEXT NOT NULL,
    description TEXT NOT NULL,

    skill_id INTEGER REFERENCES skills(id) ON DELETE SET NULL,

    assigned_to_id INTEGER REFERENCES volunteers(id) ON DELETE SET NULL,
    assigned_by_id INTEGER REFERENCES volunteers(id),

    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN (
        'open',
        'assigned',
        'submitted',
        'reviewed',
        'completed'
    )),

    review_rating TEXT CHECK(review_rating IN ('excellent', 'good', 'needs_improvement')),
    review_notes TEXT,
    feedback_to_volunteer TEXT,
    reviewed_by_id INTEGER REFERENCES volunteers(id),
    reviewed_at TIMESTAMP,

    estimated_hours REAL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_starter_tasks_project ON starter_tasks(project_id);
CREATE INDEX idx_starter_tasks_assigned ON starter_tasks(assigned_to_id);
CREATE INDEX idx_starter_tasks_skill ON starter_tasks(skill_id);

-- ============================================
-- SKILL ENDORSEMENTS (admin-verified track record)
-- ============================================

CREATE TABLE skill_endorsements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    volunteer_id INTEGER NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
    skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,

    endorsed_by_id INTEGER NOT NULL REFERENCES volunteers(id),
    source TEXT CHECK(source IN ('project_outcome', 'starter_task', 'direct_observation')) DEFAULT 'direct_observation',
    source_id INTEGER,

    rating TEXT CHECK(rating IN ('verified', 'strong', 'developing')) DEFAULT 'verified',
    notes TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(volunteer_id, skill_id, endorsed_by_id)
);

CREATE INDEX idx_skill_endorsements_volunteer ON skill_endorsements(volunteer_id);
