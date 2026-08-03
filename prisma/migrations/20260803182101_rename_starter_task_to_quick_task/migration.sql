-- Data backfill: rename the "starter task" concept to "quick task".
-- No column types change (type/status/link/source are untyped TEXT columns),
-- so this only needs to rewrite existing string values to match the renamed
-- app-level enums and string literals.

UPDATE "work_items" SET "type" = 'QUICK_TASK' WHERE "type" = 'STARTER_TASK';

UPDATE "notifications" SET "type" = 'quick_task_assigned' WHERE "type" = 'starter_task_assigned';
UPDATE "notifications" SET "type" = 'quick_task_submitted' WHERE "type" = 'starter_task_submitted';
UPDATE "notifications" SET "type" = 'quick_task_reviewed' WHERE "type" = 'starter_task_reviewed';
UPDATE "notifications" SET "link" = '/quick-tasks' || substr("link", length('/starter-tasks') + 1)
  WHERE "link" LIKE '/starter-tasks%';

-- skill_endorsements.source has a CHECK(source IN (...)) constraint that predates
-- the tracked migration history and still lists 'starter_task' — rebuild the table
-- with the constraint updated to 'quick_task' before writing the new value.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_skill_endorsements" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "volunteer_id" INTEGER NOT NULL REFERENCES "volunteers" ("id") ON DELETE CASCADE,
    "skill_id" INTEGER NOT NULL REFERENCES "skills" ("id") ON DELETE CASCADE,
    "endorsed_by_id" INTEGER NOT NULL REFERENCES "volunteers" ("id"),
    "source" TEXT CHECK("source" IN ('project_outcome', 'quick_task', 'direct_observation')) DEFAULT 'direct_observation',
    "source_id" INTEGER,
    "rating" TEXT CHECK("rating" IN ('verified', 'strong', 'developing')) DEFAULT 'verified',
    "notes" TEXT,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE("volunteer_id", "skill_id", "endorsed_by_id")
);
INSERT INTO "new_skill_endorsements"
  ("id", "volunteer_id", "skill_id", "endorsed_by_id", "source", "source_id", "rating", "notes", "created_at")
  SELECT "id", "volunteer_id", "skill_id", "endorsed_by_id",
    CASE WHEN "source" = 'starter_task' THEN 'quick_task' ELSE "source" END,
    "source_id", "rating", "notes", "created_at"
  FROM "skill_endorsements";
DROP TABLE "skill_endorsements";
ALTER TABLE "new_skill_endorsements" RENAME TO "skill_endorsements";
CREATE INDEX "idx_skill_endorsements_volunteer" ON "skill_endorsements"("volunteer_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
