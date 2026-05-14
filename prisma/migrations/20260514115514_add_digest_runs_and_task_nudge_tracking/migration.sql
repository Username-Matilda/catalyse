-- AlterTable
ALTER TABLE "project_tasks" ADD COLUMN "final_warning_sent_at" DATETIME;
ALTER TABLE "project_tasks" ADD COLUMN "nudge_sent_at" DATETIME;

-- CreateTable
CREATE TABLE "digest_runs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "sent_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "idx_digest_runs_type" ON "digest_runs"("type");
