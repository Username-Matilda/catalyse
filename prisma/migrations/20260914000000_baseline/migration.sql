-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('draft', 'pending_review', 'needs_discussion', 'ready', 'in_progress', 'on_hold', 'completed', 'archived');

-- CreateEnum
CREATE TYPE "WorkItemType" AS ENUM ('PROJECT', 'TASK', 'QUICK_TASK');

-- CreateEnum
CREATE TYPE "TemplateSourceType" AS ENUM ('PROJECT', 'QUICK_TASK');

-- CreateEnum
CREATE TYPE "RemoteEligibility" AS ENUM ('NONE', 'COUNTRY', 'GLOBAL');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('open', 'in_progress', 'completed');

-- CreateEnum
CREATE TYPE "QuickTaskStatus" AS ENUM ('open', 'in_progress', 'under_review', 'completed');

-- CreateEnum
CREATE TYPE "InterestStatus" AS ENUM ('pending', 'accepted', 'declined', 'withdrawn');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('pending', 'under_review', 'needs_info', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('pending', 'accepted', 'expired', 'revoked');

-- CreateEnum
CREATE TYPE "LocalGroupSuggestionStatus" AS ENUM ('pending', 'accepted', 'merged', 'on_hold', 'declined');

-- CreateEnum
CREATE TYPE "TeamSuggestionStatus" AS ENUM ('pending', 'accepted', 'merged', 'on_hold', 'declined');

-- CreateEnum
CREATE TYPE "TeamMembershipRole" AS ENUM ('member', 'leader');

-- CreateEnum
CREATE TYPE "TeamJoinRequestStatus" AS ENUM ('pending', 'accepted', 'declined');

-- CreateEnum
CREATE TYPE "SkillEndorsementSource" AS ENUM ('project_outcome', 'quick_task', 'direct_observation');

-- CreateEnum
CREATE TYPE "SkillEndorsementRating" AS ENUM ('verified', 'strong', 'developing');

-- CreateTable
CREATE TABLE "admin_invites" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "invite_token" TEXT NOT NULL,
    "invited_by_id" INTEGER NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'pending',
    "accepted_by_id" INTEGER,
    "accepted_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_notes" (
    "id" SERIAL NOT NULL,
    "volunteer_id" INTEGER NOT NULL,
    "author_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT DEFAULT 'general',
    "related_work_item_id" INTEGER,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bug_reports" (
    "id" SERIAL NOT NULL,
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
    "resolved_at" TIMESTAMP(3),
    "assignee_id" INTEGER,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bug_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bug_report_comments" (
    "id" SERIAL NOT NULL,
    "bug_report_id" INTEGER NOT NULL,
    "author_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bug_report_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_messages" (
    "id" SERIAL NOT NULL,
    "from_volunteer_id" INTEGER NOT NULL,
    "to_volunteer_id" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "related_work_item_id" INTEGER,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deletion_requests" (
    "id" SERIAL NOT NULL,
    "volunteer_id" INTEGER NOT NULL,
    "volunteer_email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requested_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "deletion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "volunteer_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "entity_id" INTEGER,
    "read_at" TIMESTAMP(3),
    "emailed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" SERIAL NOT NULL,
    "volunteer_id" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" SERIAL NOT NULL,
    "volunteer_id" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_items" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "deadline" TIMESTAMP(3),
    "parent_id" INTEGER,
    "context_project_id" INTEGER,
    "creator_id" INTEGER,
    "assignee_id" INTEGER,
    "stakeholder_id" INTEGER,
    "reviewed_by_id" INTEGER,
    "reviewed_at" TIMESTAMP(3),
    "review_notes" TEXT,
    "review_rating" TEXT,
    "project_type" TEXT,
    "urgency" TEXT DEFAULT 'medium',
    "estimated_duration" TEXT,
    "time_commitment_hours_per_week" INTEGER,
    "collaboration_link" TEXT,
    "is_org_proposed" BOOLEAN DEFAULT false,
    "is_seeking_help" BOOLEAN DEFAULT false,
    "outcome" TEXT,
    "outcome_notes" TEXT,
    "completed_at" TIMESTAMP(3),
    "skill_id" INTEGER,
    "estimated_hours" DOUBLE PRECISION,
    "nudge_sent_at" TIMESTAMP(3),
    "final_warning_sent_at" TIMESTAMP(3),
    "sort_order" INTEGER DEFAULT 0,
    "featured_as_quick_task" BOOLEAN DEFAULT false,
    "start_date" TIMESTAMP(3),
    "duration_days" INTEGER,
    "baseline_start_date" TIMESTAMP(3),
    "baseline_duration_days" INTEGER,
    "baseline_set_at" TIMESTAMP(3),
    "is_anchor" BOOLEAN NOT NULL DEFAULT false,
    "schedule_updated_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "country" TEXT,
    "local_group" TEXT,
    "remote_eligibility" "RemoteEligibility" NOT NULL DEFAULT 'NONE',
    "team_id" INTEGER,
    "template_origin_id" INTEGER,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_item_comments" (
    "id" SERIAL NOT NULL,
    "work_item_id" INTEGER NOT NULL,
    "author_id" INTEGER,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_item_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_item_dependencies" (
    "id" SERIAL NOT NULL,
    "predecessor_id" INTEGER NOT NULL,
    "successor_id" INTEGER NOT NULL,
    "lag_days" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" INTEGER,

    CONSTRAINT "work_item_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_item_skills" (
    "work_item_id" INTEGER NOT NULL,
    "skill_id" INTEGER NOT NULL,
    "is_required" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_item_skills_pkey" PRIMARY KEY ("work_item_id","skill_id")
);

-- CreateTable
CREATE TABLE "work_item_interests" (
    "id" SERIAL NOT NULL,
    "volunteer_id" INTEGER NOT NULL,
    "work_item_id" INTEGER NOT NULL,
    "interest_type" TEXT NOT NULL,
    "message" TEXT,
    "status" "InterestStatus" NOT NULL DEFAULT 'pending',
    "response_message" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "work_item_interests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "source_type" "TemplateSourceType" NOT NULL DEFAULT 'PROJECT',
    "template_schema_version" INTEGER NOT NULL DEFAULT 1,
    "structure" TEXT NOT NULL,
    "created_by_id" INTEGER,
    "source_project_id" INTEGER,
    "source_country" TEXT,
    "source_local_group" TEXT,
    "source_team_id" INTEGER,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "local_groups" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,

    CONSTRAINT "local_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "local_group_suggestions" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "status" "LocalGroupSuggestionStatus" NOT NULL DEFAULT 'pending',
    "suggested_by_id" INTEGER NOT NULL,
    "reviewed_by_id" INTEGER,
    "reviewed_at" TIMESTAMP(3),
    "admin_notes" TEXT,
    "merged_into_id" INTEGER,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "local_group_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "luma_url" TEXT,
    "doc_url" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_memberships" (
    "id" SERIAL NOT NULL,
    "team_id" INTEGER NOT NULL,
    "volunteer_id" INTEGER NOT NULL,
    "role" "TeamMembershipRole" NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_join_requests" (
    "id" SERIAL NOT NULL,
    "team_id" INTEGER NOT NULL,
    "volunteer_id" INTEGER NOT NULL,
    "message" TEXT,
    "status" "TeamJoinRequestStatus" NOT NULL DEFAULT 'pending',
    "reviewed_by_id" INTEGER,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_join_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_suggestions" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "TeamSuggestionStatus" NOT NULL DEFAULT 'pending',
    "suggested_by_id" INTEGER NOT NULL,
    "reviewed_by_id" INTEGER,
    "reviewed_at" TIMESTAMP(3),
    "admin_notes" TEXT,
    "merged_into_id" INTEGER,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digest_runs" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "digest_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications_summary_runs" (
    "id" SERIAL NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "applications_summary_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cron_job_runs" (
    "id" SERIAL NOT NULL,
    "job_name" TEXT NOT NULL,
    "triggered_by" TEXT NOT NULL DEFAULT 'cron',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "summary" TEXT,

    CONSTRAINT "cron_job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schema_migrations" (
    "filename" TEXT,
    "applied_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schema_migrations_pkey" PRIMARY KEY ("filename")
);

-- CreateTable
CREATE TABLE "skill_categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER DEFAULT 0,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_endorsements" (
    "id" SERIAL NOT NULL,
    "volunteer_id" INTEGER NOT NULL,
    "skill_id" INTEGER NOT NULL,
    "endorsed_by_id" INTEGER NOT NULL,
    "source" "SkillEndorsementSource" DEFAULT 'direct_observation',
    "source_id" INTEGER,
    "rating" "SkillEndorsementRating" DEFAULT 'verified',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_endorsements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" SERIAL NOT NULL,
    "category_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER DEFAULT 0,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volunteer_skills" (
    "volunteer_id" INTEGER NOT NULL,
    "skill_id" INTEGER NOT NULL,
    "proficiency_level" TEXT DEFAULT 'intermediate',
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "volunteer_skills_pkey" PRIMARY KEY ("volunteer_id","skill_id")
);

-- CreateTable
CREATE TABLE "volunteers" (
    "id" SERIAL NOT NULL,
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
    "consent_given_at" TIMESTAMP(3),
    "cookie_consent_analytics" BOOLEAN,
    "auth_token" TEXT,
    "auth_token_expires_at" TIMESTAMP(3),
    "password_hash" TEXT,
    "is_admin" BOOLEAN DEFAULT false,
    "is_technical_admin" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "country" TEXT,
    "email_digest" TEXT DEFAULT 'none',
    "notify_remote_projects" BOOLEAN NOT NULL DEFAULT false,
    "local_group" TEXT,
    "location_confirmed_at" TIMESTAMP(3),
    "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "application_message" TEXT,
    "application_admin_notes" TEXT,
    "application_applicant_notes" TEXT,
    "rejected_at" TIMESTAMP(3),
    "reviewer_id" INTEGER,
    "email_confirmed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "volunteers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" SERIAL NOT NULL,
    "volunteer_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rejected_applications" (
    "id" SERIAL NOT NULL,
    "email_hash" TEXT NOT NULL,
    "rejected_at" TIMESTAMP(3) NOT NULL,
    "admin_notes" TEXT,
    "applicant_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rejected_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anonymised_emails" (
    "id" SERIAL NOT NULL,
    "email_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reapply_allowed_at" TIMESTAMP(3),

    CONSTRAINT "anonymised_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "require_application_approval" BOOLEAN NOT NULL DEFAULT true,
    "csp_violation_count" INTEGER NOT NULL DEFAULT 0,
    "csp_summary_last_sent_at" TIMESTAMP(3),

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_invites_invite_token_key" ON "admin_invites"("invite_token");

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
CREATE INDEX "idx_bug_reports_assignee" ON "bug_reports"("assignee_id");

-- CreateIndex
CREATE INDEX "idx_bug_report_comments_thread" ON "bug_report_comments"("bug_report_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_contact_messages_from" ON "contact_messages"("from_volunteer_id");

-- CreateIndex
CREATE INDEX "idx_contact_messages_to" ON "contact_messages"("to_volunteer_id");

-- CreateIndex
CREATE INDEX "idx_notifications_unread" ON "notifications"("volunteer_id", "read_at");

-- CreateIndex
CREATE INDEX "idx_notifications_volunteer" ON "notifications"("volunteer_id");

-- CreateIndex
CREATE INDEX "idx_notifications_type_entity" ON "notifications"("type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE INDEX "idx_password_reset_tokens_volunteer" ON "password_reset_tokens"("volunteer_id");

-- CreateIndex
CREATE INDEX "idx_password_reset_tokens_token" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_token_key" ON "email_verification_tokens"("token");

-- CreateIndex
CREATE INDEX "idx_email_verification_tokens_volunteer" ON "email_verification_tokens"("volunteer_id");

-- CreateIndex
CREATE INDEX "idx_email_verification_tokens_token" ON "email_verification_tokens"("token");

-- CreateIndex
CREATE INDEX "idx_work_items_type" ON "work_items"("type");

-- CreateIndex
CREATE INDEX "idx_work_items_status" ON "work_items"("status");

-- CreateIndex
CREATE INDEX "idx_work_items_parent" ON "work_items"("parent_id");

-- CreateIndex
CREATE INDEX "idx_work_items_context" ON "work_items"("context_project_id");

-- CreateIndex
CREATE INDEX "idx_work_items_creator" ON "work_items"("creator_id");

-- CreateIndex
CREATE INDEX "idx_work_items_assignee" ON "work_items"("assignee_id");

-- CreateIndex
CREATE INDEX "idx_work_items_skill" ON "work_items"("skill_id");

-- CreateIndex
CREATE INDEX "idx_work_items_local_group" ON "work_items"("local_group");

-- CreateIndex
CREATE INDEX "idx_work_items_country" ON "work_items"("country");

-- CreateIndex
CREATE INDEX "idx_work_items_team" ON "work_items"("team_id");

-- CreateIndex
CREATE INDEX "idx_work_items_template_origin" ON "work_items"("template_origin_id");

-- CreateIndex
CREATE INDEX "idx_work_item_comments_thread" ON "work_item_comments"("work_item_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_work_item_dependencies_successor" ON "work_item_dependencies"("successor_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_work_item_dependencies_pair" ON "work_item_dependencies"("predecessor_id", "successor_id");

-- CreateIndex
CREATE INDEX "idx_work_item_skills_skill" ON "work_item_skills"("skill_id");

-- CreateIndex
CREATE INDEX "idx_work_item_interests_volunteer" ON "work_item_interests"("volunteer_id");

-- CreateIndex
CREATE INDEX "idx_work_item_interests_work_item" ON "work_item_interests"("work_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_work_item_interests_volunteer_item" ON "work_item_interests"("volunteer_id", "work_item_id");

-- CreateIndex
CREATE INDEX "idx_templates_source_type" ON "templates"("source_type");

-- CreateIndex
CREATE INDEX "idx_templates_created_by" ON "templates"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_local_groups_country" ON "local_groups"("country");

-- CreateIndex
CREATE INDEX "idx_local_group_suggestions_status" ON "local_group_suggestions"("status");

-- CreateIndex
CREATE INDEX "idx_local_group_suggestions_suggested_by" ON "local_group_suggestions"("suggested_by_id");

-- CreateIndex
CREATE INDEX "idx_team_memberships_volunteer" ON "team_memberships"("volunteer_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_team_memberships_team_volunteer" ON "team_memberships"("team_id", "volunteer_id");

-- CreateIndex
CREATE INDEX "idx_team_join_requests_team_status" ON "team_join_requests"("team_id", "status");

-- CreateIndex
CREATE INDEX "idx_team_join_requests_volunteer" ON "team_join_requests"("volunteer_id");

-- CreateIndex
CREATE INDEX "idx_team_suggestions_status" ON "team_suggestions"("status");

-- CreateIndex
CREATE INDEX "idx_team_suggestions_suggested_by" ON "team_suggestions"("suggested_by_id");

-- CreateIndex
CREATE INDEX "idx_digest_runs_type" ON "digest_runs"("type");

-- CreateIndex
CREATE INDEX "idx_cron_job_runs_job_name" ON "cron_job_runs"("job_name");

-- CreateIndex
CREATE UNIQUE INDEX "skill_categories_name_key" ON "skill_categories"("name");

-- CreateIndex
CREATE INDEX "idx_skill_endorsements_volunteer" ON "skill_endorsements"("volunteer_id");

-- CreateIndex
CREATE UNIQUE INDEX "skill_endorsements_volunteer_id_skill_id_endorsed_by_id_key" ON "skill_endorsements"("volunteer_id", "skill_id", "endorsed_by_id");

-- CreateIndex
CREATE INDEX "idx_skills_category" ON "skills"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "skills_category_id_name_key" ON "skills"("category_id", "name");

-- CreateIndex
CREATE INDEX "idx_volunteer_skills_skill" ON "volunteer_skills"("skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "volunteers_email_key" ON "volunteers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "volunteers_auth_token_key" ON "volunteers"("auth_token");

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

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "idx_sessions_volunteer" ON "sessions"("volunteer_id");

-- CreateIndex
CREATE INDEX "idx_rejected_applications_email_hash" ON "rejected_applications"("email_hash");

-- CreateIndex
CREATE UNIQUE INDEX "anonymised_emails_email_hash_key" ON "anonymised_emails"("email_hash");

-- AddForeignKey
ALTER TABLE "admin_invites" ADD CONSTRAINT "admin_invites_accepted_by_id_fkey" FOREIGN KEY ("accepted_by_id") REFERENCES "volunteers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "admin_invites" ADD CONSTRAINT "admin_invites_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "volunteers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "admin_notes" ADD CONSTRAINT "admin_notes_related_work_item_id_fkey" FOREIGN KEY ("related_work_item_id") REFERENCES "work_items"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "admin_notes" ADD CONSTRAINT "admin_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "volunteers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "admin_notes" ADD CONSTRAINT "admin_notes_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "volunteers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "volunteers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "volunteers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "volunteers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bug_report_comments" ADD CONSTRAINT "bug_report_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "volunteers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bug_report_comments" ADD CONSTRAINT "bug_report_comments_bug_report_id_fkey" FOREIGN KEY ("bug_report_id") REFERENCES "bug_reports"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_related_work_item_id_fkey" FOREIGN KEY ("related_work_item_id") REFERENCES "work_items"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_to_volunteer_id_fkey" FOREIGN KEY ("to_volunteer_id") REFERENCES "volunteers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_from_volunteer_id_fkey" FOREIGN KEY ("from_volunteer_id") REFERENCES "volunteers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "volunteers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "volunteers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "volunteers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_context_project_id_fkey" FOREIGN KEY ("context_project_id") REFERENCES "work_items"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "volunteers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_template_origin_id_fkey" FOREIGN KEY ("template_origin_id") REFERENCES "templates"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "volunteers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_stakeholder_id_fkey" FOREIGN KEY ("stakeholder_id") REFERENCES "volunteers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "volunteers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "work_item_comments" ADD CONSTRAINT "work_item_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "volunteers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "work_item_comments" ADD CONSTRAINT "work_item_comments_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "work_item_dependencies" ADD CONSTRAINT "work_item_dependencies_predecessor_id_fkey" FOREIGN KEY ("predecessor_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "work_item_dependencies" ADD CONSTRAINT "work_item_dependencies_successor_id_fkey" FOREIGN KEY ("successor_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "work_item_dependencies" ADD CONSTRAINT "work_item_dependencies_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "volunteers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "work_item_skills" ADD CONSTRAINT "work_item_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "work_item_skills" ADD CONSTRAINT "work_item_skills_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "work_item_interests" ADD CONSTRAINT "work_item_interests_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "work_item_interests" ADD CONSTRAINT "work_item_interests_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "volunteers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "volunteers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_source_project_id_fkey" FOREIGN KEY ("source_project_id") REFERENCES "work_items"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_source_team_id_fkey" FOREIGN KEY ("source_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "local_group_suggestions" ADD CONSTRAINT "local_group_suggestions_suggested_by_id_fkey" FOREIGN KEY ("suggested_by_id") REFERENCES "volunteers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local_group_suggestions" ADD CONSTRAINT "local_group_suggestions_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "volunteers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local_group_suggestions" ADD CONSTRAINT "local_group_suggestions_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "local_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "volunteers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "team_join_requests" ADD CONSTRAINT "team_join_requests_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "team_join_requests" ADD CONSTRAINT "team_join_requests_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "volunteers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "team_join_requests" ADD CONSTRAINT "team_join_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "volunteers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "team_suggestions" ADD CONSTRAINT "team_suggestions_suggested_by_id_fkey" FOREIGN KEY ("suggested_by_id") REFERENCES "volunteers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_suggestions" ADD CONSTRAINT "team_suggestions_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "volunteers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_suggestions" ADD CONSTRAINT "team_suggestions_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_endorsements" ADD CONSTRAINT "skill_endorsements_endorsed_by_id_fkey" FOREIGN KEY ("endorsed_by_id") REFERENCES "volunteers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "skill_endorsements" ADD CONSTRAINT "skill_endorsements_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "skill_endorsements" ADD CONSTRAINT "skill_endorsements_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "volunteers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "skill_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "volunteer_skills" ADD CONSTRAINT "volunteer_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "volunteer_skills" ADD CONSTRAINT "volunteer_skills_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "volunteers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "volunteers" ADD CONSTRAINT "volunteers_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "volunteers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "volunteers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

