import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePageCapability } from '@/server/auth/page-guard';
import { CAPABILITIES } from '@/lib/constants';
import { requirePayment } from '@/server/services/payments';
import { isApiError } from '@/server/http/errors';
import { serialize } from '@/server/http/serialize';
import { PaymentReturn } from '@/features/payments/payment-return';
import type { PaymentRow } from '@/features/payments/types';

export const metadata: Metadata = { title: 'Payment' };
export const dynamic = 'force-dynamic';

/**
 * Where the gateway sends the payer back to.
 *
 * ── The query string is not read, anywhere ─────────────────────────────
 *
 * Gateways append their own parameters here — `razorpay_payment_id`, PayU's
 * `status`, CCAvenue's `encResp`. Every one of them travelled through the
 * payer's browser, so this page reads NONE of them. It knows one thing from
 * the URL: which payment the payer came back about, and that is a path segment
 * scoped to the caller.
 *
 * What it does with that is ask the server, which asks the gateway. §5.1 is
 * not a rule the page follows; there is no parameter here it could break it
 * with.
 *
 * ── Rendered before the answer is known ────────────────────────────────
 *
 * The page paints the current state immediately and the client then calls
 * `/verify`. That is the right order for a payer who has just been redirected
 * and wants to see something other than a blank tab — and it means the screen
 * is correct even when the webhook has already settled the payment before the
 * browser got back, which is the common case with a fast gateway.
 */
export default async function PaymentReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageCapability(CAPABILITIES.PAYMENT_VIEW);
  const { id } = await params;

  let payment;
  try {
    payment = await requirePayment(user, id);
  } catch (error) {
    if (isApiError(error) && (error.status === 404 || error.status === 403)) notFound();
    throw error;
  }

  return (
    <PaymentReturn
      initial={serialize(payment) as unknown as PaymentRow}
      applicationId={payment.applicationId}
      applicationNumber={payment.application.applicationNumber}
      demandNumber={payment.fee.demandNumber}
    />
  );
}
