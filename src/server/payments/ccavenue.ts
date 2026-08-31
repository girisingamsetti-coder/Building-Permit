import 'server-only';
import { createCipheriv, createDecipheriv, createHash } from 'node:crypto';
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
 * CCAvenue.
 *
 * ── Status of this driver ──────────────────────────────────────────────
 *
 * Written to CCAvenue's published integration kit. NOT exercised against a
 * live merchant account — it is `configured: false` until the merchant id,
 * working key and access code are set, and refuses rather than half-working.
 *
 * ── Why CCAvenue is the awkward one, and why that is useful ────────────
 *
 * It shares nothing with the other two. There is no JSON, no bearer token and
 * no signature header: the entire request is AES-encrypted with a key derived
 * from the working key, POSTed as a form field, and the response comes back
 * encrypted the same way. Authentication is not a signature at all — it is the
 * fact that only the merchant can decrypt the response.
 *
 * That is precisely why it is worth having a driver for it. If the
 * `PaymentProvider` interface can absorb CCAvenue without a single change to
 * `services/payments.ts`, the abstraction is real. It can, and it does: the
 * encryption lives entirely below `initiate()`, `verify()` and
 * `parseWebhook()`, and the service still only ever sees a `ProviderStatus`.
 *
 * ── The key derivation is not a detail ─────────────────────────────────
 *
 * AES-128-CBC, key = MD5(working key) as raw bytes, IV = the 16 fixed bytes
 * 0x00…0x0f, published in the integration kit. MD5 and a fixed IV are both
 * poor cryptography and neither is our choice; they are what the gateway
 * requires, and a driver that "improved" them would simply fail to talk to it.
 * The exposure is bounded — the ciphertext carries no secret the payer does
 * not already know — but it is recorded here rather than left to be
 * rediscovered.
 */

const LIVE_BASE = 'https://secure.ccavenue.com';
const API_BASE = 'https://apis.ccavenue.com';

/** The fixed IV from the integration kit: bytes 0x00 through 0x0f. */
const IV = Buffer.from([
  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
]);

const keyFrom = (workingKey: string): Buffer => createHash('md5').update(workingKey).digest();

export function ccavEncrypt(plain: string, workingKey: string): string {
  const cipher = createCipheriv('aes-128-cbc', keyFrom(workingKey), IV);
  return Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]).toString('hex');
}

export function ccavDecrypt(encoded: string, workingKey: string): string {
  const decipher = createDecipheriv('aes-128-cbc', keyFrom(workingKey), IV);
  return Buffer.concat([
    decipher.update(Buffer.from(encoded, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

/** CCAvenue's payloads are `a=1&b=2` strings, encrypted whole. */
const toQuery = (fields: Record<string, string>): string =>
  Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

const fromQuery = (value: string): Record<string, string> =>
  Object.fromEntries(new URLSearchParams(value).entries());

export class CCAvenueProvider implements PaymentProvider {
  readonly name = 'ccavenue';
  readonly isDemo = false;

  /** Three credentials, not two: merchant id, working key AND access code. */
  get configured(): boolean {
    return Boolean(env.paymentKeyId && env.paymentKeySecret && env.paymentAccessCode);
  }

  private get base(): string {
    return env.paymentApiBase || LIVE_BASE;
  }

  private assertUsable(): void {
    if (this.configured) return;
    throw serviceUnavailable(
      'The payment gateway is not configured (CCAvenue needs PAYMENT_KEY_ID, ' +
        'PAYMENT_KEY_SECRET and PAYMENT_ACCESS_CODE).'
    );
  }

  /**
   * Encrypts the order and hands back the form the browser must POST.
   *
   * No network call: like PayU, CCAvenue has no order-creation step. The
   * encrypted blob IS the order, and it cannot be tampered with in the browser
   * because the payer cannot re-encrypt it.
   */
  async initiate(input: InitiateInput): Promise<InitiateResult> {
    this.assertUsable();

    const plain = toQuery({
      merchant_id: env.paymentKeyId,
      order_id: input.paymentRef,
      amount: input.amount,
      currency: input.currency,
      redirect_url: input.returnUrl,
      cancel_url: input.returnUrl,
      language: 'EN',
      billing_name: input.payer.name,
      billing_email: input.payer.email,
      billing_tel: input.payer.phone,
      merchant_param1: input.applicationNumber,
      merchant_param2: input.demandNumber,
    });

    return {
      providerOrderId: input.paymentRef,
      formPost: {
        action: `${this.base}/transaction/transaction.do?command=initiateTransaction`,
        fields: {
          encRequest: ccavEncrypt(plain, env.paymentKeySecret),
          access_code: env.paymentAccessCode,
        },
      },
      // The plaintext is deliberately NOT stored: it carries the payer's
      // contact details and nothing here needs them again.
      payload: { driver: 'ccavenue', orderId: input.paymentRef },
    };
  }

  /**
   * The Order Status API — CCAvenue's server-to-server question.
   *
   * The request is encrypted, the response is encrypted, and the round trip is
   * the authentication: a reply we can decrypt with our working key came from
   * the merchant account that holds it.
   */
  async verify(paymentRef: string): Promise<ProviderStatus> {
    this.assertUsable();

    const encRequest = ccavEncrypt(toQuery({ order_no: paymentRef }), env.paymentKeySecret);

    const res = await fetch(
      `${env.paymentApiBase || API_BASE}/apis/servlet/DoWebTrans`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          enc_request: encRequest,
          access_code: env.paymentAccessCode,
          command: 'orderStatusTracker',
          request_type: 'JSON',
          response_type: 'JSON',
          version: '1.2',
        }),
        signal: AbortSignal.timeout(30_000),
      }
    );

    if (!res.ok) throw new Error(`CCAvenue returned ${res.status} verifying ${paymentRef}.`);

    const body = await res.text();
    const encResponse = new URLSearchParams(body).get('enc_response') ?? '';
    if (!encResponse) {
      throw new Error('CCAvenue returned no encrypted response.');
    }

    let order: CCAvenueOrder;
    try {
      const decrypted = ccavDecrypt(encResponse, env.paymentKeySecret);
      order = (JSON.parse(decrypted) as { Order_Status_Result?: CCAvenueOrder })
        .Order_Status_Result ?? {};
    } catch {
      // Undecryptable means the working key is wrong or the payload is not
      // theirs. Thrown, so the sweep retries rather than the amount being
      // treated as unpaid.
      throw new Error('CCAvenue response could not be decrypted.');
    }

    return {
      state: ccavState(order.order_status),
      gatewayTxnId: order.order_bank_ref_no ?? String(order.reference_no ?? ''),
      bankRef: order.order_bank_ref_no ?? '',
      method: normalisePayment(order.order_option_type ?? order.payment_mode),
      amount: order.order_amt ?? null,
      message: order.order_status_message ?? order.status_message ?? `CCAvenue: ${order.order_status ?? 'unknown'}`,
      raw: order,
    };
  }

  /**
   * Decrypts a CCAvenue response.
   *
   * Decryption IS the authentication here — there is no signature to compare.
   * A payload we cannot decrypt did not come from our merchant account, and is
   * refused as a bad callback rather than logged and ignored.
   *
   * `externalId` combines the order number with the tracking id, because
   * CCAvenue supplies no event id and a redelivery carries the same pair.
   */
  async parseWebhook(req: Request): Promise<WebhookEvent> {
    this.assertUsable();

    const form = new URLSearchParams(await req.text());
    const encResp = form.get('encResp') ?? form.get('enc_response') ?? '';
    if (!encResp) throw badRequest('That payment callback carried no encrypted response.');

    let fields: Record<string, string>;
    try {
      fields = fromQuery(ccavDecrypt(encResp, env.paymentKeySecret));
    } catch {
      throw badRequest('That payment callback could not be decrypted.');
    }

    const orderId = fields.order_id ?? '';
    if (!orderId) throw badRequest('That payment callback names no order.');

    return {
      externalId: `ccavenue:${orderId}:${fields.tracking_id ?? ''}:${fields.order_status ?? ''}`,
      eventType: `order.${(fields.order_status ?? 'unknown').toLowerCase()}`,
      paymentRef: orderId,
      hint: ccavState(fields.order_status),
      payload: fields,
    };
  }
}

type CCAvenueOrder = {
  order_status?: string;
  order_status_message?: string;
  status_message?: string;
  order_bank_ref_no?: string;
  reference_no?: string | number;
  order_amt?: string;
  order_option_type?: string;
  payment_mode?: string;
};

/**
 * CCAvenue's order statuses onto the four a provider may report.
 *
 * `Awaited` and `Initiated` are PENDING. `Aborted` is CANCELLED — the payer
 * walked away — while `Failure` and `Invalid` are FAILED. The distinction
 * matters to the applicant: one of those says try again, the other says
 * something was refused.
 */
function ccavState(status: string | undefined): ProviderState {
  const value = (status ?? '').toLowerCase();
  if (value === 'success' || value === 'shipped') return 'SUCCESS';
  if (value === 'aborted') return 'CANCELLED';
  if (value === 'failure' || value === 'invalid') return 'FAILED';
  return 'PENDING';
}

function normalisePayment(mode: string | undefined): string {
  const value = (mode ?? '').toLowerCase();
  if (value.includes('net')) return 'NETBANKING';
  if (value.includes('upi')) return 'UPI';
  if (value.includes('card')) return 'CARD';
  if (value.includes('wallet')) return 'WALLET';
  return (mode ?? '').toUpperCase();
}
