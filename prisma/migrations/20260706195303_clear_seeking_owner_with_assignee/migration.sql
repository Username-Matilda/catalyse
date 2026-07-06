-- Clear the stale `is_seeking_owner` flag on projects that already have an
-- assignee.
--
-- The admin "Transfer Ownership" path (projects.update in
-- server/routers/projects.ts) set `assignee_id` directly without clearing
-- `is_seeking_owner`, unlike the propose/accept flow which explicitly
-- resets the flag when an owner interest is accepted. Any project an
-- admin assigned an owner to this way is left stuck showing as
-- "seeking owner" even though it has one. This one-off backfill fixes
-- existing rows; the code fix (commit alongside this migration) prevents
-- new ones.
UPDATE "work_items"
SET "is_seeking_owner" = 0
WHERE "is_seeking_owner" = 1
  AND "assignee_id" IS NOT NULL;
