-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_platform_settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "require_application_approval" BOOLEAN NOT NULL DEFAULT true,
    "csp_violation_count" INTEGER NOT NULL DEFAULT 0,
    "csp_summary_last_sent_at" DATETIME
);
INSERT INTO "new_platform_settings" ("id", "require_application_approval") SELECT "id", "require_application_approval" FROM "platform_settings";
DROP TABLE "platform_settings";
ALTER TABLE "new_platform_settings" RENAME TO "platform_settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

