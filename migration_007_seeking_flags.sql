-- Migration 007: Seeking flags
-- Projects can now be "in progress" AND "seeking help" simultaneously.
-- These boolean flags are independent of the lifecycle status.

ALTER TABLE projects ADD COLUMN is_seeking_help BOOLEAN DEFAULT FALSE;
ALTER TABLE projects ADD COLUMN is_seeking_owner BOOLEAN DEFAULT FALSE;

-- Migrate existing data: set flags based on current status
UPDATE projects SET is_seeking_help = 1 WHERE status = 'seeking_help';
UPDATE projects SET is_seeking_owner = 1 WHERE status = 'seeking_owner';

-- Normalize old statuses: projects that were "seeking_help" or "seeking_owner"
-- are really "in_progress" (or haven't started yet) with a seeking flag
UPDATE projects SET status = 'in_progress' WHERE status = 'seeking_help' AND owner_id IS NOT NULL;
UPDATE projects SET status = 'in_progress' WHERE status = 'seeking_owner' AND owner_id IS NOT NULL;

-- Projects without an owner that were seeking_owner stay as a visible state
-- but we give them a neutral status
UPDATE projects SET status = 'seeking_owner' WHERE status = 'seeking_owner' AND owner_id IS NULL;
UPDATE projects SET status = 'seeking_help' WHERE status = 'seeking_help' AND owner_id IS NULL;
