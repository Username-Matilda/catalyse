-- DropIndex
DROP INDEX "idx_application_update_tokens_token";

-- DropIndex
DROP INDEX "idx_application_update_tokens_volunteer";

-- DropIndex
DROP INDEX "sqlite_autoindex_application_update_tokens_1";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "application_update_tokens";
PRAGMA foreign_keys=on;

