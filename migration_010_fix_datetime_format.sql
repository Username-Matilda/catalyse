-- Migration 010: Normalise datetime format for Prisma compatibility
--
-- FastAPI previously stored explicit datetime values using Python's
-- datetime.now().isoformat(), which produces "YYYY-MM-DDTHH:MM:SS.ssssss"
-- (T separator, 6-digit microseconds, no timezone suffix).
-- Prisma 6's SQLite driver cannot parse this format (P2023).
--
-- This migration rewrites all affected values to "YYYY-MM-DDTHH:MM:SSZ"
-- (T separator, no fractional seconds, UTC Z suffix) — the format both
-- FastAPI (after api.py fix) and Prisma 6 accept.
--
-- CURRENT_TIMESTAMP default values ("YYYY-MM-DD HH:MM:SS", space separator)
-- are left untouched — Prisma 6 can read those already.
--
-- Guard: WHERE col LIKE '%T%' AND col NOT LIKE '%Z'
--   matches only the old Python isoformat values.

-- volunteers
UPDATE volunteers SET consent_given_at = substr(consent_given_at, 1, 19) || 'Z'
WHERE consent_given_at IS NOT NULL AND consent_given_at LIKE '%T%' AND consent_given_at NOT LIKE '%Z';

UPDATE volunteers SET updated_at = substr(updated_at, 1, 19) || 'Z'
WHERE updated_at IS NOT NULL AND updated_at LIKE '%T%' AND updated_at NOT LIKE '%Z';

UPDATE volunteers SET deleted_at = substr(deleted_at, 1, 19) || 'Z'
WHERE deleted_at IS NOT NULL AND deleted_at LIKE '%T%' AND deleted_at NOT LIKE '%Z';

UPDATE volunteers SET auth_token_expires_at = substr(auth_token_expires_at, 1, 19) || 'Z'
WHERE auth_token_expires_at IS NOT NULL AND auth_token_expires_at LIKE '%T%' AND auth_token_expires_at NOT LIKE '%Z';

-- password_reset_tokens
UPDATE password_reset_tokens SET expires_at = substr(expires_at, 1, 19) || 'Z'
WHERE expires_at IS NOT NULL AND expires_at LIKE '%T%' AND expires_at NOT LIKE '%Z';

UPDATE password_reset_tokens SET used_at = substr(used_at, 1, 19) || 'Z'
WHERE used_at IS NOT NULL AND used_at LIKE '%T%' AND used_at NOT LIKE '%Z';

-- admin_invites
UPDATE admin_invites SET expires_at = substr(expires_at, 1, 19) || 'Z'
WHERE expires_at IS NOT NULL AND expires_at LIKE '%T%' AND expires_at NOT LIKE '%Z';

UPDATE admin_invites SET accepted_at = substr(accepted_at, 1, 19) || 'Z'
WHERE accepted_at IS NOT NULL AND accepted_at LIKE '%T%' AND accepted_at NOT LIKE '%Z';

-- projects
UPDATE projects SET reviewed_at = substr(reviewed_at, 1, 19) || 'Z'
WHERE reviewed_at IS NOT NULL AND reviewed_at LIKE '%T%' AND reviewed_at NOT LIKE '%Z';

UPDATE projects SET completed_at = substr(completed_at, 1, 19) || 'Z'
WHERE completed_at IS NOT NULL AND completed_at LIKE '%T%' AND completed_at NOT LIKE '%Z';

UPDATE projects SET updated_at = substr(updated_at, 1, 19) || 'Z'
WHERE updated_at IS NOT NULL AND updated_at LIKE '%T%' AND updated_at NOT LIKE '%Z';

-- project_tasks
UPDATE project_tasks SET completed_at = substr(completed_at, 1, 19) || 'Z'
WHERE completed_at IS NOT NULL AND completed_at LIKE '%T%' AND completed_at NOT LIKE '%Z';

UPDATE project_tasks SET updated_at = substr(updated_at, 1, 19) || 'Z'
WHERE updated_at IS NOT NULL AND updated_at LIKE '%T%' AND updated_at NOT LIKE '%Z';

-- starter_tasks
UPDATE starter_tasks SET reviewed_at = substr(reviewed_at, 1, 19) || 'Z'
WHERE reviewed_at IS NOT NULL AND reviewed_at LIKE '%T%' AND reviewed_at NOT LIKE '%Z';

UPDATE starter_tasks SET updated_at = substr(updated_at, 1, 19) || 'Z'
WHERE updated_at IS NOT NULL AND updated_at LIKE '%T%' AND updated_at NOT LIKE '%Z';

-- admin_notes
UPDATE admin_notes SET updated_at = substr(updated_at, 1, 19) || 'Z'
WHERE updated_at IS NOT NULL AND updated_at LIKE '%T%' AND updated_at NOT LIKE '%Z';

-- bug_reports
UPDATE bug_reports SET resolved_at = substr(resolved_at, 1, 19) || 'Z'
WHERE resolved_at IS NOT NULL AND resolved_at LIKE '%T%' AND resolved_at NOT LIKE '%Z';

-- project_interests
UPDATE project_interests SET responded_at = substr(responded_at, 1, 19) || 'Z'
WHERE responded_at IS NOT NULL AND responded_at LIKE '%T%' AND responded_at NOT LIKE '%Z';

-- contact_messages
UPDATE contact_messages SET read_at = substr(read_at, 1, 19) || 'Z'
WHERE read_at IS NOT NULL AND read_at LIKE '%T%' AND read_at NOT LIKE '%Z';

-- notifications
UPDATE notifications SET read_at = substr(read_at, 1, 19) || 'Z'
WHERE read_at IS NOT NULL AND read_at LIKE '%T%' AND read_at NOT LIKE '%Z';

UPDATE notifications SET emailed_at = substr(emailed_at, 1, 19) || 'Z'
WHERE emailed_at IS NOT NULL AND emailed_at LIKE '%T%' AND emailed_at NOT LIKE '%Z';
