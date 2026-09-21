-- CreateEnum
CREATE TYPE "InterestOrigin" AS ENUM ('applied', 'added');

-- AlterEnum
ALTER TYPE "InterestStatus" ADD VALUE 'removed';

-- AlterTable
-- Existing rows cannot tell an applicant from someone the owner added, so they all take the
-- default 'applied'. Declined rows that were really removals of an accepted helper stay
-- 'declined' for the same reason.
ALTER TABLE "work_item_interests" ADD COLUMN     "origin" "InterestOrigin" NOT NULL DEFAULT 'applied';
