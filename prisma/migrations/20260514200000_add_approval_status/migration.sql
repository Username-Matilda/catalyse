-- AlterTable: add approval_status and application_message to volunteers
-- DEFAULT 'APPROVED' sets all existing rows to approved; new rows use Prisma's @default("PENDING")
ALTER TABLE "volunteers" ADD COLUMN "approval_status" TEXT NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "volunteers" ADD COLUMN "application_message" TEXT;
