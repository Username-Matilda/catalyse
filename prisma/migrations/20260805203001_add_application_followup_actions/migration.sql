-- AlterTable
ALTER TABLE "anonymised_emails" ADD COLUMN "reapply_allowed_at" DATETIME;

-- CreateTable
CREATE TABLE "application_update_tokens" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "volunteer_id" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "used_at" DATETIME,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "application_update_tokens_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "volunteers" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- CreateIndex
Pragma writable_schema=1;
CREATE UNIQUE INDEX "sqlite_autoindex_application_update_tokens_1" ON "application_update_tokens"("token");
Pragma writable_schema=0;

-- CreateIndex
CREATE INDEX "idx_application_update_tokens_volunteer" ON "application_update_tokens"("volunteer_id");

-- CreateIndex
CREATE INDEX "idx_application_update_tokens_token" ON "application_update_tokens"("token");

