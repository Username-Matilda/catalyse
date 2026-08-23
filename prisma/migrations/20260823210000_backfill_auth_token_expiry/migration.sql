-- Sessions now expire: getCurrentVolunteer treats a NULL auth_token_expires_at as expired.
-- Give every existing signed-in session 30 days from this migration rather than logging
-- everyone out on deploy. Rows with no token are left alone.
UPDATE "volunteers"
SET "auth_token_expires_at" = (unixepoch() + 30 * 24 * 60 * 60) * 1000
WHERE "auth_token" IS NOT NULL
  AND "auth_token_expires_at" IS NULL;
