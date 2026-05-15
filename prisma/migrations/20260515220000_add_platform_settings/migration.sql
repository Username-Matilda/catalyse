-- CreateTable
CREATE TABLE "platform_settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "require_application_approval" BOOLEAN NOT NULL DEFAULT true
);
