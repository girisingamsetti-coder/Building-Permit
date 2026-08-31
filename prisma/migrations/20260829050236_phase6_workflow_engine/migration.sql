-- CreateEnum
CREATE TYPE "AssignmentStrategy" AS ENUM ('ROLE_QUEUE', 'DIRECT', 'LEAST_LOADED', 'ROUND_ROBIN');

-- AlterTable
ALTER TABLE "workflow_tasks" ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "workflow_assignments" (
    "id" UUID NOT NULL,
    "workflowId" UUID NOT NULL,
    "stageId" UUID NOT NULL,
    "roleKey" TEXT NOT NULL,
    "zoneId" UUID,
    "userId" UUID,
    "strategy" "AssignmentStrategy" NOT NULL DEFAULT 'ROLE_QUEUE',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workflow_assignments_workflowId_idx" ON "workflow_assignments"("workflowId");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_assignments_stageId_roleKey_zoneId_key" ON "workflow_assignments"("stageId", "roleKey", "zoneId");

-- CreateIndex
-- Declared on the model since phase 5 but never created: the settlement path
-- looks a payment up by the gateway's transaction id when reconciling.
CREATE INDEX IF NOT EXISTS "payments_gatewayTxnId_idx" ON "payments"("gatewayTxnId");

-- CreateIndex
CREATE INDEX "workflow_tasks_status_priority_receivedAt_idx" ON "workflow_tasks"("status", "priority", "receivedAt");

-- AddForeignKey
ALTER TABLE "workflow_assignments" ADD CONSTRAINT "workflow_assignments_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_assignments" ADD CONSTRAINT "workflow_assignments_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "workflow_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_assignments" ADD CONSTRAINT "workflow_assignments_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_assignments" ADD CONSTRAINT "workflow_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 6 — constraints Prisma cannot express
-- ═══════════════════════════════════════════════════════════════════════════

-- One DIRECT assignment rule may name a user; a ROLE_QUEUE rule may not.
-- Without this a rule can say "address this to the shared inbox" and name a
-- person at the same time, and the engine would have to pick one and be wrong
-- half the time. The database refuses the contradiction instead.
ALTER TABLE "workflow_assignments"
  ADD CONSTRAINT "assignment_user_matches_strategy"
  CHECK (("strategy" = 'DIRECT') = ("userId" IS NOT NULL));

-- The uniqueness above uses a nullable column, and NULL <> NULL in a unique
-- index — so two "applies to every zone" rules for the same (stage, role) slip
-- past it. This is the rule that makes "the most specific active row wins"
-- deterministic: without it, two catch-all rules tie and the winner depends on
-- physical row order.
CREATE UNIQUE INDEX IF NOT EXISTS "assignment_one_default_per_role"
  ON "workflow_assignments" ("stageId", "roleKey")
  WHERE "zoneId" IS NULL;

-- The officer queue's ordering predicate: open tasks for a role, most urgent
-- and longest-waiting first. The existing open_tasks_by_role index covers the
-- filter; this one covers the sort the inbox actually applies.
CREATE INDEX IF NOT EXISTS "open_tasks_by_priority"
  ON "workflow_tasks" ("assignedRoleKey", "priority" DESC, "receivedAt")
  WHERE status IN ('PENDING', 'IN_PROGRESS');

-- A transition may only be looked up by (stage, action, status) — the engine's
-- one query. `fromStatus` is nullable and NULL <> NULL, so the model's unique
-- constraint does not stop two "any status" rows for the same (stage, action)
-- from existing. Two matching rows means the engine's routing decision depends
-- on row order, which is precisely what the transition table exists to prevent.
CREATE UNIQUE INDEX IF NOT EXISTS "transition_one_any_status"
  ON "workflow_transitions" ("workflowId", "fromStageId", "actionId")
  WHERE "fromStatus" IS NULL;

-- Workflow history is the file's movement record and is quoted back to
-- applicants. Same treatment as audit_logs: append-only in the database, not
-- by convention. (The trigger itself was created in the constraints migration;
-- this comment records that it covers the rows Phase 6 starts writing.)
