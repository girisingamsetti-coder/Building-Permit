import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { prisma } from '@/server/db/prisma';
import { applicationScope } from '@/server/auth/scope';
import { forbidden, notFound } from '@/server/http/errors';
import { currentProvider } from '@/server/payments';
import { buildMockGatewayRequest } from '@/server/payments/mock';
import { handleWebhook } from '@/server/services/payments';
import { mockGatewayActionSchema, type MockGatewayActionInput } from '@/lib/schemas/payments';

export const dynamic = 'force-dynamic';

/**
 * The demo gateway's Pay / Decline / Cancel buttons.
 *
 * ── This is the gateway's side of the boundary, not ours ───────────────
 *
 * Pressing a button here does NOT mark anything paid. It makes the demo
 * gateway emit a signed callback — the same shape, the same signature, the
 * same header a real gateway would send — and that callback is handed to the
 * ordinary webhook handler. Everything after that point is the production
 * path: signature verified, event recorded under its unique key, settlement
 * transaction opened, `provider.verify()` asked, amount checked.
 *
 * There is no demo-only settlement path to keep in step with the real one,
 * because there is only one path. That is the entire reason this route posts a
 * callback instead of calling the service.
 *
 * ── Only ever available when the mock driver is live ───────────────────
 *
 * Guarded twice: the driver must be the mock, and the mock refuses to be
 * `configured` in production without an explicit environment override. A
 * deployment with a real gateway has no reachable route by which somebody can
 * declare a payment successful.
 */
export const POST = defineRoute<MockGatewayActionInput>(
  async ({ user, params, body }) => {
    const provider = currentProvider();

    if (provider.name !== 'mock' || !provider.configured) {
      throw notFound('There is no demo gateway on this deployment.');
    }

    // The payer must be somebody who could have started this payment. The
    // scope is merged into the query, so another applicant's reference is "not
    // found" rather than a refusal that confirms it exists.
    const payment = await prisma.payment.findFirst({
      where: {
        paymentRef: params.ref!,
        provider: 'mock',
        application: { deletedAt: null, ...applicationScope(user) },
      },
      select: { id: true, paymentRef: true, amount: true, status: true, settlementLockAt: true },
    });

    if (!payment) throw notFound('That payment could not be found.');

    if (payment.settlementLockAt) {
      throw forbidden('That payment has already been settled.');
    }

    const amount = body.amountOverride ?? payment.amount.toFixed(2);

    // The gateway's state word, not ours: FAILED here is the gateway saying it
    // declined, which the settlement then confirms by asking.
    const state = body.outcome === 'FAILED' ? 'FAILED' : body.outcome;

    const deliver = () =>
      handleWebhook(
        'mock',
        buildMockGatewayRequest({
          paymentRef: payment.paymentRef,
          state,
          amount,
          // A fixed event id, so pressing the button twice — or asking for a
          // double delivery — reproduces a gateway redelivery exactly.
          eventId: `mock_evt_${payment.paymentRef}_${state}`,
        })
      );

    const first = await deliver();
    // Proves rule 2 from the interface rather than only from a test: the
    // second delivery is refused by the unique key and credits nothing.
    const second = body.deliverTwice ? await deliver() : null;

    return {
      paymentId: payment.id,
      delivered: second ? 2 : 1,
      first,
      second,
      returnUrl: `/payments/${payment.id}/return`,
    };
  },
  {
    capabilities: [CAPABILITIES.PAYMENT_INITIATE],
    schema: mockGatewayActionSchema,
  }
);
