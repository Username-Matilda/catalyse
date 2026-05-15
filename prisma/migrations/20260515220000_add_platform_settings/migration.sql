-- CreateTable
CREATE TABLE "platform_settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "require_application_approval" BOOLEAN NOT NULL DEFAULT true
);

-- SeedSingleton
INSERT INTO "platform_settings" ("id") VALUES (1);
