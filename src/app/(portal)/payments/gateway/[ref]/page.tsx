import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePageCapability } from '@/server/auth/page-guard';
import { CAPABILITIES } from '@/lib/constants';
import { prisma } from '@/server/db/prisma';
import { applicationScope } from '@/server/auth/scope';
import { currentProvider } from '@/server/payments';
import { num } from '@/server/http/serialize';
import { DemoGateway } from '@/features/payments/demo-gateway';

export const metadata: Metadata = { title: 'Payment gateway' };
export const dynamic = 'force-dynamic';

/**
 * The demonstration payment gateway.
 *
 * ── What this page is pretending to be ─────────────────────────────────
 *
 * A third party's hosted checkout. In a real deployment the payer leaves this
 * application entirely at this point and comes back through the return URL;
 * here they land on a page of our own that stands in for it.
 *
 * It is styled to look NOTHING like the rest of the product, and it says what
 * it is at the top in as many words. That is deliberate and it is the most
 * important thing about the page: a demonstration in which the fake gateway
 * looks like the real product is a demonstration somebody will later describe
 * to a committee as "we tested payments".
 *
 * ── Pressing a button here does not pay anything ───────────────────────
 *
 * Each button makes the demo gateway emit a signed callback, which goes
 * through the ordinary webhook handler — signature checked, event recorded
 * under its unique key, settlement transaction opened, `provider.verify()`
 * asked, amount compared. There is no demo-only settlement path.
 *
 * ── It does not exist unless the mock driver is live ───────────────────
 *
 * A deployment with a real gateway 404s here, and the mock refuses to be
 * `configured` in production without an explicit environment override. There
 * is no reachable route by which somebody can declare a payment successful.
 */
export default async function DemoGatewayPage({ params }: { params: Promise<{ ref: string }> }) {
  const user = await requirePageCapability(CAPABILITIES.PAYMENT_INITIATE);
  const { ref } = await params;

  const provider = currentProvider();
  if (provider.name !== 'mock' || !provider.configured) notFound();

  const payment = await prisma.payment.findFirst({
    where: {
      paymentRef: ref,
      provider: 'mock',
      application: { deletedAt: null, ...applicationScope(user) },
    },
    select: {
      id: true,
      paymentRef: true,
      amount: true,
      status: true,
      settlementLockAt: true,
      expiresAt: true,
      application: { select: { applicationNumber: true, applicant: { select: { name: true } } } },
      fee: { select: { demandNumber: true } },
    },
  });

  // Not theirs and not there are the same answer, as everywhere else.
  if (!payment) notFound();

  return (
    <DemoGateway
      paymentId={payment.id}
      paymentRef={payment.paymentRef}
      amount={num(payment.amount)}
      settled={payment.settlementLockAt !== null}
      status={payment.status}
      expiresAt={payment.expiresAt ? payment.expiresAt.toISOString() : null}
      applicationNumber={payment.application.applicationNumber}
      demandNumber={payment.fee.demandNumber}
      payerName={payment.application.applicant?.name ?? ''}
    />
  );
}
