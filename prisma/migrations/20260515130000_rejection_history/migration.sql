-- Create anonymised_emails table for prior-rejection detection at signup
CREATE TABLE "anonymised_emails" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email_hash" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "anonymised_emails_email_hash_key" ON "anonymised_emails"("email_hash");

-- Drop unique constraint on rejected_applications.email_hash (allow multiple rows per email)
DROP INDEX "rejected_applications_email_hash_key";

CREATE INDEX "idx_rejected_applications_email_hash" ON "rejected_applications"("email_hash");

-- Drop previous_rejection_id FK from volunteers
ALTER TABLE "volunteers" DROP COLUMN "previous_rejection_id";
