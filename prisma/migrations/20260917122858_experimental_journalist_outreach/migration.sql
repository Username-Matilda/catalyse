-- CreateEnum
CREATE TYPE "ExperimentalJournalistLeaning" AS ENUM ('REPUBLICAN', 'DEMOCRAT');

-- CreateEnum
CREATE TYPE "ExperimentalLeaningConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "experimental_outreach_participants" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3),

    CONSTRAINT "experimental_outreach_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experimental_outreach_login_tokens" (
    "id" SERIAL NOT NULL,
    "participant_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experimental_outreach_login_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experimental_outreach_sessions" (
    "id" SERIAL NOT NULL,
    "participant_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experimental_outreach_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experimental_journalists" (
    "id" SERIAL NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "organisation" TEXT NOT NULL,
    "leaning" "ExperimentalJournalistLeaning" NOT NULL,
    "leaning_confidence" "ExperimentalLeaningConfidence",
    "category" TEXT,
    "priority_tier" INTEGER,
    "medium" TEXT,
    "website" TEXT,
    "interests" TEXT,
    "notes" TEXT,
    "claimed_by_id" INTEGER,
    "claimed_at" TIMESTAMP(3),
    "contacted_by_id" INTEGER,
    "contacted_at" TIMESTAMP(3),
    "sent_leaning" "ExperimentalJournalistLeaning",
    "skip_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experimental_journalists_pkey" PRIMARY KEY ("id")
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

-- AddForeignKey
ALTER TABLE "experimental_outreach_login_tokens" ADD CONSTRAINT "experimental_outreach_login_tokens_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "experimental_outreach_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experimental_outreach_sessions" ADD CONSTRAINT "experimental_outreach_sessions_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "experimental_outreach_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experimental_journalists" ADD CONSTRAINT "experimental_journalists_claimed_by_id_fkey" FOREIGN KEY ("claimed_by_id") REFERENCES "experimental_outreach_participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experimental_journalists" ADD CONSTRAINT "experimental_journalists_contacted_by_id_fkey" FOREIGN KEY ("contacted_by_id") REFERENCES "experimental_outreach_participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

