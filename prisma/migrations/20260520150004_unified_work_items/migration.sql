-- Unified WorkItem model: collapses projects + project_tasks + starter_tasks into
-- a single work_items table, with project_updates + feedback fields folded into a
-- work_item_comments thread. Data is backfilled before old tables are dropped.
--
-- ID strategy (so existing /projects/:id links keep resolving):
--   PROJECT      → original id
--   TASK         → original id + 1,000,000
--   STARTER_TASK → original id + 2,000,000
--
-- defer_foreign_keys=ON defers FK validation to COMMIT (works inside the
-- transaction Prisma wraps the migration in, unlike PRAGMA foreign_keys).
PRAGMA defer_foreign_keys=ON;

-- ─── New tables ─────────────────────────────────────────────────────────────
CREATE TABLE "work_items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
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
    "is_seeking_owner" BOOLEAN DEFAULT false,
    "outcome" TEXT,
    "outcome_notes" TEXT,
    "completed_at" DATETIME,
    "skill_id" INTEGER,
    "estimated_hours" REAL,
    "nudge_sent_at" DATETIME,
    "final_warning_sent_at" DATETIME,
    "country" TEXT,
    "local_group" TEXT,
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

CREATE TABLE "work_item_comments" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "work_item_id" INTEGER NOT NULL,
    "author_id" INTEGER,
    "content" TEXT NOT NULL,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "work_item_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "volunteers" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "work_item_comments_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "work_items" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE TABLE "work_item_skills" (
    "work_item_id" INTEGER NOT NULL,
    "skill_id" INTEGER NOT NULL,
    "is_required" BOOLEAN DEFAULT true,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("work_item_id", "skill_id"),
    CONSTRAINT "work_item_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "work_item_skills_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "work_items" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE TABLE "work_item_interests" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "volunteer_id" INTEGER NOT NULL,
    "work_item_id" INTEGER NOT NULL,
    "interest_type" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "response_message" TEXT,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "responded_at" DATETIME,
    CONSTRAINT "work_item_interests_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "work_items" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "work_item_interests_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "volunteers" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- ─── Backfill work_items ──────────────────────────────────────────────────────
-- PROJECT (keep original id). creator=proposer, assignee=owner, stakeholder=reviewer.
INSERT INTO "work_items" (
    "id", "type", "status", "title", "description",
    "creator_id", "assignee_id", "stakeholder_id",
    "reviewed_by_id", "reviewed_at", "review_notes",
    "project_type", "urgency", "estimated_duration", "time_commitment_hours_per_week",
    "collaboration_link", "is_org_proposed", "is_seeking_help", "is_seeking_owner",
    "outcome", "outcome_notes", "completed_at",
    "country", "local_group", "created_at", "updated_at"
)
SELECT
    "id", 'PROJECT', "status", "title", "description",
    "proposed_by_id", "owner_id", "reviewed_by_id",
    "reviewed_by_id", "reviewed_at", "review_notes",
    "project_type", "urgency", "estimated_duration", "time_commitment_hours_per_week",
    "collaboration_link", "is_org_proposed", "is_seeking_help", "is_seeking_owner",
    "outcome", "outcome_notes", "completed_at",
    "country", "local_group", "created_at", "updated_at"
FROM "projects";

-- TASK (id + 1,000,000). parent = its project. status remap assigned→in_progress, done→completed.
INSERT INTO "work_items" (
    "id", "type", "status", "title", "description",
    "parent_id", "creator_id", "assignee_id",
    "nudge_sent_at", "final_warning_sent_at",
    "completed_at", "created_at", "updated_at"
)
SELECT
    "id" + 1000000, 'TASK',
    CASE "status" WHEN 'assigned' THEN 'in_progress' WHEN 'done' THEN 'completed' ELSE "status" END,
    "title", "description",
    "project_id", "created_by_id", "assigned_to_id",
    "nudge_sent_at", "final_warning_sent_at",
    "completed_at", "created_at", "updated_at"
FROM "project_tasks";

-- STARTER_TASK (id + 2,000,000). context = its project. creator=assigner, assignee=doer.
-- status remap: assigned→in_progress, submitted→under_review, approved/reviewed/rejected→completed.
INSERT INTO "work_items" (
    "id", "type", "status", "title", "description",
    "context_project_id", "creator_id", "assignee_id",
    "reviewed_by_id", "reviewed_at", "review_notes", "review_rating",
    "skill_id", "estimated_hours", "created_at", "updated_at"
)
SELECT
    "id" + 2000000, 'STARTER_TASK',
    CASE "status"
        WHEN 'assigned' THEN 'in_progress'
        WHEN 'submitted' THEN 'under_review'
        WHEN 'approved' THEN 'completed'
        WHEN 'reviewed' THEN 'completed'
        WHEN 'rejected' THEN 'completed'
        ELSE "status"
    END,
    "title", "description",
    "project_id", "assigned_by_id", "assigned_to_id",
    "reviewed_by_id", "reviewed_at", "review_notes", "review_rating",
    "skill_id", "estimated_hours", "created_at", "updated_at"
FROM "starter_tasks";

-- ─── Backfill work_item_skills (project skills; project ids unchanged) ──────────
INSERT INTO "work_item_skills" ("work_item_id", "skill_id", "is_required", "created_at")
SELECT "project_id", "skill_id", "is_required", "created_at" FROM "project_skills";

-- ─── Backfill work_item_interests (project ids unchanged) ───────────────────────
INSERT INTO "work_item_interests" (
    "id", "volunteer_id", "work_item_id", "interest_type", "message",
    "status", "response_message", "created_at", "responded_at"
)
SELECT
    "id", "volunteer_id", "project_id", "interest_type", "message",
    "status", "response_message", "created_at", "responded_at"
FROM "project_interests";

-- ─── Backfill work_item_comments ────────────────────────────────────────────────
-- project_updates → comments (chronological, author preserved incl. NULL).
INSERT INTO "work_item_comments" ("work_item_id", "author_id", "content", "created_at")
SELECT "project_id", "author_id", "content", "created_at" FROM "project_updates";

-- feedback_to_proposer → comment on the project (author/date = reviewer/reviewed_at).
INSERT INTO "work_item_comments" ("work_item_id", "author_id", "content", "created_at")
SELECT "id", "reviewed_by_id", "feedback_to_proposer", COALESCE("reviewed_at", "created_at")
FROM "projects"
WHERE "feedback_to_proposer" IS NOT NULL AND "feedback_to_proposer" <> '';

-- feedback_to_volunteer → comment on the starter task (id + 2,000,000).
INSERT INTO "work_item_comments" ("work_item_id", "author_id", "content", "created_at")
SELECT "id" + 2000000, "reviewed_by_id", "feedback_to_volunteer", COALESCE("reviewed_at", "created_at")
FROM "starter_tasks"
WHERE "feedback_to_volunteer" IS NOT NULL AND "feedback_to_volunteer" <> '';

-- ─── Redefine admin_notes / contact_messages: related_project_id → related_work_item_id ──
-- Project ids are preserved as work_item ids, so the FK value carries over directly.
CREATE TABLE "new_admin_notes" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "volunteer_id" INTEGER NOT NULL,
    "author_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT DEFAULT 'general',
    "related_work_item_id" INTEGER,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_notes_related_work_item_id_fkey" FOREIGN KEY ("related_work_item_id") REFERENCES "work_items" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "admin_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "volunteers" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "admin_notes_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "volunteers" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
INSERT INTO "new_admin_notes" ("id", "volunteer_id", "author_id", "content", "category", "related_work_item_id", "created_at", "updated_at")
SELECT "id", "volunteer_id", "author_id", "content", "category", "related_project_id", "created_at", "updated_at" FROM "admin_notes";
DROP TABLE "admin_notes";
ALTER TABLE "new_admin_notes" RENAME TO "admin_notes";
CREATE INDEX "idx_admin_notes_volunteer" ON "admin_notes"("volunteer_id");

CREATE TABLE "new_contact_messages" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "from_volunteer_id" INTEGER NOT NULL,
    "to_volunteer_id" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "related_work_item_id" INTEGER,
    "read_at" DATETIME,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contact_messages_related_work_item_id_fkey" FOREIGN KEY ("related_work_item_id") REFERENCES "work_items" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "contact_messages_to_volunteer_id_fkey" FOREIGN KEY ("to_volunteer_id") REFERENCES "volunteers" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "contact_messages_from_volunteer_id_fkey" FOREIGN KEY ("from_volunteer_id") REFERENCES "volunteers" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
INSERT INTO "new_contact_messages" ("id", "from_volunteer_id", "to_volunteer_id", "subject", "message", "related_work_item_id", "read_at", "created_at")
SELECT "id", "from_volunteer_id", "to_volunteer_id", "subject", "message", "related_project_id", "read_at", "created_at" FROM "contact_messages";
DROP TABLE "contact_messages";
ALTER TABLE "new_contact_messages" RENAME TO "contact_messages";
CREATE INDEX "idx_contact_messages_from" ON "contact_messages"("from_volunteer_id");
CREATE INDEX "idx_contact_messages_to" ON "contact_messages"("to_volunteer_id");

-- ─── Drop old tables (after backfill) ─────────────────────────────────────────
DROP TABLE "project_interests";
DROP TABLE "project_skills";
-- project_task_comments existed only as drift on some databases; guard the drop.
DROP TABLE IF EXISTS "project_task_comments";
DROP TABLE "project_tasks";
DROP TABLE "project_updates";
DROP TABLE "starter_tasks";
DROP TABLE "projects";

-- ─── Indexes on new tables ────────────────────────────────────────────────────
CREATE INDEX "idx_work_items_type" ON "work_items"("type");
CREATE INDEX "idx_work_items_status" ON "work_items"("status");
CREATE INDEX "idx_work_items_parent" ON "work_items"("parent_id");
CREATE INDEX "idx_work_items_context" ON "work_items"("context_project_id");
CREATE INDEX "idx_work_items_creator" ON "work_items"("creator_id");
CREATE INDEX "idx_work_items_assignee" ON "work_items"("assignee_id");
CREATE INDEX "idx_work_items_skill" ON "work_items"("skill_id");
CREATE INDEX "idx_work_items_local_group" ON "work_items"("local_group");
CREATE INDEX "idx_work_items_country" ON "work_items"("country");
CREATE INDEX "idx_work_item_comments_thread" ON "work_item_comments"("work_item_id", "created_at");
CREATE INDEX "idx_work_item_skills_skill" ON "work_item_skills"("skill_id");
CREATE INDEX "idx_work_item_interests_volunteer" ON "work_item_interests"("volunteer_id");
CREATE INDEX "idx_work_item_interests_work_item" ON "work_item_interests"("work_item_id");
CREATE UNIQUE INDEX "uq_work_item_interests_volunteer_item" ON "work_item_interests"("volunteer_id", "work_item_id");
