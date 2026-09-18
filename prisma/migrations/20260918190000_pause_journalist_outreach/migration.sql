-- CreateTable
CREATE TABLE "experimental_outreach_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "paused" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "experimental_outreach_settings_pkey" PRIMARY KEY ("id")
);
