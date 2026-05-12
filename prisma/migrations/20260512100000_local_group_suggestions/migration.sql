-- Create local_group_suggestions table
CREATE TABLE "local_group_suggestions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "suggested_by_id" INTEGER NOT NULL REFERENCES "volunteers"("id"),
    "reviewed_by_id" INTEGER REFERENCES "volunteers"("id"),
    "reviewed_at" DATETIME,
    "admin_notes" TEXT,
    "merged_into_id" INTEGER REFERENCES "local_groups"("id"),
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "idx_local_group_suggestions_status" ON "local_group_suggestions"("status");
CREATE INDEX "idx_local_group_suggestions_suggested_by" ON "local_group_suggestions"("suggested_by_id");
