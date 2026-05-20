-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_volunteers" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "bio" TEXT,
    "discord_handle" TEXT,
    "signal_number" TEXT,
    "whatsapp_number" TEXT,
    "contact_preference" TEXT,
    "contact_notes" TEXT,
    "availability_hours_per_week" INTEGER,
    "location" TEXT,
    "other_skills" TEXT,
    "consent_make_profile_visible_in_directory" BOOLEAN DEFAULT false,
    "consent_contactable_by_project_owners" BOOLEAN DEFAULT false,
    "consent_share_contact_info_with_project_owner" BOOLEAN DEFAULT false,
    "consent_given_at" DATETIME,
    "cookie_consent_analytics" BOOLEAN,
    "auth_token" TEXT,
    "auth_token_expires_at" DATETIME,
    "password_hash" TEXT,
    "is_admin" BOOLEAN DEFAULT false,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" DATETIME,
    "country" TEXT,
    "email_digest" TEXT DEFAULT 'none',
    "local_group" TEXT,
    "approval_status" TEXT NOT NULL DEFAULT 'pending',
    "application_message" TEXT,
    "application_admin_notes" TEXT,
    "application_applicant_notes" TEXT,
    "rejected_at" DATETIME,
    "reviewer_id" INTEGER,
    "email_confirmed" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "volunteers_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "volunteers" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
INSERT INTO "new_volunteers" ("application_admin_notes", "application_applicant_notes", "application_message", "approval_status", "auth_token", "auth_token_expires_at", "availability_hours_per_week", "bio", "consent_contactable_by_project_owners", "consent_given_at", "consent_make_profile_visible_in_directory", "consent_share_contact_info_with_project_owner", "contact_notes", "contact_preference", "cookie_consent_analytics", "country", "created_at", "deleted_at", "discord_handle", "email", "email_confirmed", "email_digest", "id", "is_admin", "local_group", "location", "name", "other_skills", "password_hash", "rejected_at", "reviewer_id", "signal_number", "updated_at", "whatsapp_number")
SELECT "application_admin_notes", "application_applicant_notes", "application_message",
  CASE "approval_status"
    WHEN 'PENDING' THEN 'pending'
    WHEN 'UNDER_REVIEW' THEN 'under_review'
    WHEN 'APPROVED' THEN 'approved'
    WHEN 'REJECTED' THEN 'rejected'
    ELSE "approval_status"
  END,
  "auth_token", "auth_token_expires_at", "availability_hours_per_week", "bio", "consent_contactable_by_project_owners", "consent_given_at", "consent_make_profile_visible_in_directory", "consent_share_contact_info_with_project_owner", "contact_notes", "contact_preference", "cookie_consent_analytics", "country", "created_at", "deleted_at", "discord_handle", "email", "email_confirmed", "email_digest", "id", "is_admin", "local_group", "location", "name", "other_skills", "password_hash", "rejected_at", "reviewer_id", "signal_number", "updated_at", "whatsapp_number" FROM "volunteers";
DROP TABLE "volunteers";
ALTER TABLE "new_volunteers" RENAME TO "volunteers";
Pragma writable_schema=1;
CREATE UNIQUE INDEX "sqlite_autoindex_volunteers_1" ON "volunteers"("email");
Pragma writable_schema=0;
Pragma writable_schema=1;
CREATE UNIQUE INDEX "sqlite_autoindex_volunteers_2" ON "volunteers"("auth_token");
Pragma writable_schema=0;
CREATE INDEX "idx_volunteers_local_group" ON "volunteers"("local_group");
CREATE INDEX "idx_volunteers_country" ON "volunteers"("country");
CREATE INDEX "idx_volunteers_deleted" ON "volunteers"("deleted_at");
CREATE INDEX "idx_volunteers_auth_token" ON "volunteers"("auth_token");
CREATE INDEX "idx_volunteers_email" ON "volunteers"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
