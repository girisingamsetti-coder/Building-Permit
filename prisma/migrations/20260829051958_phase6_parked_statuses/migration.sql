-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ApplicationStatus" ADD VALUE 'COMMISSIONER_SHORTFALL';
ALTER TYPE "ApplicationStatus" ADD VALUE 'RETURNED_TO_APPLICANT';
ALTER TYPE "ApplicationStatus" ADD VALUE 'SHORTFALL_RESPONDED';
