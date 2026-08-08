-- CreateTable
CREATE TABLE "cron_job_runs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "job_name" TEXT NOT NULL,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" DATETIME,
    "status" TEXT NOT NULL,
    "summary" TEXT
);

-- CreateIndex
CREATE INDEX "idx_cron_job_runs_job_name" ON "cron_job_runs"("job_name");

