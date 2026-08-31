/**
 * Phase 0 smoke check.
 *
 * Exercises the foundations against a real database, in the order a request
 * would: audit → chain verify → outbox → job queue → append-only enforcement.
 *
 *   npx tsx --conditions=react-server --env-file-if-exists=.env scripts/smoke.ts
 *
 * Writes and then removes its own rows, except the audit rows — those are
 * append-only by design, which is itself part of what this checks.
 */
import { prisma } from '../src/server/db/prisma';
import { audit, verifyAuditChain } from '../src/server/services/audit';
import { emit, EVENTS } from '../src/server/events/outbox';
import { enqueue, claimNext, markSucceeded, JOB_TYPES } from '../src/server/jobs/queue';

let failures = 0;

function check(name: string, ok: boolean, detail = '') {
  const mark = ok ? '✓' : '✗';
  console.log(`  ${mark} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

async function main() {
  console.log('\nPhase 0 smoke check\n');

  // ── 1. Transaction-aware audit + outbox ────────────────────────────────
  console.log('Audit and outbox, inside one transaction');

  const before = await prisma.auditLog.count();

  /**
   * `audit_logs.actorId` is `@db.Uuid`, so this must parse as one.
   *
   * It read `'smoke_user'` when the schema used `cuid()` keys; the move to
   * `uuid(7)` left it behind and the script failed at the first write with
   * P2023. An all-zeroes-but-one UUID keeps smoke rows obvious in the trail
   * without pretending to be a real account.
   */
  const SMOKE_ACTOR_ID = '00000000-0000-0000-0000-00000000500c';

  await prisma.$transaction(async (tx) => {
    await audit(tx, {
      actor: { id: SMOKE_ACTOR_ID, name: 'Smoke Test', roleKeys: ['SYSTEM_ADMIN'] },
      action: 'SMOKE_CHECK',
      entityType: 'Smoke',
      entityId: 'smoke_1',
      after: { ran: true },
      remarks: 'Phase 0 smoke check',
      correlationId: 'smoke-corr',
    });

    await emit(tx, {
      eventCode: EVENTS.APPLICATION_CREATED,
      payload: { smoke: true },
    });
  });

  check('audit row written', (await prisma.auditLog.count()) === before + 1);
  check('outbox event written', (await prisma.outboxEvent.count({ where: { processed: false } })) >= 1);

  // A failed transaction must leave neither behind.
  const auditBeforeRollback = await prisma.auditLog.count();
  await prisma
    .$transaction(async (tx) => {
      await audit(tx, {
        action: 'SMOKE_ROLLBACK',
        entityType: 'Smoke',
        entityId: 'smoke_rollback',
      });
      throw new Error('deliberate rollback');
    })
    .catch(() => {});

  check(
    'audit rolls back with its transaction',
    (await prisma.auditLog.count()) === auditBeforeRollback,
    'an action that succeeded but was not recorded is not reachable'
  );

  // ── 2. Hash chain ──────────────────────────────────────────────────────
  console.log('\nAudit hash chain');

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < 5; i += 1) {
      await audit(tx, {
        action: 'SMOKE_CHAIN',
        entityType: 'Smoke',
        entityId: `chain_${i}`,
        after: { i },
      });
    }
  });

  const chain = await verifyAuditChain();
  check(
    'chain verifies',
    chain.ok,
    chain.ok
      ? `${chain.checked} rows since seq ${chain.from}`
      : `broken at ${chain.brokenAtId} (seq ${chain.brokenAtSeq}), ${chain.checked} rows verified since seq ${chain.from}`
  );

  // ── 3. Append-only enforcement ─────────────────────────────────────────
  console.log('\nAppend-only enforcement (database-level)');

  const target = await prisma.auditLog.findFirst({ orderBy: { occurredAt: 'desc' } });

  let updateBlocked = false;
  try {
    await prisma.auditLog.update({ where: { id: target!.id }, data: { action: 'TAMPERED' } });
  } catch {
    updateBlocked = true;
  }
  check('UPDATE on audit_logs is rejected', updateBlocked);

  let deleteBlocked = false;
  try {
    await prisma.auditLog.delete({ where: { id: target!.id } });
  } catch {
    deleteBlocked = true;
  }
  check('DELETE on audit_logs is rejected', deleteBlocked);

  // ── 4. Job queue ───────────────────────────────────────────────────────
  console.log('\nJob queue');

  await enqueue(prisma, { type: JOB_TYPES.DISPATCH_OUTBOX, dedupeKey: 'smoke:dedupe' });
  await enqueue(prisma, { type: JOB_TYPES.DISPATCH_OUTBOX, dedupeKey: 'smoke:dedupe' });

  const deduped = await prisma.job.count({ where: { dedupeKey: 'smoke:dedupe' } });
  check('enqueue is idempotent under a dedupe key', deduped === 1, `${deduped} row(s)`);

  const claimed = await claimNext('smoke-worker');
  check('claimNext returns a job', claimed !== null, claimed?.type);

  if (claimed) {
    const second = await claimNext('other-worker');
    check(
      'a claimed job is not handed to a second worker',
      second?.id !== claimed.id,
      'FOR UPDATE SKIP LOCKED'
    );
    if (second) await markSucceeded(second.id);
    await markSucceeded(claimed.id);
  }

  await prisma.job.deleteMany({ where: { dedupeKey: 'smoke:dedupe' } });

  // ── 5. Financial constraints ───────────────────────────────────────────
  console.log('\nDatabase constraints');

  /**
   * This check used to pass for the WRONG REASON.
   *
   * It inserted `'smoke_fee'` and `'nope'` into uuid columns, so the statement
   * failed on the uuid cast (22P02) long before Postgres ever evaluated
   * `paid_not_over_total` — and the bare `catch` counted that as proof the
   * constraint works. A check that goes green without exercising the thing it
   * names is worse than no check at all.
   *
   * It now inspects the error code and only passes on 23514 (check_violation).
   * Reaching that requires a real application and fee structure, which arrive
   * in Phase 5; until then it reports honestly that it could not be exercised
   * rather than claiming a pass.
   */
  let overpayCode = '';
  try {
    await prisma.$executeRaw`
      INSERT INTO application_fees
        (id, "applicationId", "demandNumber", "feeStructureId", "feeStructureVersion",
         "totalAmount", "paidAmount", "updatedAt")
      VALUES (gen_random_uuid(), gen_random_uuid(), 'SMOKE/1', gen_random_uuid(), 1, 100.00, 500.00, NOW());
    `;
  } catch (err) {
    overpayCode = String((err as { meta?: { code?: string } })?.meta?.code ?? '')
      || (/Code: `(\d+\w*)`/.exec(String(err))?.[1] ?? '');
  }

  if (overpayCode === '23514') {
    check('a demand cannot be over-paid', true, 'paid_not_over_total');
  } else if (overpayCode === '23503') {
    // Foreign key refused first — the CHECK is never reached from here.
    console.log(
      '  – a demand cannot be over-paid — NOT EXERCISED (needs a real application ' +
        'and fee structure; Phase 5). The constraint exists in the migration.'
    );
  } else {
    check('a demand cannot be over-paid', false, `unexpected error ${overpayCode || 'none'}`);
  }

  console.log(
    failures === 0
      ? '\nAll checks passed.\n'
      : `\n${failures} check(s) FAILED.\n`
  );

  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('\nsmoke check crashed:', err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
