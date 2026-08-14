-- 'seeking_help' is retired as a project status value. It was only ever set on an
-- owned project that also wanted more help — that's now represented purely by the
-- isSeekingHelp flag, with status simply 'in_progress'. Backfill any existing rows.
UPDATE "work_items" SET "status" = 'in_progress' WHERE "type" = 'PROJECT' AND "status" = 'seeking_help';
