-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_local_group_suggestions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "suggested_by_id" INTEGER NOT NULL,
    "reviewed_by_id" INTEGER,
    "reviewed_at" DATETIME,
    "admin_notes" TEXT,
    "merged_into_id" INTEGER,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "local_group_suggestions_suggested_by_id_fkey" FOREIGN KEY ("suggested_by_id") REFERENCES "volunteers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "local_group_suggestions_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "volunteers" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "local_group_suggestions_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "local_groups" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_local_group_suggestions" ("admin_notes", "country", "created_at", "id", "merged_into_id", "name", "reviewed_at", "reviewed_by_id", "status", "suggested_by_id", "updated_at") SELECT "admin_notes", "country", "created_at", "id", "merged_into_id", "name", "reviewed_at", "reviewed_by_id", "status", "suggested_by_id", "updated_at" FROM "local_group_suggestions";
DROP TABLE "local_group_suggestions";
ALTER TABLE "new_local_group_suggestions" RENAME TO "local_group_suggestions";
CREATE INDEX "idx_local_group_suggestions_status" ON "local_group_suggestions"("status");
CREATE INDEX "idx_local_group_suggestions_suggested_by" ON "local_group_suggestions"("suggested_by_id");
CREATE TABLE "new_project_tasks" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "project_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigned_to_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_by_id" INTEGER NOT NULL,
    "completed_at" DATETIME,
    "nudge_sent_at" DATETIME,
    "final_warning_sent_at" DATETIME,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "volunteers" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "project_tasks_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "volunteers" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "project_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
INSERT INTO "new_project_tasks" ("assigned_to_id", "completed_at", "created_at", "created_by_id", "description", "final_warning_sent_at", "id", "nudge_sent_at", "project_id", "status", "title", "updated_at") SELECT "assigned_to_id", "completed_at", "created_at", "created_by_id", "description", "final_warning_sent_at", "id", "nudge_sent_at", "project_id", "status", "title", "updated_at" FROM "project_tasks";
DROP TABLE "project_tasks";
ALTER TABLE "new_project_tasks" RENAME TO "project_tasks";
CREATE INDEX "idx_project_tasks_assigned" ON "project_tasks"("assigned_to_id");
CREATE INDEX "idx_project_tasks_project" ON "project_tasks"("project_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

