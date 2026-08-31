/**
 * RECONCILIATION.
 *
 *   npm run demo:verify
 *
 * Asks the database the same questions the dashboards ask, by a DIFFERENT
 * route, and complains when the two answers differ.
 *
 * That difference of route is the whole value. `src/server/services/analytics.ts`
 * answers "how much money came in" with one aggregate over settled payments;
 * this script answers it by walking the payments and adding them up. If both
 * used the same query they would agree by construction and prove nothing —
 * they would only be testing that Prisma can run a query twice.
 *
 * It checks two families of thing:
 *
 *   CONSISTENCY  the analytics service and a hand count agree.
 *   INTEGRITY    combinations the system is supposed to make impossible are
 *                in fact absent — an approved file with an open shortfall, a
 *                settled payment with no receipt, an application sitting at
 *                two stages at once.
 *
 * Exit code 1 on any failure, so CI can run it.
 */
import { prisma } from '../src/server/db/prisma';
import { RBAC_MATRIX } from '../src/lib/rbac-matrix';
import { ROLES } from '../src/lib/constants';
import {
  applicationOverview,
  financeSummary,
  shortfallSummary,
  scrutinySummary,
  slaSummary,
  applicationTrend,
  consolidatedView,
} from '../src/server/services/analytics';
import type { AuthUser } from '../src/server/auth/context';

let failures = 0;
let checks = 0;

function check(name: string, ok: boolean, detail = '') {
  checks += 1;
  const mark = ok ? '✓' : '✗';
  console.log(`  ${mark} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

const eq = (name: string, a: number, b: number, aLabel = 'dashboard', bLabel = 'database') =>
  check(name, a === b, a === b ? String(a) : `${aLabel}=${a} but ${bLabel}=${b}`);

/** A System Administrator sees everything, which is what a total must count. */
async function superAdmin(): Promise<AuthUser> {
  const user = await prisma.user.findFirstOrThrow({
    where: { roles: { some: { role: { key: ROLES.SYSTEM_ADMIN } } }, deletedAt: null },
    select: { id: true, name: true, email: true, officeId: true },
  });

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roleKeys: [ROLES.SYSTEM_ADMIN],
    capabilities: RBAC_MATRIX[ROLES.SYSTEM_ADMIN] as unknown as string[],
    zoneIds: [],
    officeId: user.officeId,
    sessionId: 'verify-demo',
  };
}

async function main() {
  console.log('\nDemo environment reconciliation\n');

  const admin = await superAdmin();

  // ── 1. Applications ───────────────────────────────────────────────────
  console.log('Applications');

  const overview = await applicationOverview(admin);
  const rawTotal = await prisma.application.count({ where: { deletedAt: null } });

  eq('total matches the applications table', overview.total, rawTotal);
  check(
    'at least 60 demo applications exist',
    rawTotal >= 60,
    `${rawTotal} rows`
  );

  const statusSum = Object.values(overview.byStatus).reduce((a, b) => a + b, 0);
  eq('status breakdown sums to the total', statusSum, overview.total, 'sum of statuses', 'total');

  const approvedRaw = await prisma.application.count({
    where: { deletedAt: null, status: 'APPROVED' },
  });
  eq('approved count matches APPROVED rows', overview.approved, approvedRaw);

  const rejectedRaw = await prisma.application.count({
    where: { deletedAt: null, status: 'REJECTED' },
  });
  eq('rejected count matches REJECTED rows', overview.rejected, rejectedRaw);

  eq(
    'draft + in progress + closed accounts for every file',
    overview.draft + overview.inProgress + overview.closed,
    overview.total,
    'parts',
    'total'
  );

  // The `total` bucket is defined as "every status", so it must equal the
  // total by construction — and every other bucket must be a subset of it.
  eq('the total bucket equals the total', overview.byBucket.total ?? -1, overview.total);

  const stageSum = overview.byStage.reduce((sum, s) => sum + s.count, 0);
  const withStage = await prisma.application.count({
    where: { deletedAt: null, currentStageCode: { not: null } },
  });
  eq('stage distribution matches applications carrying a stage', stageSum, withStage);

  const typeSum = overview.byType.reduce((sum, t) => sum + t.count, 0);
  eq('type distribution sums to the total', typeSum, overview.total);

  // ── 2. Workflow integrity ─────────────────────────────────────────────
  console.log('\nWorkflow');

  // `applications.currentStageCode` is a denormalised cache. If it has drifted
  // from the instance, the register and the workflow tab disagree about where
  // a file is — and the register is what an officer looks at first.
  const drifted = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n
      FROM applications a
      JOIN workflow_instances i ON i."applicationId" = a.id
      LEFT JOIN workflow_stages s ON s.id = i."currentStageId"
     WHERE a."deletedAt" IS NULL
       AND COALESCE(a."currentStageCode", '') <> COALESCE(s.code, '')
  `;
  check(
    'no application disagrees with its workflow instance about its stage',
    Number(drifted[0]?.n ?? 0) === 0,
    `${Number(drifted[0]?.n ?? 0)} drifted`
  );

  const multiInstance = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n FROM (
      SELECT "applicationId" FROM workflow_instances
       GROUP BY "applicationId" HAVING COUNT(*) > 1
    ) d
  `;
  check(
    'no application is in two workflow runs at once',
    Number(multiInstance[0]?.n ?? 0) === 0
  );

  const multiOpenTask = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n FROM (
      SELECT "instanceId" FROM workflow_tasks
       WHERE status IN ('PENDING', 'IN_PROGRESS')
       GROUP BY "instanceId" HAVING COUNT(*) > 1
    ) d
  `;
  check(
    'no application has two open tasks at once',
    Number(multiOpenTask[0]?.n ?? 0) === 0,
    `${Number(multiOpenTask[0]?.n ?? 0)} with more than one`
  );

  const closedWithOpenTask = await prisma.workflowTask.count({
    where: {
      status: { in: ['PENDING', 'IN_PROGRESS'] },
      instance: { status: { in: ['COMPLETED', 'CANCELLED'] } },
    },
  });
  check('no closed application still has an open task', closedWithOpenTask === 0);

  // ── 3. The approval guard ─────────────────────────────────────────────
  console.log('\nApproval integrity');

  const approvedWithOpenShortfall = await prisma.application.count({
    where: {
      deletedAt: null,
      status: 'APPROVED',
      shortfalls: { some: { status: { notIn: ['RESOLVED', 'CANCELLED'] } } },
    },
  });
  check(
    'no approved application carries an open shortfall',
    approvedWithOpenShortfall === 0,
    approvedWithOpenShortfall ? `${approvedWithOpenShortfall} found` : 'the guard held'
  );

  const approvedUnpaid = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(DISTINCT a.id)::bigint AS n
      FROM applications a
      JOIN application_fees f ON f."applicationId" = a.id
     WHERE a."deletedAt" IS NULL
       AND a.status = 'APPROVED'
       AND f.status NOT IN ('PAID', 'CANCELLED', 'WAIVED')
  `;
  check(
    'no approved application has an unpaid demand',
    Number(approvedUnpaid[0]?.n ?? 0) === 0,
    `${Number(approvedUnpaid[0]?.n ?? 0)} found`
  );

  const approvedWithoutOrder = await prisma.application.count({
    where: { deletedAt: null, status: 'APPROVED', approvalOrder: null },
  });
  check('every approved application has an approval order', approvedWithoutOrder === 0);

  const approvedWithoutDate = await prisma.application.count({
    where: { deletedAt: null, status: 'APPROVED', approvedAt: null },
  });
  check('every approved application carries an approval date', approvedWithoutDate === 0);

  // ── 4. Money ──────────────────────────────────────────────────────────
  console.log('\nFees and payments');

  const finance = await financeSummary(admin);

  const settled = await prisma.payment.findMany({
    where: { status: 'SUCCESS', application: { deletedAt: null } },
    select: { amount: true, applicationFeeId: true, applicationId: true, receipt: { select: { id: true } } },
  });

  const handCounted = settled.reduce((sum, p) => sum + Number(p.amount), 0);
  check(
    'collected matches the sum of settled payments',
    Math.abs(finance.collected - handCounted) < 0.005,
    `analytics=₹${finance.collected.toFixed(2)} hand-count=₹${handCounted.toFixed(2)} over ${settled.length} payments`
  );

  const noReceipt = settled.filter((p) => !p.receipt).length;
  check('every settled payment has a receipt', noReceipt === 0, `${noReceipt} without one`);

  const orphanPayments = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n
      FROM payments p
      JOIN application_fees f ON f.id = p."applicationFeeId"
     WHERE p."applicationId" <> f."applicationId"
  `;
  check(
    'no payment is attached to a demand from another application',
    Number(orphanPayments[0]?.n ?? 0) === 0
  );

  const demandTotal = await prisma.applicationFee.aggregate({
    where: { application: { deletedAt: null }, status: { not: 'CANCELLED' } },
    _sum: { totalAmount: true },
  });
  const generatedHand = Number(demandTotal._sum.totalAmount ?? 0);
  check(
    'fees generated matches the demand ledger',
    Math.abs(finance.generated - generatedHand) < 0.005,
    `₹${finance.generated.toFixed(2)}`
  );

  check(
    'collected never exceeds generated',
    finance.collected <= finance.generated + 0.005,
    `₹${finance.collected.toFixed(2)} of ₹${finance.generated.toFixed(2)}`
  );

  const overpaid = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n FROM application_fees
     WHERE "paidAmount" > "totalAmount"
  `;
  check('no demand is paid beyond its total', Number(overpaid[0]?.n ?? 0) === 0);

  const paidNotSettled = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n
      FROM application_fees f
     WHERE f.status = 'PAID'
       AND NOT EXISTS (
         SELECT 1 FROM payments p
          WHERE p."applicationFeeId" = f.id AND p.status = 'SUCCESS'
       )
  `;
  check(
    'no demand is marked paid without a settled payment behind it',
    Number(paidNotSettled[0]?.n ?? 0) === 0
  );

  const multiOpenPayment = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n FROM (
      SELECT "applicationFeeId" FROM payments
       WHERE status IN ('INITIATED', 'PENDING', 'PROCESSING')
       GROUP BY "applicationFeeId" HAVING COUNT(*) > 1
    ) d
  `;
  check(
    'no demand has two open payment attempts',
    Number(multiOpenPayment[0]?.n ?? 0) === 0
  );

  // ── 5. Shortfalls ─────────────────────────────────────────────────────
  console.log('\nShortfalls');

  const shortfalls = await shortfallSummary(admin);
  const openRaw = await prisma.shortfall.count({
    where: { application: { deletedAt: null }, status: { notIn: ['RESOLVED', 'CANCELLED'] } },
  });
  eq('open shortfalls matches unresolved rows', shortfalls.open, openRaw);

  const totalRaw = await prisma.shortfall.count({ where: { application: { deletedAt: null } } });
  eq('shortfall total matches the table', shortfalls.total, totalRaw);

  // `applications.openShortfalls` is the engine's cache. The approval guard
  // re-counts live and does not trust it — but if it has drifted, every list
  // that shows a shortfall badge is lying.
  const counterDrift = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n FROM (
      SELECT a.id
        FROM applications a
        LEFT JOIN shortfalls s
          ON s."applicationId" = a.id AND s.status NOT IN ('RESOLVED', 'CANCELLED')
       WHERE a."deletedAt" IS NULL
       GROUP BY a.id, a."openShortfalls"
      HAVING COUNT(s.id) <> a."openShortfalls"
    ) d
  `;
  check(
    'the openShortfalls counter agrees with the shortfall rows',
    Number(counterDrift[0]?.n ?? 0) === 0,
    `${Number(counterDrift[0]?.n ?? 0)} applications drifted`
  );

  const feeShortfallNoDemand = await prisma.shortfall.count({
    where: { kind: 'FEE', feeDemands: { none: {} } },
  });
  check(
    'every fee shortfall has a demand behind it',
    feeShortfallNoDemand === 0,
    feeShortfallNoDemand ? `${feeShortfallNoDemand} without` : 'money asked for is money payable'
  );

  // ── 6. Scrutiny ───────────────────────────────────────────────────────
  console.log('\nScrutiny');

  const scrutiny = await scrutinySummary(admin);
  const resultsRaw = await prisma.scrutinyResult.count();
  eq('pass + fail matches the result rows', scrutiny.passed + scrutiny.failed, resultsRaw);

  const failedNoIssues = await prisma.scrutinyResult.count({
    where: { outcome: 'FAIL', issues: { none: {} } },
  });
  check(
    'every failed scrutiny result lists its findings',
    failedNoIssues === 0,
    failedNoIssues ? `${failedNoIssues} with none` : 'a failure an applicant can act on'
  );

  const failedWithoutResult = await prisma.application.count({
    where: { deletedAt: null, status: 'SCRUTINY_FAILED', drawings: { none: {} } },
  });
  check('no application is SCRUTINY_FAILED without a drawing', failedWithoutResult === 0);

  // ── 7. Service standards ──────────────────────────────────────────────
  console.log('\nService standards');

  const sla = await slaSummary(admin);
  const overdueRaw = await prisma.slaInstance.count({
    where: {
      completedAt: null,
      status: 'OVERDUE',
      task: { instance: { application: { deletedAt: null } } },
    },
  });
  eq('overdue clocks match the SLA table', sla.overdue, overdueRaw);

  const overdueButFuture = await prisma.slaInstance.count({
    where: { status: 'OVERDUE', completedAt: null, dueAt: { gt: new Date() } },
  });
  check(
    'nothing is marked overdue whose due date has not passed',
    overdueButFuture === 0,
    `${overdueButFuture} mislabelled`
  );

  // ── 8. Trend ──────────────────────────────────────────────────────────
  console.log('\nTrend');

  const trend = await applicationTrend(admin, 9);
  const createdInWindow = trend.reduce((sum, p) => sum + p.created, 0);

  const from = new Date();
  from.setDate(1);
  from.setHours(0, 0, 0, 0);
  from.setMonth(from.getMonth() - 8);

  const createdRaw = await prisma.application.count({
    where: { deletedAt: null, createdAt: { gte: from } },
  });
  eq('the trend chart counts the same applications as the table', createdInWindow, createdRaw);

  const approvedInTrend = trend.reduce((sum, p) => sum + p.approved, 0);
  check(
    'approvals on the chart do not exceed approvals in the table',
    approvedInTrend <= approvedRaw,
    `${approvedInTrend} charted of ${approvedRaw} total`
  );

  // ── 9. The administrator's consolidated view ──────────────────────────
  console.log('\nConsolidation');

  const view = await consolidatedView(admin);

  const deskFiles = view.desks.reduce((sum, d) => sum + d.applications, 0);
  const noStage = await prisma.application.count({
    where: { deletedAt: null, currentStageCode: null },
  });
  eq(
    'desk totals plus files with no stage account for every application',
    deskFiles + noStage,
    overview.total,
    'desks + unstaged',
    'total'
  );

  // The partition the pipeline strip prints. Every file is with the applicant,
  // at a desk, or closed — exactly once. If these stop adding up, the headline
  // panel on the administrator's dashboard is arithmetic nobody can follow.
  const inReview = view.desks
    .filter((d) => !d.isTerminal && d.roleKeys.some((r) => r !== 'LTP'))
    .reduce((sum, d) => sum + d.applications, 0);
  const closedTotal = overview.approved + overview.rejected;

  eq(
    'with-applicant + at-a-desk + closed partitions the register',
    view.applicantSide.totalWithApplicant + inReview + closedTotal,
    overview.total,
    'partition',
    'total'
  );

  const deskTasks = view.desks.reduce((sum, d) => sum + d.openTasks, 0);
  const rawOpenTasks = await prisma.workflowTask.count({
    where: {
      status: { in: ['PENDING', 'IN_PROGRESS'] },
      instance: { application: { deletedAt: null } },
    },
  });
  eq('desk task counts match the open task queue', deskTasks, rawOpenTasks);

  const deskShortfalls = view.desks.reduce((sum, d) => sum + d.openShortfalls, 0);
  eq(
    'shortfalls attributed to desks match the open shortfalls',
    deskShortfalls,
    shortfalls.open,
    'by desk',
    'open'
  );

  for (const desk of view.desks) {
    check(
      `${desk.label}: claimed + unclaimed equals its open tasks`,
      desk.claimed + desk.unclaimed === desk.openTasks,
      `${desk.claimed} + ${desk.unclaimed} = ${desk.openTasks}`
    );
  }

  const rawUsers = await prisma.user.count({ where: { deletedAt: null } });
  eq('account summary counts every live user', view.accounts.totals.users, rawUsers);

  const filerTotal = view.filers.reduce((sum, f) => sum + f.total, 0);
  check(
    'the filer breakdown never claims more files than exist',
    filerTotal <= overview.total,
    `${filerTotal} across ${view.filers.length} filers, of ${overview.total}`
  );

  // ── 10. Dates ─────────────────────────────────────────────────────────
  console.log('\nChronology');

  const backwards = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n FROM applications
     WHERE "deletedAt" IS NULL
       AND (
         ("submittedAt" IS NOT NULL AND "submittedAt" < "createdAt")
         OR ("approvedAt" IS NOT NULL AND "approvedAt" < "submittedAt")
         OR ("rejectedAt" IS NOT NULL AND "rejectedAt" < "submittedAt")
       )
  `;
  check(
    'no application was decided before it was filed',
    Number(backwards[0]?.n ?? 0) === 0,
    `${Number(backwards[0]?.n ?? 0)} out of order`
  );

  const eventsBeforeApplication = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n
      FROM application_events e
      JOIN applications a ON a.id = e."applicationId"
     WHERE e."occurredAt" < a."createdAt" - INTERVAL '1 second'
  `;
  check(
    'no timeline entry predates its application',
    Number(eventsBeforeApplication[0]?.n ?? 0) === 0,
    `${Number(eventsBeforeApplication[0]?.n ?? 0)} early`
  );

  const futureDated = await prisma.application.count({
    where: { deletedAt: null, createdAt: { gt: new Date(Date.now() + 60_000) } },
  });
  check('nothing is dated in the future', futureDated === 0);

  // ── Result ────────────────────────────────────────────────────────────
  console.log(
    `\n${failures === 0 ? 'All' : `${checks - failures} of`} ${checks} checks passed${failures ? `, ${failures} FAILED` : ''}.\n`
  );

  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error('\nReconciliation could not run:\n', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
