-- Backfill `email_confirmed = TRUE` for volunteers that existed before the
-- email-confirmation feature shipped.
--
-- Migration 20260515081706_add_email_confirmation added the column with
-- `NOT NULL DEFAULT false` and its INSERT INTO new_volunteers (...) SELECT
-- ... FROM volunteers did not include the column, so every pre-existing
-- volunteer ended up with `email_confirmed = 0`. This is the analogue of
-- the `approval_status TEXT NOT NULL DEFAULT 'APPROVED'` backfill in the
-- approval-flow migration that landed in the same week — that one was
-- correctly applied to existing rows, this one was not.
--
-- The effect of the missing backfill: pre-existing non-admin users get a
-- 403 from procedures gated on `emailConfirmed` (currently
-- `projects.list` — see server/routers/projects.ts). Admins are exempt.
--
-- Cutoff is the exact timestamp encoded in the original migration's
-- directory name (2026-05-15 08:17:06). Anyone whose `created_at` is
-- before that could not have used the verification flow, so it's safe to
-- mark them confirmed. Users created after the cutoff went through the
-- new signup flow and should remain in whatever state they reached.
-- `datetime()` normalises both `YYYY-MM-DD HH:MM:SS` (CURRENT_TIMESTAMP)
-- and ISO-8601 (Prisma JS Date) representations on either side.
UPDATE "volunteers"
SET "email_confirmed" = 1
WHERE "email_confirmed" = 0
  AND datetime("created_at") < datetime('2026-05-15 08:17:06');
