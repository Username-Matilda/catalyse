-- Normalise legacy text-format DateTime values to integer epoch-milliseconds.
--
-- Rows created before the FastAPI->Next/Prisma cutover (~2026-05) were stored as
-- ISO / space-separated text (e.g. '2026-03-23 15:55:32', '2026-03-25T18:14:04Z').
-- Prisma stores DateTime as integer milliseconds. SQLite orders INTEGER < TEXT,
-- so every range filter (`{ gt/gte/lt/lte }`) and `ORDER BY` on a column holding
-- both formats is wrong -- legacy rows sort/compare as if newer than any real
-- integer timestamp. This rewrites the text rows to integer ms, in place.
--
-- UTC is assumed (the old backend stored UTC). Sub-second precision on legacy
-- rows is dropped. `strftime` normalises the 'T' separator and trailing 'Z';
-- any value it cannot parse is left as-is (COALESCE fallback) so no data is
-- nulled -- run the verification query afterwards to confirm none remain.

UPDATE "admin_invites" SET "accepted_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("accepted_at",'.') > 0 THEN substr("accepted_at",1,instr("accepted_at",'.')-1) ELSE "accepted_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "accepted_at"
)
WHERE typeof("accepted_at") = 'text';

UPDATE "admin_invites" SET "expires_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("expires_at",'.') > 0 THEN substr("expires_at",1,instr("expires_at",'.')-1) ELSE "expires_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "expires_at"
)
WHERE typeof("expires_at") = 'text';

UPDATE "admin_invites" SET "created_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("created_at",'.') > 0 THEN substr("created_at",1,instr("created_at",'.')-1) ELSE "created_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "created_at"
)
WHERE typeof("created_at") = 'text';

UPDATE "admin_notes" SET "created_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("created_at",'.') > 0 THEN substr("created_at",1,instr("created_at",'.')-1) ELSE "created_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "created_at"
)
WHERE typeof("created_at") = 'text';

UPDATE "admin_notes" SET "updated_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("updated_at",'.') > 0 THEN substr("updated_at",1,instr("updated_at",'.')-1) ELSE "updated_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "updated_at"
)
WHERE typeof("updated_at") = 'text';

UPDATE "bug_reports" SET "resolved_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("resolved_at",'.') > 0 THEN substr("resolved_at",1,instr("resolved_at",'.')-1) ELSE "resolved_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "resolved_at"
)
WHERE typeof("resolved_at") = 'text';

UPDATE "bug_reports" SET "created_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("created_at",'.') > 0 THEN substr("created_at",1,instr("created_at",'.')-1) ELSE "created_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "created_at"
)
WHERE typeof("created_at") = 'text';

UPDATE "bug_report_comments" SET "created_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("created_at",'.') > 0 THEN substr("created_at",1,instr("created_at",'.')-1) ELSE "created_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "created_at"
)
WHERE typeof("created_at") = 'text';

UPDATE "contact_messages" SET "read_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("read_at",'.') > 0 THEN substr("read_at",1,instr("read_at",'.')-1) ELSE "read_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "read_at"
)
WHERE typeof("read_at") = 'text';

UPDATE "contact_messages" SET "created_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("created_at",'.') > 0 THEN substr("created_at",1,instr("created_at",'.')-1) ELSE "created_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "created_at"
)
WHERE typeof("created_at") = 'text';

UPDATE "deletion_requests" SET "requested_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("requested_at",'.') > 0 THEN substr("requested_at",1,instr("requested_at",'.')-1) ELSE "requested_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "requested_at"
)
WHERE typeof("requested_at") = 'text';

UPDATE "deletion_requests" SET "completed_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("completed_at",'.') > 0 THEN substr("completed_at",1,instr("completed_at",'.')-1) ELSE "completed_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "completed_at"
)
WHERE typeof("completed_at") = 'text';

UPDATE "notifications" SET "read_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("read_at",'.') > 0 THEN substr("read_at",1,instr("read_at",'.')-1) ELSE "read_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "read_at"
)
WHERE typeof("read_at") = 'text';

UPDATE "notifications" SET "emailed_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("emailed_at",'.') > 0 THEN substr("emailed_at",1,instr("emailed_at",'.')-1) ELSE "emailed_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "emailed_at"
)
WHERE typeof("emailed_at") = 'text';

UPDATE "notifications" SET "created_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("created_at",'.') > 0 THEN substr("created_at",1,instr("created_at",'.')-1) ELSE "created_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "created_at"
)
WHERE typeof("created_at") = 'text';

UPDATE "password_reset_tokens" SET "expires_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("expires_at",'.') > 0 THEN substr("expires_at",1,instr("expires_at",'.')-1) ELSE "expires_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "expires_at"
)
WHERE typeof("expires_at") = 'text';

UPDATE "password_reset_tokens" SET "used_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("used_at",'.') > 0 THEN substr("used_at",1,instr("used_at",'.')-1) ELSE "used_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "used_at"
)
WHERE typeof("used_at") = 'text';

UPDATE "password_reset_tokens" SET "created_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("created_at",'.') > 0 THEN substr("created_at",1,instr("created_at",'.')-1) ELSE "created_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "created_at"
)
WHERE typeof("created_at") = 'text';

UPDATE "email_verification_tokens" SET "expires_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("expires_at",'.') > 0 THEN substr("expires_at",1,instr("expires_at",'.')-1) ELSE "expires_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "expires_at"
)
WHERE typeof("expires_at") = 'text';

UPDATE "email_verification_tokens" SET "used_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("used_at",'.') > 0 THEN substr("used_at",1,instr("used_at",'.')-1) ELSE "used_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "used_at"
)
WHERE typeof("used_at") = 'text';

UPDATE "email_verification_tokens" SET "created_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("created_at",'.') > 0 THEN substr("created_at",1,instr("created_at",'.')-1) ELSE "created_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "created_at"
)
WHERE typeof("created_at") = 'text';

UPDATE "work_items" SET "deadline" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("deadline",'.') > 0 THEN substr("deadline",1,instr("deadline",'.')-1) ELSE "deadline" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "deadline"
)
WHERE typeof("deadline") = 'text';

UPDATE "work_items" SET "reviewed_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("reviewed_at",'.') > 0 THEN substr("reviewed_at",1,instr("reviewed_at",'.')-1) ELSE "reviewed_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "reviewed_at"
)
WHERE typeof("reviewed_at") = 'text';

UPDATE "work_items" SET "completed_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("completed_at",'.') > 0 THEN substr("completed_at",1,instr("completed_at",'.')-1) ELSE "completed_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "completed_at"
)
WHERE typeof("completed_at") = 'text';

UPDATE "work_items" SET "nudge_sent_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("nudge_sent_at",'.') > 0 THEN substr("nudge_sent_at",1,instr("nudge_sent_at",'.')-1) ELSE "nudge_sent_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "nudge_sent_at"
)
WHERE typeof("nudge_sent_at") = 'text';

UPDATE "work_items" SET "final_warning_sent_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("final_warning_sent_at",'.') > 0 THEN substr("final_warning_sent_at",1,instr("final_warning_sent_at",'.')-1) ELSE "final_warning_sent_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "final_warning_sent_at"
)
WHERE typeof("final_warning_sent_at") = 'text';

UPDATE "work_items" SET "created_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("created_at",'.') > 0 THEN substr("created_at",1,instr("created_at",'.')-1) ELSE "created_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "created_at"
)
WHERE typeof("created_at") = 'text';

UPDATE "work_items" SET "updated_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("updated_at",'.') > 0 THEN substr("updated_at",1,instr("updated_at",'.')-1) ELSE "updated_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "updated_at"
)
WHERE typeof("updated_at") = 'text';

UPDATE "work_item_comments" SET "created_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("created_at",'.') > 0 THEN substr("created_at",1,instr("created_at",'.')-1) ELSE "created_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "created_at"
)
WHERE typeof("created_at") = 'text';

UPDATE "work_item_skills" SET "created_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("created_at",'.') > 0 THEN substr("created_at",1,instr("created_at",'.')-1) ELSE "created_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "created_at"
)
WHERE typeof("created_at") = 'text';

UPDATE "work_item_interests" SET "created_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("created_at",'.') > 0 THEN substr("created_at",1,instr("created_at",'.')-1) ELSE "created_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "created_at"
)
WHERE typeof("created_at") = 'text';

UPDATE "work_item_interests" SET "responded_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("responded_at",'.') > 0 THEN substr("responded_at",1,instr("responded_at",'.')-1) ELSE "responded_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "responded_at"
)
WHERE typeof("responded_at") = 'text';

UPDATE "local_group_suggestions" SET "reviewed_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("reviewed_at",'.') > 0 THEN substr("reviewed_at",1,instr("reviewed_at",'.')-1) ELSE "reviewed_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "reviewed_at"
)
WHERE typeof("reviewed_at") = 'text';

UPDATE "local_group_suggestions" SET "created_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("created_at",'.') > 0 THEN substr("created_at",1,instr("created_at",'.')-1) ELSE "created_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "created_at"
)
WHERE typeof("created_at") = 'text';

UPDATE "local_group_suggestions" SET "updated_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("updated_at",'.') > 0 THEN substr("updated_at",1,instr("updated_at",'.')-1) ELSE "updated_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "updated_at"
)
WHERE typeof("updated_at") = 'text';

UPDATE "teams" SET "created_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("created_at",'.') > 0 THEN substr("created_at",1,instr("created_at",'.')-1) ELSE "created_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "created_at"
)
WHERE typeof("created_at") = 'text';

UPDATE "team_memberships" SET "joined_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("joined_at",'.') > 0 THEN substr("joined_at",1,instr("joined_at",'.')-1) ELSE "joined_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "joined_at"
)
WHERE typeof("joined_at") = 'text';

UPDATE "team_join_requests" SET "reviewed_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("reviewed_at",'.') > 0 THEN substr("reviewed_at",1,instr("reviewed_at",'.')-1) ELSE "reviewed_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "reviewed_at"
)
WHERE typeof("reviewed_at") = 'text';

UPDATE "team_join_requests" SET "created_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("created_at",'.') > 0 THEN substr("created_at",1,instr("created_at",'.')-1) ELSE "created_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "created_at"
)
WHERE typeof("created_at") = 'text';

UPDATE "team_suggestions" SET "reviewed_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("reviewed_at",'.') > 0 THEN substr("reviewed_at",1,instr("reviewed_at",'.')-1) ELSE "reviewed_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "reviewed_at"
)
WHERE typeof("reviewed_at") = 'text';

UPDATE "team_suggestions" SET "created_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("created_at",'.') > 0 THEN substr("created_at",1,instr("created_at",'.')-1) ELSE "created_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "created_at"
)
WHERE typeof("created_at") = 'text';

UPDATE "team_suggestions" SET "updated_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("updated_at",'.') > 0 THEN substr("updated_at",1,instr("updated_at",'.')-1) ELSE "updated_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "updated_at"
)
WHERE typeof("updated_at") = 'text';

UPDATE "digest_runs" SET "sent_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("sent_at",'.') > 0 THEN substr("sent_at",1,instr("sent_at",'.')-1) ELSE "sent_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "sent_at"
)
WHERE typeof("sent_at") = 'text';

UPDATE "applications_summary_runs" SET "sent_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("sent_at",'.') > 0 THEN substr("sent_at",1,instr("sent_at",'.')-1) ELSE "sent_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "sent_at"
)
WHERE typeof("sent_at") = 'text';

UPDATE "cron_job_runs" SET "started_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("started_at",'.') > 0 THEN substr("started_at",1,instr("started_at",'.')-1) ELSE "started_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "started_at"
)
WHERE typeof("started_at") = 'text';

UPDATE "cron_job_runs" SET "finished_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("finished_at",'.') > 0 THEN substr("finished_at",1,instr("finished_at",'.')-1) ELSE "finished_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "finished_at"
)
WHERE typeof("finished_at") = 'text';

UPDATE "schema_migrations" SET "applied_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("applied_at",'.') > 0 THEN substr("applied_at",1,instr("applied_at",'.')-1) ELSE "applied_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "applied_at"
)
WHERE typeof("applied_at") = 'text';

UPDATE "skill_categories" SET "created_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("created_at",'.') > 0 THEN substr("created_at",1,instr("created_at",'.')-1) ELSE "created_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "created_at"
)
WHERE typeof("created_at") = 'text';

UPDATE "skill_endorsements" SET "created_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("created_at",'.') > 0 THEN substr("created_at",1,instr("created_at",'.')-1) ELSE "created_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "created_at"
)
WHERE typeof("created_at") = 'text';

UPDATE "skills" SET "created_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("created_at",'.') > 0 THEN substr("created_at",1,instr("created_at",'.')-1) ELSE "created_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "created_at"
)
WHERE typeof("created_at") = 'text';

UPDATE "volunteer_skills" SET "created_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("created_at",'.') > 0 THEN substr("created_at",1,instr("created_at",'.')-1) ELSE "created_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "created_at"
)
WHERE typeof("created_at") = 'text';

UPDATE "volunteers" SET "consent_given_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("consent_given_at",'.') > 0 THEN substr("consent_given_at",1,instr("consent_given_at",'.')-1) ELSE "consent_given_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "consent_given_at"
)
WHERE typeof("consent_given_at") = 'text';

UPDATE "volunteers" SET "auth_token_expires_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("auth_token_expires_at",'.') > 0 THEN substr("auth_token_expires_at",1,instr("auth_token_expires_at",'.')-1) ELSE "auth_token_expires_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "auth_token_expires_at"
)
WHERE typeof("auth_token_expires_at") = 'text';

UPDATE "volunteers" SET "created_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("created_at",'.') > 0 THEN substr("created_at",1,instr("created_at",'.')-1) ELSE "created_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "created_at"
)
WHERE typeof("created_at") = 'text';

UPDATE "volunteers" SET "updated_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("updated_at",'.') > 0 THEN substr("updated_at",1,instr("updated_at",'.')-1) ELSE "updated_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "updated_at"
)
WHERE typeof("updated_at") = 'text';

UPDATE "volunteers" SET "deleted_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("deleted_at",'.') > 0 THEN substr("deleted_at",1,instr("deleted_at",'.')-1) ELSE "deleted_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "deleted_at"
)
WHERE typeof("deleted_at") = 'text';

UPDATE "volunteers" SET "location_confirmed_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("location_confirmed_at",'.') > 0 THEN substr("location_confirmed_at",1,instr("location_confirmed_at",'.')-1) ELSE "location_confirmed_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "location_confirmed_at"
)
WHERE typeof("location_confirmed_at") = 'text';

UPDATE "volunteers" SET "rejected_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("rejected_at",'.') > 0 THEN substr("rejected_at",1,instr("rejected_at",'.')-1) ELSE "rejected_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "rejected_at"
)
WHERE typeof("rejected_at") = 'text';

UPDATE "sessions" SET "created_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("created_at",'.') > 0 THEN substr("created_at",1,instr("created_at",'.')-1) ELSE "created_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "created_at"
)
WHERE typeof("created_at") = 'text';

UPDATE "sessions" SET "last_used_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("last_used_at",'.') > 0 THEN substr("last_used_at",1,instr("last_used_at",'.')-1) ELSE "last_used_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "last_used_at"
)
WHERE typeof("last_used_at") = 'text';

UPDATE "sessions" SET "expires_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("expires_at",'.') > 0 THEN substr("expires_at",1,instr("expires_at",'.')-1) ELSE "expires_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "expires_at"
)
WHERE typeof("expires_at") = 'text';

UPDATE "rejected_applications" SET "rejected_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("rejected_at",'.') > 0 THEN substr("rejected_at",1,instr("rejected_at",'.')-1) ELSE "rejected_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "rejected_at"
)
WHERE typeof("rejected_at") = 'text';

UPDATE "rejected_applications" SET "created_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("created_at",'.') > 0 THEN substr("created_at",1,instr("created_at",'.')-1) ELSE "created_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "created_at"
)
WHERE typeof("created_at") = 'text';

UPDATE "anonymised_emails" SET "created_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("created_at",'.') > 0 THEN substr("created_at",1,instr("created_at",'.')-1) ELSE "created_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "created_at"
)
WHERE typeof("created_at") = 'text';

UPDATE "anonymised_emails" SET "reapply_allowed_at" = COALESCE(
  CAST(strftime('%s', replace(replace(CASE WHEN instr("reapply_allowed_at",'.') > 0 THEN substr("reapply_allowed_at",1,instr("reapply_allowed_at",'.')-1) ELSE "reapply_allowed_at" END,'T',' '),'Z','')) AS INTEGER) * 1000,
  "reapply_allowed_at"
)
WHERE typeof("reapply_allowed_at") = 'text';

