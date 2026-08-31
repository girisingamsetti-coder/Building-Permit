-- AlterTable
ALTER TABLE "workflow_actions" ADD COLUMN     "capabilityKey" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "workflow_stages" ADD COLUMN     "isEntry" BOOLEAN NOT NULL DEFAULT false;
