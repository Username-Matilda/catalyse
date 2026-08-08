-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_digest_runs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "sent_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_digest_runs" ("id", "sent_at", "type") SELECT "id", "sent_at", "type" FROM "digest_runs";
DROP TABLE "digest_runs";
ALTER TABLE "new_digest_runs" RENAME TO "digest_runs";
CREATE INDEX "idx_digest_runs_type" ON "digest_runs"("type");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

