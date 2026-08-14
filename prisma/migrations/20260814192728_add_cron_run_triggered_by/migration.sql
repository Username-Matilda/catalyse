-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_cron_job_runs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "job_name" TEXT NOT NULL,
    "triggered_by" TEXT NOT NULL DEFAULT 'cron',
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" DATETIME,
    "status" TEXT NOT NULL,
    "summary" TEXT
);
INSERT INTO "new_cron_job_runs" ("finished_at", "id", "job_name", "started_at", "status", "summary") SELECT "finished_at", "id", "job_name", "started_at", "status", "summary" FROM "cron_job_runs";
DROP TABLE "cron_job_runs";
ALTER TABLE "new_cron_job_runs" RENAME TO "cron_job_runs";
CREATE INDEX "idx_cron_job_runs_job_name" ON "cron_job_runs"("job_name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
