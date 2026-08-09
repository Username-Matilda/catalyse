-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_bug_reports" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "reporter_id" INTEGER,
    "reporter_email" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "page_url" TEXT,
    "category" TEXT DEFAULT 'bug',
    "severity" TEXT DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolution_notes" TEXT,
    "resolved_by_id" INTEGER,
    "resolved_at" DATETIME,
    "assignee_id" INTEGER,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bug_reports_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "volunteers" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "bug_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "volunteers" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "bug_reports_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "volunteers" ("id") ON DELETE SET NULL ON UPDATE NO ACTION
);
INSERT INTO "new_bug_reports" ("assignee_id", "category", "created_at", "description", "id", "page_url", "reporter_email", "reporter_id", "resolution_notes", "resolved_at", "resolved_by_id", "severity", "status", "title") SELECT "assignee_id", "category", "created_at", "description", "id", "page_url", "reporter_email", "reporter_id", "resolution_notes", "resolved_at", "resolved_by_id", "severity", "status", "title" FROM "bug_reports";
DROP TABLE "bug_reports";
ALTER TABLE "new_bug_reports" RENAME TO "bug_reports";
CREATE INDEX "idx_bug_reports_reporter" ON "bug_reports"("reporter_id");
CREATE INDEX "idx_bug_reports_status" ON "bug_reports"("status");
CREATE INDEX "idx_bug_reports_assignee" ON "bug_reports"("assignee_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

