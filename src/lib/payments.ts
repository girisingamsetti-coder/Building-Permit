/**
 * Payment vocabulary. Isomorphic — the service, the routes, the receipt
 * renderer and the payment screens all read this file.
 *
 * ── The rule this file exists to protect ───────────────────────────────
 *
 * NOTHING HERE DECIDES WHETHER A PAYMENT SUCCEEDED. It maps states to words,
 * says which transitions the state machine allows, and explains a refusal in
 * a sentence a citizen can act on. The verdict itself comes from one place
 * only — `provider.verify()`, server to server, inside the settlement
 * transaction in src/server/services/payments.ts.
 *
 * That separation is the whole of §5. A helper here named `isSuccess` reads
 * a status that the server already wrote; it can never be the reason a status
 * becomes SUCCESS. Client code importing this file gets labels and gates, and
 * has no path to money.
 */

// ── The state machine ────────────────────────────────────────────────────

/**
 * The database vocabulary, and the §4 name each state carries.
 *
 * `INITIATED` and `REFUNDED` sit outside the six §4 states on purpose:
 * INITIATED is the moment before the gateway has been told anything, and
 * REFUNDED is Phase 6's. Both are real states of a real row, so both are
 * named rather than folded into a neighbour.
 */
export const PAYMENT_STATUSES = [
  'INITIATED',
  'PENDING',
  'PROCESSING',
  'SUCCESS',
  'FAILED',
  'CANCELLED',
  'TIMEOUT',
  'REFUNDED',
] as const;

export type PaymentStatusKey = (typeof PAYMENT_STATUSES)[number];

/** The §4 name for each state, for documentation and the API's own vocabulary. */
export const PAYMENT_STATE_NAMES: Record<PaymentStatusKey, string> = {
  INITIATED: 'PAYMENT_PENDING',
  PENDING: 'PAYMENT_PENDING',
  PROCESSING: 'PAYMENT_PROCESSING',
  SUCCESS: 'PAYMENT_SUCCESS',
  FAILED: 'PAYMENT_FAILED',
  CANCELLED: 'PAYMENT_CANCELLED',
  TIMEOUT: 'PAYMENT_TIMEOUT',
  REFUNDED: 'PAYMENT_REFUNDED',
};

/**
 * A payment nobody has settled yet. The partial unique index
 * `payment_one_open_per_demand` is built on exactly this set — change one and
 * the other must change with it, or the database and the service will disagree
 * about what "already paying" means.
 */
export const OPEN_PAYMENT_STATUSES: readonly PaymentStatusKey[] = [
  'INITIATED',
  'PENDING',
  'PROCESSING',
];

/** States from which nothing further happens without a new attempt. */
export const TERMINAL_PAYMENT_STATUSES: readonly PaymentStatusKey[] = [
  'SUCCESS',
  'FAILED',
  'CANCELLED',
  'TIMEOUT',
  'REFUNDED',
];

export const isOpenPayment = (status: string): boolean =>
  (OPEN_PAYMENT_STATUSES as readonly string[]).includes(status);

export const isTerminalPayment = (status: string): boolean =>
  (TERMINAL_PAYMENT_STATUSES as readonly string[]).includes(status);

/** True only for a payment the server has settled as successful. */
export const isPaid = (status: string): boolean => status === 'SUCCESS';

/**
 * An attempt that ended without money moving. A new attempt is offered for
 * each of these, and for none of the others.
 */
export const isRetryable = (status: string): boolean =>
  status === 'FAILED' || status === 'CANCELLED' || status === 'TIMEOUT';

/**
 * The transitions the state machine permits.
 *
 * Written out rather than inferred, because the interesting property is what
 * is ABSENT: there is no edge out of SUCCESS except REFUNDED, and no edge into
 * SUCCESS from anywhere but an open state. A settled payment cannot be talked
 * back into being unsettled by a late callback, and the settlement function
 * checks this table before it writes.
 */
const TRANSITIONS: Record<PaymentStatusKey, readonly PaymentStatusKey[]> = {
  INITIATED: ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED', 'TIMEOUT'],
  PENDING: ['PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED', 'TIMEOUT'],
  PROCESSING: ['SUCCESS', 'FAILED', 'CANCELLED', 'TIMEOUT'],
  SUCCESS: ['REFUNDED'],
  FAILED: [],
  CANCELLED: [],
  TIMEOUT: [],
  REFUNDED: [],
};

export function canTransition(from: string, to: string): boolean {
  const allowed = TRANSITIONS[from as PaymentStatusKey];
  return Boolean(allowed?.includes(to as PaymentStatusKey));
}

// ── What a provider may report ───────────────────────────────────────────

/**
 * The only four answers a provider is allowed to give.
 *
 * Deliberately narrower than PaymentStatus: a gateway may not report
 * INITIATED (that is our own bookkeeping) and may not report REFUNDED through
 * the settlement path. Anything a driver cannot map onto one of these becomes
 * PENDING — "we do not know yet" — which is the only safe default, because it
 * leaves the money uncredited and the sweep still asking.
 */
export const PROVIDER_STATES = ['PENDING', 'SUCCESS', 'FAILED', 'CANCELLED'] as const;
export type ProviderState = (typeof PROVIDER_STATES)[number];

export const isProviderState = (value: string): value is ProviderState =>
  (PROVIDER_STATES as readonly string[]).includes(value);

// ── Labels ───────────────────────────────────────────────────────────────

/**
 * Written for the person waiting for the screen to change.
 *
 * "Awaiting payment" rather than "Pending", "At the payment gateway" rather
 * than "Processing": an applicant reading these has money at stake and needs
 * to know whether anything is required of them.
 */
export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  INITIATED: 'Starting',
  PENDING: 'Awaiting payment',
  PROCESSING: 'At the payment gateway',
  SUCCESS: 'Paid',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  TIMEOUT: 'Timed out',
  REFUNDED: 'Refunded',
};

/** What the state means for the payer, in one sentence. */
export const PAYMENT_STATUS_DESCRIPTIONS: Record<string, string> = {
  INITIATED: 'The payment has been created but has not reached the gateway yet.',
  PENDING: 'The gateway has been told about this payment. Nothing has been paid yet.',
  PROCESSING: 'The payment is with the gateway. Do not close this window until it finishes.',
  SUCCESS: 'The money has been received and confirmed with the gateway.',
  FAILED: 'The gateway did not complete this payment. Nothing has been charged.',
  CANCELLED: 'The payment was cancelled before it completed. Nothing has been charged.',
  TIMEOUT: 'The gateway did not answer in time. If money left your account it will be reversed.',
  REFUNDED: 'This payment was received and has since been refunded.',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  UPI: 'UPI',
  CARD: 'Card',
  NETBANKING: 'Net banking',
  WALLET: 'Wallet',
  NEFT: 'NEFT',
  RTGS: 'RTGS',
  CHALLAN: 'Bank challan',
  DEMO: 'Demo gateway',
};

export const methodLabel = (method: string): string =>
  PAYMENT_METHOD_LABELS[method] ?? (method ? titleise(method) : '—');

/**
 * How each interaction with the gateway is described in the attempt log.
 *
 * The log is the answer to "what actually happened to my payment", and it is
 * shown to the applicant, so the words are theirs rather than ours.
 */
export const TRANSACTION_DIRECTION_LABELS: Record<string, string> = {
  INITIATE: 'Payment started',
  RETURN: 'Returned from the gateway',
  WEBHOOK: 'Gateway notified us',
  VERIFY: 'Confirmed with the gateway',
  RECONCILE: 'Checked by the reconciliation sweep',
  CANCEL: 'Cancelled',
  TIMEOUT: 'Timed out',
};

export const directionLabel = (direction: string): string =>
  TRANSACTION_DIRECTION_LABELS[direction] ?? titleise(direction);

// ── Gates ────────────────────────────────────────────────────────────────

/**
 * Which application statuses permit a payment to be started — for the ORIGINAL
 * demand.
 *
 * PAYMENT_PENDING and PAYMENT_FAILED are included because a retry is an
 * ordinary thing to do: a failed card is not a failed application. What is NOT
 * included is anything past the LTP stage: the original demand is paid once,
 * before the file goes to the department, and a request to pay it again from
 * TPA_REVIEW means something has gone wrong.
 */
const PAYABLE_APPLICATION_STATUSES = new Set<string>([
  'FEE_GENERATED',
  'PAYMENT_PENDING',
  'PAYMENT_FAILED',
]);

/** Nothing is payable on a file that has been decided or abandoned. */
const CLOSED_APPLICATION_STATUSES = new Set<string>([
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
  'LAPSED',
]);

/**
 * May a payment be started against this demand?
 *
 * The rule differs by demand TYPE, and it has to. A SHORTFALL demand is raised
 * by an officer with the file already at their desk — the application is
 * sitting at ZJD_REVIEW or DIRECTOR_SHORTFALL when the applicant comes to pay
 * it. Judging it by the same status list as the original demand would make
 * every shortfall demand permanently unpayable, which turns §12's "the LTP
 * pays the shortfall and the file resumes" into a dead end.
 *
 * So: the original is payable only in the LTP payment window; a shortfall or a
 * revision is payable whenever the file is live.
 */
export const canPayFrom = (applicationStatus: string, demandType = 'ORIGINAL'): boolean => {
  if (demandType === 'ORIGINAL') return PAYABLE_APPLICATION_STATUSES.has(applicationStatus);
  return applicationStatus !== 'DRAFT' && !CLOSED_APPLICATION_STATUSES.has(applicationStatus);
};

/** Demand statuses a payment may be raised against. */
const PAYABLE_DEMAND_STATUSES = new Set<string>(['ISSUED', 'PARTIALLY_PAID']);

export const isPayableDemand = (demandStatus: string): boolean =>
  PAYABLE_DEMAND_STATUSES.has(demandStatus);

/**
 * Why paying is not offered right now — or null when it is.
 *
 * One function, so the disabled button's tooltip, the API's 409 and the
 * server-rendered notice all say the same thing. A gate that explains itself
 * differently in three places is a gate people ring the office about.
 */
export function whyCannotPay(input: {
  applicationStatus: string;
  demandStatus: string;
  balance: number;
  /** ORIGINAL · SHORTFALL · REVISION. Decides which status rule applies. */
  demandType?: string;
}): string | null {
  if (input.demandStatus === 'CANCELLED') {
    return 'This demand was cancelled. A corrected demand has to be raised before anything is payable.';
  }
  if (input.demandStatus === 'WAIVED') {
    return 'This demand has been waived. There is nothing to pay.';
  }
  if (input.demandStatus === 'PAID' || input.balance <= 0) {
    return 'This demand has been paid in full.';
  }
  if (input.demandStatus === 'DRAFT') {
    return 'This demand has not been issued yet.';
  }
  if (!isPayableDemand(input.demandStatus)) {
    return 'This demand is not payable.';
  }
  const demandType = input.demandType ?? 'ORIGINAL';

  if (!canPayFrom(input.applicationStatus, demandType)) {
    if (input.applicationStatus === 'DRAFT') {
      return 'This application has not been filed yet.';
    }
    if (CLOSED_APPLICATION_STATUSES.has(input.applicationStatus)) {
      return 'This application is closed, so nothing further is payable on it.';
    }
    if (input.applicationStatus === 'PAYMENT_SUCCESSFUL') {
      return 'This application has already been paid for.';
    }
    return 'This application is past the payment stage.';
  }
  return null;
}

// ── Money ────────────────────────────────────────────────────────────────

/**
 * Do two amounts agree, to the paisa?
 *
 * The comparison is in integer paisa rather than on floats: 3349.50 and
 * 3349.499999999 are the same money and must compare equal, while 3349.50 and
 * 3349.51 are one paisa apart and must not. This is the check that refuses an
 * amount mismatch at settlement, so it is written where both the server and a
 * test can reach it.
 */
export const toPaise = (amount: number): number => Math.round(amount * 100);

export const amountsAgree = (a: number, b: number): boolean => toPaise(a) === toPaise(b);

/** `LAMS-PAY-<demand seq>-<attempt>-<random>`, ours, never a gateway's. */
export const PAYMENT_REF_PREFIX = 'PAY';

function titleise(value: string): string {
  const lower = value.toLowerCase().replace(/_/g, ' ');
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
