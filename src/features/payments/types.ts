/**
 * Shapes the payment screens receive.
 *
 * Declared rather than inferred from Prisma because these cross the
 * server/client boundary, where `serialize()` has already turned every
 * `Decimal` into a number and every `Date` into an ISO string.
 *
 * ── What is deliberately not here ──────────────────────────────────────
 *
 * There is no field a screen could set to change an outcome. A client can
 * render a status, and it can ask the server to verify one — it cannot assert
 * one. Every amount and every status below ARRIVED FROM THE SERVER, and the
 * only payload any payment screen ever sends is a demand id.
 */

export type PaymentTransactionRow = {
  id: string;
  attemptNo: number;
  /** INITIATE · RETURN · WEBHOOK · VERIFY · RECONCILE · CANCEL · TIMEOUT */
  direction: string;
  status: string;
  gatewayTxnId: string | null;
  bankRef: string;
  method: string;
  amount: number | null;
  message: string;
  occurredAt: string;
};

export type ReceiptRow = {
  id: string;
  receiptNumber: string;
  amount: number;
  issuedAt: string;
  storageKey?: string;
};

export type PaymentRow = {
  id: string;
  paymentRef: string;
  provider: string;
  status: string;
  amount: number;
  attemptNo: number;
  providerOrderId: string;
  gatewayTxnId: string | null;
  bankRef: string;
  method: string;
  initiatedAt: string;
  settledAt: string | null;
  failureReason: string;
  expiresAt: string | null;
  lastVerifiedAt: string | null;
  verifyAttempts: number;
  applicationFeeId: string;
  isOpen: boolean;
  canRetry: boolean;
  transactions: PaymentTransactionRow[];
  receipt: ReceiptRow | null;
};

export type PayableLineRow = {
  id: string;
  kind: string;
  componentCode: string;
  componentName: string;
  headOfAccount: string;
  basis: string;
  variableName: string;
  variableValue: number | null;
  rateApplied: number | null;
  computedAmount: number;
  amount: number;
  calculationNote: string;
  displayOrder: number;
};

export type PayableDemandRow = {
  id: string;
  demandNumber: string;
  type: string;
  status: string;
  subtotal: number;
  adjustmentTotal: number;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  dueDate: string | null;
  issuedAt: string | null;
  paidAt: string | null;
  charges: PayableLineRow[];
  adjustments: PayableLineRow[];
  /** Null when this demand can be paid right now. */
  blockedReason: string | null;
};

export type PaymentsPayload = {
  application: { id: string; applicationNumber: string; status: string };
  demands: PayableDemandRow[];
  payments: PaymentRow[];
  summary: { totalDemanded: number; totalPaid: number; balance: number };
  gateway: { name: string; isDemo: boolean; configured: boolean };
  canInitiate: boolean;
  blockedReason: string | null;
};

/** What `POST /api/payments/initiate` answers with. */
export type InitiateResponse = {
  payment: PaymentRow;
  redirectUrl: string | null;
  formPost: { action: string; fields: Record<string, string> } | null;
  payload: Record<string, unknown>;
  reused: boolean;
  gateway: { name: string; isDemo: boolean };
};

/** What every settlement route answers with. */
export type SettlementResponse = {
  paymentId: string;
  paymentRef: string;
  status: string;
  changed: boolean;
  message: string;
  receiptNumber: string | null;
  applicationStatus: string;
};
