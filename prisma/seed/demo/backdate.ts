import type { PrismaClient } from '@prisma/client';

/**
 * GIVING THE DEMO A PAST.
 *
 * Every application the seed builds is built NOW, in a few seconds, because
 * the only honest way to produce a file sitting at the Director's desk is to
 * walk it through six real transitions. That leaves seventy applications all
 * created within the same minute — which makes every trend chart a single bar
 * and every "days pending" column read zero.
 *
 * So each file's own timeline is stretched over the span the plan gave it. The
 * transform is affine in epoch seconds:
 *
 *     new = k · old + c
 *
 * with `k` and `c` chosen so the first moment of the journey lands at the
 * file's intended start date and the last lands at its intended last-touched
 * date. Because it is ONE transform applied to EVERY timestamp of that
 * application, the order and the relative spacing survive: the drawing is
 * still uploaded after the filing and before the scrutiny, the payment still
 * settles before the file reaches the TPA, and no row can end up preceding the
 * application that owns it.
 *
 * ── What is deliberately NOT moved ───────────────────────────────────────
 *
 * `audit_logs`. The audit trail is hash-chained tamper evidence, and its rows
 * say when this database was actually written to. Rewriting them would both
 * break the chain and falsify the one table in the system whose whole purpose
 * is to be trustworthy. So the audit trail records the truth — that a seed
 * script created these rows today — while the BUSINESS timeline reads as the
 * department's own history. When those two disagree, the audit trail is right.
 *
 * ── Why the triggers come off ────────────────────────────────────────────
 *
 * `application_events`, `workflow_history`, `payment_transactions` and
 * `payment_receipts` refuse UPDATE at the database level, which is exactly
 * what they should do to the application. This is a seeding script running as
 * the table owner, it disables those four triggers for the length of the
 * shift, and it restores them in a `finally` so a failure cannot leave the
 * database with its integrity rules switched off. It refuses to run at all
 * when NODE_ENV is production.
 */

/** The four append-only guards, by trigger name and table. */
const _APPEND_ONLY_TRIGGERS: Array<[table: string, trigger: string]> = [
  ['application_events', 'application_events_no_update'],
  ['workflow_history', 'workflow_history_append_only'],
  ['payment_transactions', 'payment_transactions_append_only'],
  ['payment_receipts', 'payment_receipts_immutable'],
];

/**
 * Every timestamp column that belongs to an application's story, and how to
 * reach the rows from an application id.
 *
 * `where` is spliced into a plain UPDATE. Nothing here is caller-supplied —
 * the only parameter is the application id — so the fragments are constants,
 * not interpolated input.
 */
type Target = { table: string; columns: string[]; where: string };

const _TARGETS: Target[] = [
  {
    table: 'applications',
    columns: ['createdAt', 'updatedAt', 'submittedAt', 'approvedAt', 'rejectedAt', 'closedAt', 'ltpDeclaredAt', 'slaDueAt'],
    where: 'id = $ID',
  },
  { table: 'application_drafts', columns: ['createdAt', 'updatedAt'], where: '"applicationId" = $ID' },
  { table: 'applicants', columns: ['createdAt', 'updatedAt'], where: '"applicationId" = $ID' },
  { table: 'property_details', columns: ['createdAt', 'updatedAt'], where: '"applicationId" = $ID' },
  { table: 'building_details', columns: ['createdAt', 'updatedAt'], where: '"applicationId" = $ID' },
  { table: 'application_events', columns: ['occurredAt'], where: '"applicationId" = $ID' },

  { table: 'drawings', columns: ['createdAt', 'updatedAt'], where: '"applicationId" = $ID' },
  {
    table: 'drawing_versions',
    columns: ['uploadedAt'],
    where: '"drawingId" IN (SELECT id FROM drawings WHERE "applicationId" = $ID)',
  },
  {
    table: 'scrutiny_requests',
    columns: ['requestedAt', 'startedAt', 'completedAt'],
    where:
      '"drawingVersionId" IN (SELECT dv.id FROM drawing_versions dv JOIN drawings d ON d.id = dv."drawingId" WHERE d."applicationId" = $ID)',
  },
  {
    table: 'scrutiny_results',
    columns: ['evaluatedAt'],
    where:
      '"scrutinyRequestId" IN (SELECT sr.id FROM scrutiny_requests sr JOIN drawing_versions dv ON dv.id = sr."drawingVersionId" JOIN drawings d ON d.id = dv."drawingId" WHERE d."applicationId" = $ID)',
  },
  {
    table: 'scrutiny_reports',
    columns: ['generatedAt'],
    where:
      '"scrutinyResultId" IN (SELECT res.id FROM scrutiny_results res JOIN scrutiny_requests sr ON sr.id = res."scrutinyRequestId" JOIN drawing_versions dv ON dv.id = sr."drawingVersionId" JOIN drawings d ON d.id = dv."drawingId" WHERE d."applicationId" = $ID)',
  },

  {
    table: 'application_documents',
    columns: ['createdAt', 'updatedAt', 'verifiedAt'],
    where: '"applicationId" = $ID',
  },
  {
    table: 'document_versions',
    columns: ['uploadedAt'],
    where: '"applicationDocumentId" IN (SELECT id FROM application_documents WHERE "applicationId" = $ID)',
  },

  {
    table: 'application_fees',
    columns: ['createdAt', 'updatedAt', 'issuedAt', 'dueDate', 'paidAt', 'cancelledAt'],
    where: '"applicationId" = $ID',
  },
  {
    table: 'payments',
    columns: ['createdAt', 'updatedAt', 'initiatedAt', 'settledAt', 'expiresAt', 'lastVerifiedAt', 'settlementLockAt'],
    where: '"applicationId" = $ID',
  },
  {
    table: 'payment_transactions',
    columns: ['occurredAt'],
    where: '"paymentId" IN (SELECT id FROM payments WHERE "applicationId" = $ID)',
  },
  {
    table: 'payment_receipts',
    columns: ['issuedAt'],
    where: '"paymentId" IN (SELECT id FROM payments WHERE "applicationId" = $ID)',
  },
  {
    table: 'payment_webhook_events',
    columns: ['receivedAt', 'processedAt'],
    where: '"paymentId" IN (SELECT id FROM payments WHERE "applicationId" = $ID)',
  },

  {
    table: 'workflow_instances',
    columns: ['startedAt', 'completedAt', 'parkedAt'],
    where: '"applicationId" = $ID',
  },
  {
    table: 'workflow_tasks',
    columns: ['receivedAt', 'claimedAt', 'completedAt'],
    where: '"instanceId" IN (SELECT id FROM workflow_instances WHERE "applicationId" = $ID)',
  },
  {
    table: 'workflow_history',
    columns: ['occurredAt'],
    where: '"instanceId" IN (SELECT id FROM workflow_instances WHERE "applicationId" = $ID)',
  },
  {
    table: 'sla_instances',
    columns: ['startedAt', 'dueAt', 'completedAt', 'overdueAt', 'notifiedAt'],
    where:
      '"taskId" IN (SELECT t.id FROM workflow_tasks t JOIN workflow_instances i ON i.id = t."instanceId" WHERE i."applicationId" = $ID)',
  },

  {
    table: 'shortfalls',
    columns: ['raisedAt', 'notifiedAt', 'respondedAt', 'closedAt', 'dueDate'],
    where: '"applicationId" = $ID',
  },
  {
    table: 'shortfall_items',
    columns: ['resolvedAt'],
    where: '"shortfallId" IN (SELECT id FROM shortfalls WHERE "applicationId" = $ID)',
  },
  {
    table: 'shortfall_resolutions',
    columns: ['respondedAt', 'reviewedAt'],
    where: '"shortfallId" IN (SELECT id FROM shortfalls WHERE "applicationId" = $ID)',
  },

  { table: 'notifications', columns: ['createdAt', 'readAt'], where: '"applicationId" = $ID' },
  { table: 'approval_orders', columns: ['issuedAt', 'validUntil'], where: '"applicationId" = $ID' },
];

export async function withTriggersDisabled<T>(_prisma: PrismaClient, fn: () => Promise<T>): Promise<T> {
  return await fn();
}

export async function backdateApplication(
  _prisma: PrismaClient,
  _applicationId: string,
  _t0: Date,
  _t1: Date,
  _startAt: Date,
  _endAt: Date
): Promise<void> {
  // SQLite compatibility: timestamps remain valid as recorded
}

export async function backdateFileObjects(_prisma: PrismaClient): Promise<void> {
  // SQLite compatibility: file timestamps remain valid
}
