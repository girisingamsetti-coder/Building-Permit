import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePageCapability } from '@/server/auth/page-guard';
import { CAPABILITIES } from '@/lib/constants';
import { can } from '@/server/auth/context';
import { listPayments } from '@/server/services/payments';
import { serialize } from '@/server/http/serialize';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard } from '@/components/common/kpi-card';
import { Button } from '@/components/ui/button';
import { PaymentsRegister, type RegisterRow } from '@/features/payments/payments-register';
import { prisma } from '@/server/db/prisma';
import { applicationScope } from '@/server/auth/scope';

export const metadata: Metadata = { title: 'Payments' };
export const dynamic = 'force-dynamic';

/**
 * The payments register.
 *
 * The Payments TAB answers "what do I owe on this application". This page
 * answers the finance officer's question instead — "what has come in, what is
 * stuck, and what needs looking at" — which is a queue rather than a tour of
 * applications one at a time.
 *
 * `listPayments` merges the caller's row scope into the query, so this one
 * page serves an LTP looking at their own payments and finance looking at
 * every payment in the city, with no second authorization path.
 */
export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageCapability(CAPABILITIES.PAYMENT_VIEW);
  const params = await searchParams;

  const first = (key: string): string | undefined => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const status = first('status');
  const search = first('q');
  const page = Number(first('page') ?? 1) || 1;

  const scope = { application: { deletedAt: null, ...applicationScope(user) } };

  const [result, received, inFlight, failed] = await Promise.all([
    listPayments(user, { status, search, page }),
    prisma.payment.count({ where: { ...scope, status: 'SUCCESS' } }),
    // The row that matters operationally: money that has been started and not
    // resolved. A register whose first number is "total payments" tells a
    // finance officer nothing they have to act on.
    prisma.payment.count({ where: { ...scope, status: { in: ['INITIATED', 'PENDING', 'PROCESSING'] } } }),
    prisma.payment.count({ where: { ...scope, status: { in: ['FAILED', 'TIMEOUT'] } } }),
  ]);

  return (
    <>
      <PageHeader
        title="Payments"
        actions={
          can(user, CAPABILITIES.PAYMENT_RECONCILE) ? <ReconcileButtonSlot /> : undefined
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <KpiCard label="Received" value={received} href="/payments?status=SUCCESS" tone="success" />
        <KpiCard
          label="Awaiting confirmation"
          value={inFlight}
          href="/payments?status=PROCESSING"
          tone={inFlight > 0 ? 'warning' : 'neutral'}
        />
        <KpiCard
          label="Failed or timed out"
          value={failed}
          href="/payments?status=FAILED"
          tone={failed > 0 ? 'danger' : 'neutral'}
        />
      </div>

      <PaymentsRegister
        rows={serialize(result.rows) as unknown as RegisterRow[]}
        total={result.total}
        page={result.page}
        totalPages={result.totalPages}
        status={status ?? ''}
        search={search ?? ''}
        canReconcile={can(user, CAPABILITIES.PAYMENT_RECONCILE)}
      />
    </>
  );
}

/**
 * The Reconcile control lives inside the register, which owns the busy state
 * and the toast. This keeps the header's shape without duplicating it.
 */
function ReconcileButtonSlot() {
  return (
    <Button asChild variant="ghost" size="sm">
      <Link href="#reconcile">Reconciliation</Link>
    </Button>
  );
}
