import 'server-only';
import { createHash } from 'node:crypto';
import { env } from '@/server/config/env';
import { badRequest, serviceUnavailable } from '@/server/http/errors';
import type { ProviderState } from '@/lib/payments';
import type {
  InitiateInput,
  InitiateResult,
  PaymentProvider,
  ProviderStatus,
  WebhookEvent,
} from './types';

/**
 * PayU (India).
 *
 * ── Status of this driver ──────────────────────────────────────────────
 *
 * Written to PayU's published hash specification and its `verify_payment`
 * post-service. NOT exercised against a live merchant account — it is
 * `configured: false` until PAYMENT_KEY_ID (merchant key) and
 * PAYMENT_KEY_SECRET (salt) are set, and refuses rather than half-working.
 *
 * ── Why this driver exists in the shape it does ────────────────────────
 *
 * PayU is a FORM-POST gateway, not a redirect one: the browser must POST a
 * signed field set to the gateway. That is the reason `InitiateResult` carries
 * a `formPost` alternative at all — a `PaymentProvider` interface that could
 * only express "redirect the browser here" would have had to be widened the
 * day PayU was chosen, which is exactly the coupling the abstraction is for.
 *
 * ── The hash is the whole security model ───────────────────────────────
 *
 * PayU has no webhook signature header. The response is authenticated by a
 * REVERSE hash over the same fields in the opposite order, and getting the
 * field list or its order wrong produces a hash that never matches — or, far
 * worse, a check that is skipped. `requestHash` and `responseHash` below are
 * the published sequences, they are pure functions, and they are unit-tested.
 *
 * Even so, this driver does not settle on the response hash: a valid hash
 * proves the callback came from PayU, not that money was taken. `verify()`
 * asks PayU's own service, exactly as the Razorpay driver does.
 */

const LIVE_BASE = 'https://secure.payu.in';
const INFO_BASE = 'https://info.payu.in';

/**
 * The request hash — PayU's published sequence.
 *
 *   sha512(key|txnid|amount|productinfo|firstname|email|udf1…udf5||||||salt)
 *
 * The five empty fields before the salt are not padding to be tidied away:
 * PayU's own specification has udf6–udf10 as reserved empties and computes the
 * hash with them present. Removing them changes the digest.
 */
export function requestHash(input: {
  key: string;
  txnid: string;
  amount: string;
  productinfo: string;
  firstname: string;
  email: string;
  udf: [string, string, string, string, string];
  salt: string;
}): string {
  const parts = [
    input.key,
    input.txnid,
    input.amount,
    input.productinfo,
    input.firstname,
    input.email,
    ...input.udf,
    '',
    '',
    '',
    '',
    '',
    input.salt,
  ];
  return sha512(parts.join('|'));
}

/**
 * The reverse hash, which authenticates PayU's response.
 *
 *   sha512(salt|status||||||udf5…udf1|email|firstname|productinfo|amount|txnid|key)
 *
 * Same fields, opposite order, salt first. Written out rather than derived
 * from `requestHash` by reversing an array, because the two sequences are not
 * mirror images — the empty block sits in a different place — and a clever
 * reversal that looked right would silently accept forged callbacks.
 */
export function responseHash(input: {
  key: string;
  txnid: string;
  amount: string;
  productinfo: string;
  firstname: string;
  email: string;
  status: string;
  udf: [string, string, string, string, string];
  salt: string;
  /** PayU appends this to the sequence when it is present on the response. */
  additionalCharges?: string;
}): string {
  const core = [
    input.salt,
    input.status,
    '',
    '',
    '',
    '',
    '',
    '',
    ...[...input.udf].reverse(),
    input.email,
    input.firstname,
    input.productinfo,
    input.amount,
    input.txnid,
    input.key,
  ];

  const sequence = input.additionalCharges ? [input.additionalCharges, ...core] : core;
  return sha512(sequence.join('|'));
}

export class PayUProvider implements PaymentProvider {
  readonly name = 'payu';
  readonly isDemo = false;

  get configured(): boolean {
    return Boolean(env.paymentKeyId && env.paymentKeySecret);
  }

  private get base(): string {
    return env.paymentApiBase || LIVE_BASE;
  }

  private assertUsable(): void {
    if (this.configured) return;
    throw serviceUnavailable(
      'The payment gateway is not configured (PAYMENT_KEY_ID and PAYMENT_KEY_SECRET are unset).'
    );
  }

  /**
   * Builds the signed field set the browser must POST.
   *
   * No network call: PayU has no order-creation step. The fields ARE the
   * order, and the hash is what makes them tamper-evident — a payer who edits
   * the amount in the form invalidates it and PayU refuses the transaction.
   */
  async initiate(input: InitiateInput): Promise<InitiateResult> {
    this.assertUsable();

    const fields: Record<string, string> = {
      key: env.paymentKeyId,
      txnid: input.paymentRef,
      amount: input.amount,
      productinfo: input.demandNumber,
      firstname: input.payer.name,
      email: input.payer.email,
      phone: input.payer.phone,
      surl: input.returnUrl,
      furl: input.returnUrl,
      // udf1/udf2 travel with the transaction and come back on the response,
      // so a callback is traceable even before it is matched on txnid.
      udf1: input.applicationNumber,
      udf2: input.demandNumber,
      udf3: '',
      udf4: '',
      udf5: '',
    };

    fields.hash = requestHash({
      key: fields.key!,
      txnid: fields.txnid!,
      amount: fields.amount!,
      productinfo: fields.productinfo!,
      firstname: fields.firstname!,
      email: fields.email!,
      udf: [fields.udf1!, fields.udf2!, '', '', ''],
      salt: env.paymentKeySecret,
    });

    return {
      providerOrderId: input.paymentRef,
      formPost: { action: `${this.base}/_payment`, fields },
      payload: { driver: 'payu', txnid: input.paymentRef },
    };
  }

  /**
   * `verify_payment` — PayU's server-to-server status service.
   *
   *   command=verify_payment, var1=txnid,
   *   hash=sha512(key|command|var1|salt)
   */
  async verify(paymentRef: string): Promise<ProviderStatus> {
    this.assertUsable();

    const command = 'verify_payment';
    const hash = sha512([env.paymentKeyId, command, paymentRef, env.paymentKeySecret].join('|'));

    const res = await fetch(`${env.paymentApiBase || INFO_BASE}/merchant/postservice.php?form=2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ key: env.paymentKeyId, command, var1: paymentRef, hash }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) throw new Error(`PayU returned ${res.status} verifying ${paymentRef}.`);

    const body = (await res.json()) as {
      status?: number;
      transaction_details?: Record<string, PayUTransaction>;
    };

    const txn = body.transaction_details?.[paymentRef];

    // No record of the transaction. PayU has not been paid — but it also has
    // not refused, so this is PENDING and the sweep keeps asking.
    if (!txn) return { state: 'PENDING', message: 'PayU has no record of this transaction yet.', raw: body };

    return {
      state: payuState(txn.status),
      gatewayTxnId: txn.mihpayid ?? '',
      bankRef: txn.bank_ref_num ?? '',
      method: normaliseMode(txn.mode),
      amount: txn.amt ?? txn.transaction_amount ?? null,
      message: txn.error_Message || txn.field9 || `PayU status: ${txn.status ?? 'unknown'}`,
      raw: txn,
    };
  }

  /**
   * Authenticates a PayU callback by its reverse hash.
   *
   * PayU posts `application/x-www-form-urlencoded`, so the body is parsed as
   * form fields rather than JSON.
   *
   * `externalId` is built from the transaction id and the status, because PayU
   * supplies no event id: a redelivery of the same outcome produces the same
   * key and is refused as a duplicate, while a genuinely different outcome for
   * the same transaction is recorded and re-verified.
   */
  async parseWebhook(req: Request): Promise<WebhookEvent> {
    this.assertUsable();

    const raw = await req.text();
    const form = new URLSearchParams(raw);
    const get = (key: string) => form.get(key) ?? '';

    const txnid = get('txnid');
    const status = get('status');
    if (!txnid) throw badRequest('That payment callback names no transaction.');

    const expected = responseHash({
      key: env.paymentKeyId,
      txnid,
      amount: get('amount'),
      productinfo: get('productinfo'),
      firstname: get('firstname'),
      email: get('email'),
      status,
      udf: [get('udf1'), get('udf2'), get('udf3'), get('udf4'), get('udf5')],
      salt: env.paymentKeySecret,
      additionalCharges: form.get('additionalCharges') ?? undefined,
    });

    if (get('hash').toLowerCase() !== expected.toLowerCase()) {
      throw badRequest('That payment callback signature is not valid.');
    }

    return {
      externalId: `payu:${txnid}:${status}:${get('mihpayid')}`,
      eventType: `payment.${status.toLowerCase()}`,
      paymentRef: txnid,
      hint: payuState(status),
      payload: Object.fromEntries(form.entries()),
    };
  }
}

type PayUTransaction = {
  status?: string;
  mihpayid?: string;
  bank_ref_num?: string;
  mode?: string;
  amt?: string;
  transaction_amount?: string;
  error_Message?: string;
  field9?: string;
};

/**
 * PayU's status words onto the four a provider may report.
 *
 * `pending` and `in progress` are PENDING and not FAILED: a net-banking
 * payment sits there for minutes, and reporting it as failed would fail an
 * application while the money was still on its way.
 */
function payuState(status: string | undefined): ProviderState {
  const value = (status ?? '').toLowerCase();
  if (value === 'success' || value === 'captured') return 'SUCCESS';
  if (value === 'failure' || value === 'failed' || value === 'bounced') return 'FAILED';
  if (value === 'cancel' || value === 'cancelled' || value === 'usercancelled') return 'CANCELLED';
  return 'PENDING';
}

function normaliseMode(mode: string | undefined): string {
  const upper = (mode ?? '').toUpperCase();
  if (upper === 'CC' || upper === 'DC') return 'CARD';
  if (upper === 'NB') return 'NETBANKING';
  if (upper === 'UPI') return 'UPI';
  if (upper === 'CASH' || upper === 'WALLET') return 'WALLET';
  return upper;
}

const sha512 = (value: string): string => createHash('sha512').update(value).digest('hex');
