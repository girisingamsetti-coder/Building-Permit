import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { requirePayment } from '@/server/services/payments';
import { currentProvider } from '@/server/payments';

export const dynamic = 'force-dynamic';

/**
 * One payment, with its gateway ledger and its receipt.
 *
 * What the processing screen polls while a payment is in flight. It reports
 * state and never changes it — the screen calls `/verify` when it wants an
 * answer from the gateway, and this endpoint when it only wants to know what
 * is already known.
 *
 * Keeping the two apart matters: a poll that verified would hit the gateway
 * every two seconds for every waiting payer.
 */
export const GET = defineRoute(
  async ({ user, params }) => {
    const payment = await requirePayment(user, params.id!);
    const provider = currentProvider();

    return {
      ...payment,
      gateway: { name: payment.provider, isDemo: provider.name === payment.provider && provider.isDemo },
    };
  },
  { capabilities: [CAPABILITIES.PAYMENT_VIEW] }
);
