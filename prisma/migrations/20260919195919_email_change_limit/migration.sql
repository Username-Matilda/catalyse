-- AlterTable
ALTER TABLE "volunteers" ADD COLUMN     "email_change_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "email_change_window_start" TIMESTAMP(3);
