-- CreateTable
CREATE TABLE "bug_report_comments" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "bug_report_id" INTEGER NOT NULL,
    "author_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bug_report_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "volunteers" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "bug_report_comments_bug_report_id_fkey" FOREIGN KEY ("bug_report_id") REFERENCES "bug_reports" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- CreateIndex
CREATE INDEX "idx_bug_report_comments_thread" ON "bug_report_comments"("bug_report_id", "created_at");

