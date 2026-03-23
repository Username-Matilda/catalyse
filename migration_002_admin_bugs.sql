-- Migration: Add bug reports and admin invites
-- Run after migration_001_features.sql

-- ============================================
-- BUG REPORTS (Tester feedback)
-- ============================================

CREATE TABLE IF NOT EXISTS bug_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Reporter (optional - allow anonymous)
    reporter_id INTEGER REFERENCES volunteers(id) ON DELETE SET NULL,
    reporter_email TEXT,  -- For non-logged-in users

    -- Report details
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    page_url TEXT,

    -- Categorization
    category TEXT CHECK(category IN ('bug', 'feature', 'ux', 'other')) DEFAULT 'bug',
    severity TEXT CHECK(severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',

    -- Status
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'resolved', 'wont_fix')),
    resolution_notes TEXT,
    resolved_by_id INTEGER REFERENCES volunteers(id) ON DELETE SET NULL,
    resolved_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports(status);
CREATE INDEX IF NOT EXISTS idx_bug_reports_reporter ON bug_reports(reporter_id);

-- ============================================
-- ADMIN INVITES (Invite others to be admins)
-- ============================================

CREATE TABLE IF NOT EXISTS admin_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Invite details
    email TEXT NOT NULL,
    invite_token TEXT UNIQUE NOT NULL,

    -- Who invited
    invited_by_id INTEGER NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,

    -- Status
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'revoked')),
    accepted_by_id INTEGER REFERENCES volunteers(id) ON DELETE SET NULL,
    accepted_at TIMESTAMP,

    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_invites_email ON admin_invites(email);
CREATE INDEX IF NOT EXISTS idx_admin_invites_token ON admin_invites(invite_token);
