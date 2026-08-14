-- Status-value backfills. These must run BEFORE the table rebuild below, which copies
-- `status` across verbatim.
--
-- 'seeking_owner' is retired as a status: "wants an owner" is now derived from
-- (status, assignee_id) rather than stored. Its replacement, 'ready', means approved
-- and live but unowned — so a seeking_owner row that somehow has an owner is not
-- 'ready', it is simply 'in_progress' (these rows exist: assigning an owner used to
-- clear the flag without moving the status).
UPDATE "work_items" SET "status" = 'ready'
  WHERE "type" = 'PROJECT' AND "status" = 'seeking_owner' AND "assignee_id" IS NULL;
UPDATE "work_items" SET "status" = 'in_progress'
  WHERE "type" = 'PROJECT' AND "status" = 'seeking_owner' AND "assignee_id" IS NOT NULL;

-- 'needs_tasks' is retired too. An owned project with an empty backlog is still owned,
-- so it is 'in_progress'; the empty backlog is surfaced as a derived badge instead of a
-- status that flips back and forth as tasks are completed.
UPDATE "work_items" SET "status" = 'in_progress'
  WHERE "type" = 'PROJECT' AND "status" = 'needs_tasks';

-- Note: `is_seeking_owner` is dropped by the rebuild. Rows that had it set to 1 while
-- also having an owner lose that (contradictory) intent by design — the derived value
-- for an owned project is always false.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_work_items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "deadline" DATETIME,
    "parent_id" INTEGER,
    "context_project_id" INTEGER,
    "creator_id" INTEGER,
    "assignee_id" INTEGER,
    "stakeholder_id" INTEGER,
    "reviewed_by_id" INTEGER,
    "reviewed_at" DATETIME,
    "review_notes" TEXT,
    "review_rating" TEXT,
    "project_type" TEXT,
    "urgency" TEXT DEFAULT 'medium',
    "estimated_duration" TEXT,
    "time_commitment_hours_per_week" INTEGER,
    "collaboration_link" TEXT,
    "is_org_proposed" BOOLEAN DEFAULT false,
    "is_seeking_help" BOOLEAN DEFAULT false,
    "outcome" TEXT,
    "outcome_notes" TEXT,
    "completed_at" DATETIME,
    "skill_id" INTEGER,
    "estimated_hours" REAL,
    "nudge_sent_at" DATETIME,
    "final_warning_sent_at" DATETIME,
    "sort_order" INTEGER DEFAULT 0,
    "featured_as_quick_task" BOOLEAN DEFAULT false,
    "country" TEXT,
    "local_group" TEXT,
    "remote_eligibility" TEXT NOT NULL DEFAULT 'NONE',
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "work_items_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "work_items" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "work_items_context_project_id_fkey" FOREIGN KEY ("context_project_id") REFERENCES "work_items" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "work_items_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "volunteers" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "work_items_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "volunteers" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "work_items_stakeholder_id_fkey" FOREIGN KEY ("stakeholder_id") REFERENCES "volunteers" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "work_items_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "volunteers" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "work_items_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills" ("id") ON DELETE SET NULL ON UPDATE NO ACTION
);
INSERT INTO "new_work_items" ("assignee_id", "collaboration_link", "completed_at", "context_project_id", "country", "created_at", "creator_id", "deadline", "description", "estimated_duration", "estimated_hours", "featured_as_quick_task", "final_warning_sent_at", "id", "is_org_proposed", "is_seeking_help", "local_group", "nudge_sent_at", "outcome", "outcome_notes", "parent_id", "project_type", "remote_eligibility", "review_notes", "review_rating", "reviewed_at", "reviewed_by_id", "skill_id", "sort_order", "stakeholder_id", "status", "time_commitment_hours_per_week", "title", "type", "updated_at", "urgency") SELECT "assignee_id", "collaboration_link", "completed_at", "context_project_id", "country", "created_at", "creator_id", "deadline", "description", "estimated_duration", "estimated_hours", "featured_as_quick_task", "final_warning_sent_at", "id", "is_org_proposed", "is_seeking_help", "local_group", "nudge_sent_at", "outcome", "outcome_notes", "parent_id", "project_type", "remote_eligibility", "review_notes", "review_rating", "reviewed_at", "reviewed_by_id", "skill_id", "sort_order", "stakeholder_id", "status", "time_commitment_hours_per_week", "title", "type", "updated_at", "urgency" FROM "work_items";
DROP TABLE "work_items";
ALTER TABLE "new_work_items" RENAME TO "work_items";
CREATE INDEX "idx_work_items_type" ON "work_items"("type");
CREATE INDEX "idx_work_items_status" ON "work_items"("status");
CREATE INDEX "idx_work_items_parent" ON "work_items"("parent_id");
CREATE INDEX "idx_work_items_context" ON "work_items"("context_project_id");
CREATE INDEX "idx_work_items_creator" ON "work_items"("creator_id");
CREATE INDEX "idx_work_items_assignee" ON "work_items"("assignee_id");
CREATE INDEX "idx_work_items_skill" ON "work_items"("skill_id");
CREATE INDEX "idx_work_items_local_group" ON "work_items"("local_group");
CREATE INDEX "idx_work_items_country" ON "work_items"("country");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

