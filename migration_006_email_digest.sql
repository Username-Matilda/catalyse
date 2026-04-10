-- Migration 006: Email digest preferences
-- Adds email notification settings for volunteers

ALTER TABLE volunteers ADD COLUMN email_digest TEXT DEFAULT 'none' CHECK(email_digest IN ('none', 'match', 'fortnightly'));
