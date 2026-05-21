-- The unified_work_items backfill copied comment timestamps verbatim from the
-- old tables, which mixed storage formats: project_updates used epoch-ms
-- integers (Prisma's native SQLite DateTime), while the legacy feedback columns
-- were ISO text. SQLite orders integers before text, so a mixed column can't be
-- sorted chronologically. Normalize the text rows to epoch ms so every row is
-- comparable and matches what Prisma writes for new comments.
UPDATE "work_item_comments"
SET "created_at" = CAST(strftime('%s', "created_at") AS INTEGER) * 1000
WHERE typeof("created_at") = 'text';
