-- CreateTable
CREATE TABLE "experimental_outreach_participants" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" DATETIME
);

-- CreateTable
CREATE TABLE "experimental_outreach_login_tokens" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "participant_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "used_at" DATETIME,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "experimental_outreach_login_tokens_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "experimental_outreach_participants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "experimental_outreach_sessions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "participant_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "experimental_outreach_sessions_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "experimental_outreach_participants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "experimental_journalists" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "organisation" TEXT NOT NULL,
    "leaning" TEXT NOT NULL,
    "leaning_confidence" TEXT,
    "category" TEXT,
    "priority_tier" INTEGER,
    "medium" TEXT,
    "website" TEXT,
    "interests" TEXT,
    "notes" TEXT,
    "claimed_by_id" INTEGER,
    "claimed_at" DATETIME,
    "contacted_by_id" INTEGER,
    "contacted_at" DATETIME,
    "sent_leaning" TEXT,
    "skip_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "experimental_journalists_claimed_by_id_fkey" FOREIGN KEY ("claimed_by_id") REFERENCES "experimental_outreach_participants" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "experimental_journalists_contacted_by_id_fkey" FOREIGN KEY ("contacted_by_id") REFERENCES "experimental_outreach_participants" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "experimental_outreach_participants_email_key" ON "experimental_outreach_participants"("email");

-- CreateIndex
CREATE UNIQUE INDEX "experimental_outreach_login_tokens_token_hash_key" ON "experimental_outreach_login_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "idx_experimental_outreach_login_tokens_participant" ON "experimental_outreach_login_tokens"("participant_id");

-- CreateIndex
CREATE UNIQUE INDEX "experimental_outreach_sessions_token_hash_key" ON "experimental_outreach_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "idx_experimental_outreach_sessions_participant" ON "experimental_outreach_sessions"("participant_id");

-- CreateIndex
CREATE UNIQUE INDEX "experimental_journalists_email_key" ON "experimental_journalists"("email");

-- CreateIndex
CREATE INDEX "idx_experimental_journalists_status" ON "experimental_journalists"("contacted_at", "claimed_at");

