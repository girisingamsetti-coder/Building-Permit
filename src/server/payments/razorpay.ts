import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/server/config/env';
import { badRequest, serviceUnavailable } from '@/server/http/errors';
import type { ProviderState } from '@/lib/payments';
import type {
  InitiateInput,
  InitiateResult,
  PaymentProvider,
  ProviderStatus,
  RefundResult,
  WebhookEvent,
} from './types';

/**
 * Razorpay.
 *
 * ── Status of this driver ──────────────────────────────────────────────
 *
 * Written to Razorpay's published Orders and Webhooks specification. It has
 * NOT been exercised against a live merchant account — no credentials have
 * been supplied — so it is `configured: false` until PAYMENT_KEY_ID and
 * PAYMENT_KEY_SECRET are set, and it refuses rather than half-working.
 *
 * What that leaves is worth having on its own: the signature algorithm below
 * is the real one, it is unit-tested, and the shape of every call is fixed. If
 * the department picks Razorpay, the work is credentials and a sandbox run —
 * not an integration.
 *
 * ── The order of operations that matters ───────────────────────────────
 *
 * Razorpay's browser SDK hands the page back `razorpay_payment_id`,
 * `razorpay_order_id` and `razorpay_signature`, and every published example
 * verifies that triple on the server and calls it done. THIS DRIVER DOES NOT
 * DO THAT, and the omission is deliberate: the triple travels through the
 * payer's browser, and §5.1 says the browser is never believed. `verify()`
 * asks Razorpay's API what the order's payments actually are. The signed
 * triple is worth exactly one thing — knowing it is worth calling `verify()` —
 * and that is what the return route does with it.
 */

const API_BASE = 'https://api.razorpay.com/v1';

/** Razorpay speaks paise. Rupees never cross this boundary as a float. */
const toPaise = (rupees: string): number => Math.round(Number(rupees) * 100);
const toRupees = (paise: number): string => (paise / 100).toFixed(2);

type RazorpayOrder = { id?: string; amount?: number; status?: string };
type RazorpayPayment = {
  id?: string;
  status?: string;
  amount?: number;
  method?: string;
  bank?: string;
  acquirer_data?: { bank_transaction_id?: string; rrn?: string };
  error_description?: string;
};

export class RazorpayProvider implements PaymentProvider {
  readonly name = 'razorpay';
  readonly isDemo = false;

  get configured(): boolean {
    return Boolean(env.paymentKeyId && env.paymentKeySecret);
  }

  private get base(): string {
    return env.paymentApiBase || API_BASE;
  }

  private assertUsable(): void {
    if (this.configured) return;
    throw serviceUnavailable(
      'The payment gateway is not configured (PAYMENT_KEY_ID and PAYMENT_KEY_SECRET are unset).'
    );
  }

  private authHeader(): string {
    const token = Buffer.from(`${env.paymentKeyId}:${env.paymentKeySecret}`).toString('base64');
    return `Basic ${token}`;
  }

  /**
   * Creates an order.
   *
   * `receipt` carries OUR reference, which is what makes a webhook traceable
   * back to a row here: Razorpay echoes it on every payment for the order, so
   * a callback never depends on us having stored a mapping in time.
   */
  async initiate(input: InitiateInput): Promise<InitiateResult> {
    this.assertUsable();

    const res = await fetch(`${this.base}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: this.authHeader() },
      body: JSON.stringify({
        amount: toPaise(input.amount),
        currency: input.currency,
        receipt: input.paymentRef,
        // Razorpay caps notes at 15 keys; these four are the ones a finance
        // officer looking at the gateway dashboard actually needs.
        notes: {
          paymentRef: input.paymentRef,
          applicationNumber: input.applicationNumber,
          demandNumber: input.demandNumber,
          description: input.description.slice(0, 250),
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      // Thrown, not returned: no order exists, so there is nothing to send a
      // payer to. The initiate route surfaces this as a 503 and no payment row
      // is left stranded at INITIATED.
      throw new Error(`Razorpay returned ${res.status} creating an order.`);
    }

    const order = (await res.json()) as RazorpayOrder;
    if (!order.id) throw new Error('Razorpay created an order without an id.');

    return {
      providerOrderId: order.id,
      // Razorpay is an SDK checkout rather than a redirect. The payload is
      // what the payment page needs to open it; the key id is publishable by
      // design, the secret never leaves the server.
      payload: {
        driver: 'razorpay',
        keyId: env.paymentKeyId,
        orderId: order.id,
        amount: toPaise(input.amount),
        currency: input.currency,
        name: input.description,
        prefill: { name: input.payer.name, email: input.payer.email, contact: input.payer.phone },
        callbackUrl: input.returnUrl,
      },
    };
  }

  /**
   * Asks Razorpay what actually happened to the order.
   *
   * `captured` is the only state that means money has been taken. `authorized`
   * means the bank has held it and it has NOT been captured — reported as
   * PENDING, never as success, because an authorisation that is never captured
   * is released back to the payer and crediting a demand for it would book
   * money the department never receives.
   */
  async verify(paymentRef: string, hint?: Record<string, unknown>): Promise<ProviderStatus> {
    this.assertUsable();

    const orderId = typeof hint?.providerOrderId === 'string' ? hint.providerOrderId : '';
    if (!orderId) {
      // We were never told an order id, so there is nothing to ask about. Not
      // an error — the attempt simply has not reached the gateway.
      return { state: 'PENDING', message: 'No Razorpay order was created for this payment.' };
    }

    const res = await fetch(`${this.base}/orders/${encodeURIComponent(orderId)}/payments`, {
      headers: { Authorization: this.authHeader() },
      signal: AbortSignal.timeout(30_000),
    });

    // Thrown, so the sweep asks again. "I could not ask" is not "not paid" —
    // conflating them times out payments that actually succeeded.
    if (!res.ok) throw new Error(`Razorpay returned ${res.status} verifying ${paymentRef}.`);

    const body = (await res.json()) as { items?: RazorpayPayment[] };
    const items = body.items ?? [];

    const captured = items.find((p) => p.status === 'captured');
    if (captured) {
      return {
        state: 'SUCCESS',
        gatewayTxnId: captured.id,
        bankRef: captured.acquirer_data?.rrn ?? captured.acquirer_data?.bank_transaction_id ?? '',
        method: normaliseMethod(captured.method),
        amount: typeof captured.amount === 'number' ? toRupees(captured.amount) : null,
        message: 'Captured by Razorpay.',
        raw: captured,
      };
    }

    const authorized = items.find((p) => p.status === 'authorized' || p.status === 'created');
    if (authorized) {
      return {
        state: 'PENDING',
        gatewayTxnId: authorized.id,
        message: 'Authorised but not captured.',
        raw: authorized,
      };
    }

    const failed = items.find((p) => p.status === 'failed');
    if (failed) {
      return {
        state: 'FAILED',
        gatewayTxnId: failed.id,
        message: failed.error_description ?? 'Razorpay reported the payment as failed.',
        raw: failed,
      };
    }

    // The order exists and nobody has paid against it.
    return { state: 'PENDING', message: 'No payment has been made against this order.', raw: body };
  }

  /**
   * Verifies a Razorpay webhook.
   *
   * `x-razorpay-signature` is HMAC-SHA256 of the RAW body under the webhook
   * secret — the raw body, not a re-serialisation of the parsed object, which
   * would differ by whitespace and key order and fail every time.
   *
   * `x-razorpay-event-id` is Razorpay's own id for the delivery and is stable
   * across retries, which is exactly what the duplicate-callback key needs.
   */
  async parseWebhook(req: Request): Promise<WebhookEvent> {
    const secret = env.paymentWebhookSecret;
    if (!secret) {
      throw serviceUnavailable(
        'A Razorpay callback arrived but PAYMENT_WEBHOOK_SECRET is not set, so it cannot be verified.'
      );
    }

    const raw = await req.text();
    const provided = req.headers.get('x-razorpay-signature') ?? '';
    const expected = createHmac('sha256', secret).update(raw).digest('hex');

    if (!safeEqual(provided, expected)) {
      throw badRequest('That payment callback signature is not valid.');
    }

    const body = JSON.parse(raw) as {
      event?: string;
      payload?: { payment?: { entity?: { notes?: Record<string, string>; order_id?: string; id?: string } } };
    };

    const entity = body.payload?.payment?.entity;
    const event = body.event ?? '';

    return {
      externalId: req.headers.get('x-razorpay-event-id') ?? `${event}:${entity?.id ?? raw.length}`,
      eventType: event,
      // The receipt we set at initiate comes back in notes. Falling back to the
      // order id lets the service match on `providerOrderId` when it does not.
      paymentRef: entity?.notes?.paymentRef ?? '',
      hint: hintFor(event),
      payload: body as Record<string, unknown>,
    };
  }

  async refund(paymentRef: string, amount: string, reason: string): Promise<RefundResult> {
    this.assertUsable();
    // Razorpay refunds are issued against a PAYMENT id, which is only known
    // once a payment has been captured. Phase 6 threads it through; refusing
    // clearly is better than issuing a refund against the wrong identifier.
    throw serviceUnavailable(
      `Razorpay refunds are not wired up yet (${paymentRef}, ${amount}, ${reason}).`
    );
  }
}

/**
 * Which events are worth calling verify() for.
 *
 * A hint, and never a status. `payment.captured` arriving does not credit
 * anything — it causes one server-to-server call, and that call decides.
 */
function hintFor(event: string): ProviderState {
  if (event === 'payment.captured' || event === 'order.paid') return 'SUCCESS';
  if (event === 'payment.failed') return 'FAILED';
  return 'PENDING';
}

/** Razorpay's method names onto ours. An unknown one is kept, not dropped. */
function normaliseMethod(method: string | undefined): string {
  const upper = (method ?? '').toUpperCase();
  if (upper === 'NETBANKING') return 'NETBANKING';
  if (upper === 'UPI' || upper === 'CARD' || upper === 'WALLET') return upper;
  return upper;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
