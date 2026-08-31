import 'server-only';
import { prisma, type Db } from '@/server/db/prisma';

/**
 * The transactional outbox.
 *
 * Events are written INSIDE the business transaction:
 *
 *   BEGIN
 *     update application status
 *     insert workflow_history
 *     insert audit_log
 *     insert outbox_event ('SHORTFALL_RAISED', payload)
 *   COMMIT
 *          │
 *          └──▶ worker ──▶ dispatcher ──▶ SMS · email · in-app
 *
 * This is what makes the notification promise real. If notification were sent
 * inline, an SMS outage would either roll back the officer's decision or
 * silently drop the message. Here the notification is a durable consequence of
 * a committed fact: it will be delivered, or it will be visibly failed with a
 * retry count an administrator can see.
 */

/** The 22 events from docs/07-subsystems.md M.2. */
export const EVENTS = {
  APPLICATION_CREATED: 'APPLICATION_CREATED',
  DRAWING_UPLOADED: 'DRAWING_UPLOADED',
  SCRUTINY_PASSED: 'SCRUTINY_PASSED',
  SCRUTINY_FAILED: 'SCRUTINY_FAILED',
  DOCUMENTS_PENDING: 'DOCUMENTS_PENDING',
  DOCUMENTS_COMPLETED: 'DOCUMENTS_COMPLETED',
  FEE_GENERATED: 'FEE_GENERATED',
  PAYMENT_SUCCESSFUL: 'PAYMENT_SUCCESSFUL',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  APPLICATION_FORWARDED: 'APPLICATION_FORWARDED',
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  SHORTFALL_RAISED: 'SHORTFALL_RAISED',
  SHORTFALL_RESPONDED: 'SHORTFALL_RESPONDED',
  SHORTFALL_RESOLVED: 'SHORTFALL_RESOLVED',
  SHORTFALL_REJECTED: 'SHORTFALL_REJECTED',
  APPLICATION_APPROVED: 'APPLICATION_APPROVED',
  APPLICATION_REJECTED: 'APPLICATION_REJECTED',
  APPLICATION_RETURNED: 'APPLICATION_RETURNED',
  /** Notification only. Passing an SLA has no legal effect — see docs R.1.1. */
  SLA_DUE_SOON: 'SLA_DUE_SOON',
  SLA_OVERDUE: 'SLA_OVERDUE',
  ORDER_ISSUED: 'ORDER_ISSUED',
  USER_CREATED: 'USER_CREATED',
  PASSWORD_RESET: 'PASSWORD_RESET',
} as const;

export type EventCode = (typeof EVENTS)[keyof typeof EVENTS];

export type EmitInput = {
  eventCode: EventCode | string;
  applicationId?: string | null;
  payload: Record<string, unknown>;
};

/**
 * Takes the transaction client on purpose. Emitting outside the business
 * transaction reintroduces exactly the divergence this pattern exists to
 * prevent.
 */
export async function emit(db: Db, input: EmitInput) {
  return db.outboxEvent.create({
    data: {
      eventCode: input.eventCode,
      applicationId: input.applicationId ?? null,
      payload: input.payload as never,
    },
  });
}

/**
 * Claims a batch of unprocessed events for the dispatcher.
 *
 * `FOR UPDATE SKIP LOCKED` lets several worker processes drain the outbox
 * concurrently without any of them handling the same row.
 */
export async function claimPending(batchSize = 25) {
  return prisma.$queryRaw<
    Array<{ id: string; eventCode: string; applicationId: string | null; payload: unknown; attempts: number }>
  >`
    SELECT id, "eventCode", "applicationId", payload, attempts
    FROM outbox_events
    WHERE processed = false
    ORDER BY "createdAt" ASC
    LIMIT ${batchSize}
    FOR UPDATE SKIP LOCKED
  `;
}

export async function markProcessed(id: string) {
  await prisma.outboxEvent.update({
    where: { id },
    data: { processed: true, processedAt: new Date() },
  });
}

export async function markFailed(id: string, error: string) {
  await prisma.outboxEvent.update({
    where: { id },
    data: { attempts: { increment: 1 }, lastError: error.slice(0, 1000) },
  });
}
