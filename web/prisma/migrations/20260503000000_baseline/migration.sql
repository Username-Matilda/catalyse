Loaded Prisma config from prisma.config.ts.

-- CreateTable
CREATE TABLE "admin_invites" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "invite_token" TEXT NOT NULL,
    "invited_by_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "accepted_by_id" INTEGER,
    "accepted_at" DATETIME,
    "expires_at" DATETIME NOT NULL,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_invites_accepted_by_id_fkey" FOREIGN KEY ("accepted_by_id") REFERENCES "volunteers" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "admin_invites_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "volunteers" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "admin_notes" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "volunteer_id" INTEGER NOT NULL,
    "author_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT DEFAULT 'general',
    "related_project_id" INTEGER,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_notes_related_project_id_fkey" FOREIGN KEY ("related_project_id") REFERENCES "projects" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "admin_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "volunteers" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "admin_notes_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "volunteers" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "bug_reports" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "reporter_id" INTEGER,
    "reporter_email" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "page_url" TEXT,
    "category" TEXT DEFAULT 'bug',
    "severity" TEXT DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolution_notes" TEXT,
    "resolved_by_id" INTEGER,
    "resolved_at" DATETIME,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bug_reports_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "volunteers" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "bug_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "volunteers" ("id") ON DELETE SET NULL ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "contact_messages" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "from_volunteer_id" INTEGER NOT NULL,
    "to_volunteer_id" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "related_project_id" INTEGER,
    "read_at" DATETIME,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contact_messages_related_project_id_fkey" FOREIGN KEY ("related_project_id") REFERENCES "projects" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "contact_messages_to_volunteer_id_fkey" FOREIGN KEY ("to_volunteer_id") REFERENCES "volunteers" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "contact_messages_from_volunteer_id_fkey" FOREIGN KEY ("from_volunteer_id") REFERENCES "volunteers" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "deletion_requests" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "volunteer_id" INTEGER NOT NULL,
    "volunteer_email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requested_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "completed_at" DATETIME
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "volunteer_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "read_at" DATETIME,
    "emailed_at" DATETIME,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "volunteers" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "volunteer_id" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "used_at" DATETIME,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_reset_tokens_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "volunteers" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "project_interests" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "volunteer_id" INTEGER NOT NULL,
    "project_id" INTEGER NOT NULL,
    "interest_type" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "response_message" TEXT,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "responded_at" DATETIME,
    CONSTRAINT "project_interests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "project_interests_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "volunteers" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "project_skills" (
    "project_id" INTEGER NOT NULL,
    "skill_id" INTEGER NOT NULL,
    "is_required" BOOLEAN DEFAULT true,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("project_id", "skill_id"),
    CONSTRAINT "project_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "project_skills_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "project_tasks" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "project_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigned_to_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_by_id" INTEGER NOT NULL,
    "completed_at" DATETIME,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "volunteers" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "project_tasks_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "volunteers" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "project_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "project_updates" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "project_id" INTEGER NOT NULL,
    "author_id" INTEGER,
    "content" TEXT NOT NULL,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_updates_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "volunteers" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "project_updates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "projects" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_review',
    "owner_id" INTEGER,
    "proposed_by_id" INTEGER,
    "is_org_proposed" BOOLEAN DEFAULT false,
    "project_type" TEXT,
    "estimated_duration" TEXT,
    "time_commitment_hours_per_week" INTEGER,
    "urgency" TEXT DEFAULT 'medium',
    "review_notes" TEXT,
    "reviewed_by_id" INTEGER,
    "reviewed_at" DATETIME,
    "feedback_to_proposer" TEXT,
    "collaboration_link" TEXT,
    "outcome" TEXT,
    "outcome_notes" TEXT,
    "completed_at" DATETIME,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "country" TEXT,
    "is_seeking_help" BOOLEAN DEFAULT false,
    "is_seeking_owner" BOOLEAN DEFAULT false,
    "local_group" TEXT,
    CONSTRAINT "projects_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "volunteers" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "projects_proposed_by_id_fkey" FOREIGN KEY ("proposed_by_id") REFERENCES "volunteers" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "volunteers" ("id") ON DELETE SET NULL ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "schema_migrations" (
    "filename" TEXT PRIMARY KEY,
    "applied_at" DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "skill_categories" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER DEFAULT 0,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "skill_endorsements" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "volunteer_id" INTEGER NOT NULL,
    "skill_id" INTEGER NOT NULL,
    "endorsed_by_id" INTEGER NOT NULL,
    "source" TEXT DEFAULT 'direct_observation',
    "source_id" INTEGER,
    "rating" TEXT DEFAULT 'verified',
    "notes" TEXT,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "skill_endorsements_endorsed_by_id_fkey" FOREIGN KEY ("endorsed_by_id") REFERENCES "volunteers" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "skill_endorsements_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "skill_endorsements_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "volunteers" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "skills" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "category_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER DEFAULT 0,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "skills_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "skill_categories" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "starter_tasks" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "project_id" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "skill_id" INTEGER,
    "assigned_to_id" INTEGER,
    "assigned_by_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'open',
    "review_rating" TEXT,
    "review_notes" TEXT,
    "feedback_to_volunteer" TEXT,
    "reviewed_by_id" INTEGER,
    "reviewed_at" DATETIME,
    "estimated_hours" REAL,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "starter_tasks_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "volunteers" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "starter_tasks_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "volunteers" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "starter_tasks_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "volunteers" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "starter_tasks_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "starter_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE SET NULL ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "volunteer_skills" (
    "volunteer_id" INTEGER NOT NULL,
    "skill_id" INTEGER NOT NULL,
    "proficiency_level" TEXT DEFAULT 'intermediate',
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("volunteer_id", "skill_id"),
    CONSTRAINT "volunteer_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "volunteer_skills_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "volunteers" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "volunteers" (
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
    "share_contact_directly" BOOLEAN DEFAULT false,
    "profile_visible" BOOLEAN DEFAULT true,
    "other_skills" TEXT,
    "consent_profile_visible" BOOLEAN DEFAULT false,
    "consent_contact_by_owners" BOOLEAN DEFAULT false,
    "consent_given_at" DATETIME,
    "auth_token" TEXT,
    "auth_token_expires_at" DATETIME,
    "password_hash" TEXT,
    "is_admin" BOOLEAN DEFAULT false,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" DATETIME,
    "country" TEXT,
    "email_digest" TEXT DEFAULT 'none',
    "local_group" TEXT
);

-- CreateIndex
Pragma writable_schema=1;
CREATE UNIQUE INDEX "sqlite_autoindex_admin_invites_1" ON "admin_invites"("invite_token");
Pragma writable_schema=0;

-- CreateIndex
CREATE INDEX "idx_admin_invites_token" ON "admin_invites"("invite_token");

-- CreateIndex
CREATE INDEX "idx_admin_invites_email" ON "admin_invites"("email");

-- CreateIndex
CREATE INDEX "idx_admin_notes_volunteer" ON "admin_notes"("volunteer_id");

-- CreateIndex
CREATE INDEX "idx_bug_reports_reporter" ON "bug_reports"("reporter_id");

-- CreateIndex
CREATE INDEX "idx_bug_reports_status" ON "bug_reports"("status");

-- CreateIndex
CREATE INDEX "idx_contact_messages_from" ON "contact_messages"("from_volunteer_id");

-- CreateIndex
CREATE INDEX "idx_contact_messages_to" ON "contact_messages"("to_volunteer_id");

-- CreateIndex
CREATE INDEX "idx_notifications_unread" ON "notifications"("volunteer_id", "read_at");

-- CreateIndex
CREATE INDEX "idx_notifications_volunteer" ON "notifications"("volunteer_id");

-- CreateIndex
Pragma writable_schema=1;
CREATE UNIQUE INDEX "sqlite_autoindex_password_reset_tokens_1" ON "password_reset_tokens"("token");
Pragma writable_schema=0;

-- CreateIndex
CREATE INDEX "idx_password_reset_tokens_volunteer" ON "password_reset_tokens"("volunteer_id");

-- CreateIndex
CREATE INDEX "idx_password_reset_tokens_token" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE INDEX "idx_project_interests_volunteer" ON "project_interests"("volunteer_id");

-- CreateIndex
CREATE INDEX "idx_project_interests_project" ON "project_interests"("project_id");

-- CreateIndex
Pragma writable_schema=1;
CREATE UNIQUE INDEX "sqlite_autoindex_project_interests_1" ON "project_interests"("volunteer_id", "project_id");
Pragma writable_schema=0;

-- CreateIndex
CREATE INDEX "idx_project_skills_skill" ON "project_skills"("skill_id");

-- CreateIndex
CREATE INDEX "idx_project_tasks_assigned" ON "project_tasks"("assigned_to_id");

-- CreateIndex
CREATE INDEX "idx_project_tasks_project" ON "project_tasks"("project_id");

-- CreateIndex
CREATE INDEX "idx_project_updates_project" ON "project_updates"("project_id");

-- CreateIndex
CREATE INDEX "idx_projects_local_group" ON "projects"("local_group");

-- CreateIndex
CREATE INDEX "idx_projects_country" ON "projects"("country");

-- CreateIndex
CREATE INDEX "idx_projects_proposed_by" ON "projects"("proposed_by_id");

-- CreateIndex
CREATE INDEX "idx_projects_owner" ON "projects"("owner_id");

-- CreateIndex
CREATE INDEX "idx_projects_status" ON "projects"("status");

-- CreateIndex
Pragma writable_schema=1;
CREATE UNIQUE INDEX "sqlite_autoindex_skill_categories_1" ON "skill_categories"("name");
Pragma writable_schema=0;

-- CreateIndex
CREATE INDEX "idx_skill_endorsements_volunteer" ON "skill_endorsements"("volunteer_id");

-- CreateIndex
Pragma writable_schema=1;
CREATE UNIQUE INDEX "sqlite_autoindex_skill_endorsements_1" ON "skill_endorsements"("volunteer_id", "skill_id", "endorsed_by_id");
Pragma writable_schema=0;

-- CreateIndex
CREATE INDEX "idx_skills_category" ON "skills"("category_id");

-- CreateIndex
Pragma writable_schema=1;
CREATE UNIQUE INDEX "sqlite_autoindex_skills_1" ON "skills"("category_id", "name");
Pragma writable_schema=0;

-- CreateIndex
CREATE INDEX "idx_starter_tasks_skill" ON "starter_tasks"("skill_id");

-- CreateIndex
CREATE INDEX "idx_starter_tasks_assigned" ON "starter_tasks"("assigned_to_id");

-- CreateIndex
CREATE INDEX "idx_starter_tasks_project" ON "starter_tasks"("project_id");

-- CreateIndex
CREATE INDEX "idx_volunteer_skills_skill" ON "volunteer_skills"("skill_id");

-- CreateIndex
Pragma writable_schema=1;
CREATE UNIQUE INDEX "sqlite_autoindex_volunteers_1" ON "volunteers"("email");
Pragma writable_schema=0;

-- CreateIndex
Pragma writable_schema=1;
CREATE UNIQUE INDEX "sqlite_autoindex_volunteers_2" ON "volunteers"("auth_token");
Pragma writable_schema=0;

-- CreateIndex
CREATE INDEX "idx_volunteers_local_group" ON "volunteers"("local_group");

-- CreateIndex
CREATE INDEX "idx_volunteers_country" ON "volunteers"("country");

-- CreateIndex
CREATE INDEX "idx_volunteers_deleted" ON "volunteers"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_volunteers_auth_token" ON "volunteers"("auth_token");

-- CreateIndex
CREATE INDEX "idx_volunteers_email" ON "volunteers"("email");

