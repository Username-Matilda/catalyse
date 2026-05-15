CREATE TABLE "rejected_applications" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email_hash" TEXT NOT NULL,
    "rejected_at" DATETIME NOT NULL,
    "admin_notes" TEXT,
    "applicant_notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "rejected_applications_email_hash_key" ON "rejected_applications"("email_hash");

ALTER TABLE "volunteers" ADD COLUMN "application_admin_notes" TEXT;
ALTER TABLE "volunteers" ADD COLUMN "application_applicant_notes" TEXT;
ALTER TABLE "volunteers" ADD COLUMN "rejected_at" DATETIME;
ALTER TABLE "volunteers" ADD COLUMN "reviewer_id" INTEGER REFERENCES "volunteers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "volunteers" ADD COLUMN "previous_rejection_id" INTEGER REFERENCES "rejected_applications"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
