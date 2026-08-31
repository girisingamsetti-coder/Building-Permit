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
const APPEND_ONLY_TRIGGERS: Array<[table: string, trigger: string]> = [
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

const TARGETS: Target[] = [
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

export async function withTriggersDisabled<T>(prisma: PrismaClient, fn: () => Promise<T>): Promise<T> {
  if ((process.env.NODE_ENV ?? 'development') === 'production') {
    throw new Error('The demo seed refuses to alter append-only tables in production.');
  }

  for (const [table, trigger] of APPEND_ONLY_TRIGGERS) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" DISABLE TRIGGER "${trigger}"`);
  }

  try {
    return await fn();
  } finally {
    // Restoring these is not optional and not conditional. A seed that fell
    // over half way must not leave the database accepting edits to its own
    // history.
    for (const [table, trigger] of APPEND_ONLY_TRIGGERS) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE TRIGGER "${trigger}"`);
    }
  }
}

/**
 * Stretches one application's timeline onto [startAt, endAt].
 *
 * `t0` is the instant the application row was created and `t1` the instant the
 * journey finished. Timestamps BETWEEN them are mapped proportionally.
 *
 * ── Why the two clamps matter ────────────────────────────────────────────
 *
 * Not every timestamp on an application lies inside its journey. A shortfall's
 * `dueDate` is a fortnight in the future, an approval order's `validUntil` is
 * years out, and a payment's `expiresAt` is minutes ahead. The journey itself
 * takes about a second of wall clock, so the proportional factor is on the
 * order of a million — and multiplying a date three years away by a million
 * produces a year in the hundreds of thousands, which Postgres rejects
 * outright with "timestamp out of range".
 *
 * So the transform is piecewise. Inside the window it stretches; outside it
 * SHIFTS by the constant offset of the nearer endpoint. A due date fourteen
 * days after the shortfall was raised is therefore still fourteen days after
 * it in the new timeline, which is what it means, rather than fourteen days
 * scaled by an accident of how fast the seed ran.
 */
export async function backdateApplication(
  prisma: PrismaClient,
  applicationId: string,
  t0: Date,
  t1: Date,
  startAt: Date,
  endAt: Date
): Promise<void> {
  const t0s = t0.getTime() / 1000;
  const t1s = Math.max(t0s + 1, t1.getTime() / 1000);
  const startS = startAt.getTime() / 1000;
  const endS = Math.max(startS + 1, endAt.getTime() / 1000);

  const k = (endS - startS) / (t1s - t0s);
  const shiftBefore = startS - t0s;
  const shiftAfter = endS - t1s;

  /** The piecewise map, as a SQL expression over one column. */
  const mapped = (col: string) => `
    CASE
      WHEN "${col}" IS NULL THEN NULL
      WHEN EXTRACT(EPOCH FROM "${col}") <= ${t0s}
        THEN "${col}" + make_interval(secs => ${shiftBefore})
      WHEN EXTRACT(EPOCH FROM "${col}") >= ${t1s}
        THEN "${col}" + make_interval(secs => ${shiftAfter})
      ELSE to_timestamp((EXTRACT(EPOCH FROM "${col}") - ${t0s}) * ${k} + ${startS}) AT TIME ZONE 'UTC'
    END`;

  for (const target of TARGETS) {
    const sets = target.columns.map((col) => `"${col}" = ${mapped(col)}`).join(', ');
    const where = target.where.replace('$ID', `'${applicationId}'::uuid`);
    await prisma.$executeRawUnsafe(`UPDATE "${target.table}" SET ${sets} WHERE ${where}`);
  }
}

/**
 * File objects are shared plumbing rather than part of one application's
 * story, so they are shifted in one pass at the end — each to the moment its
 * earliest referencing version was uploaded.
 */
export async function backdateFileObjects(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    UPDATE file_objects f
    SET "createdAt" = v.uploaded
    FROM (
      SELECT "fileObjectId" AS id, MIN("uploadedAt") AS uploaded
        FROM drawing_versions GROUP BY "fileObjectId"
      UNION ALL
      SELECT "fileObjectId" AS id, MIN("uploadedAt") AS uploaded
        FROM document_versions GROUP BY "fileObjectId"
    ) v
    WHERE f.id = v.id AND v.uploaded < f."createdAt"
  `);
}
