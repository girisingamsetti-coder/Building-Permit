/**
 * Removes accounts created by live verification or a failed test run.
 *
 * Matches only the throwaway prefixes, never a real account, and never touches
 * the eleven demo users.
 *
 *   npx tsx --conditions=react-server --env-file-if-exists=.env scripts/cleanup-test-users.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const PREFIXES = ['test-', 'live-', 'dbg-'];

async function main() {
  const users = await prisma.user.findMany({
    where: { OR: PREFIXES.map((p) => ({ email: { startsWith: p } })) },
    select: { id: true, email: true },
  });

  if (users.length) {
    const ids = users.map((u) => u.id);
    const emails = users.map((u) => u.email);

    // Payments RESTRICT their application, and the append-only trigger on
    // `payment_transactions` fires on a CASCADE from the parent too — so a
    // payment cannot be removed without disabling it. That is the property the
    // trigger exists to have in production; here it means the cleanup has to
    // be explicit about lifting it, and restore it in a `finally`.
    const payments = await prisma.payment.findMany({
      where: { application: { ltpUserId: { in: ids } } },
      select: { id: true, paymentRef: true },
    });

    if (payments.length) {
      const paymentIds = payments.map((p) => p.id);
      await prisma.paymentWebhookEvent.deleteMany({
        where: {
          OR: [
            { paymentId: { in: paymentIds } },
            { paymentRef: { in: payments.map((p) => p.paymentRef) } },
          ],
        },
      });

      await prisma.$executeRawUnsafe(
        'ALTER TABLE payment_transactions DISABLE TRIGGER payment_transactions_append_only'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE payment_receipts DISABLE TRIGGER payment_receipts_immutable'
      );
      try {
        await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
      } finally {
        await prisma.$executeRawUnsafe(
          'ALTER TABLE payment_receipts ENABLE TRIGGER payment_receipts_immutable'
        );
        await prisma.$executeRawUnsafe(
          'ALTER TABLE payment_transactions ENABLE TRIGGER payment_transactions_append_only'
        );
      }
    }

    // Applications hold a REQUIRED reference to their LTP with no cascade, so
    // they go before the user rows. Their own children cascade from here.
    await prisma.application.deleteMany({ where: { ltpUserId: { in: ids } } });

    // Children before parents.
    await prisma.session.deleteMany({ where: { userId: { in: ids } } });
    await prisma.passwordReset.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userJurisdiction.deleteMany({ where: { userId: { in: ids } } });
    await prisma.notificationPreference.deleteMany({ where: { userId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.loginAttempt.deleteMany({ where: { email: { in: emails } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  // audit_logs are append-only and are deliberately left in place.
  console.log(`Removed ${users.length} throwaway account(s).`);

  const counts = {
    users: await prisma.user.count({ where: { deletedAt: null } }),
    roles: await prisma.role.count(),
    permissions: await prisma.permission.count(),
    grants: await prisma.rolePermission.count(),
    auditRows: await prisma.auditLog.count(),
    sessions: await prisma.session.count({ where: { revokedAt: null } }),
  };

  console.table(counts);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
