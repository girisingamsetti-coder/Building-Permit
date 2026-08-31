/**
 * Shapes the fee screens receive.
 *
 * Declared rather than inferred from Prisma because these cross the
 * server/client boundary, where `serialize()` has already turned every
 * `Decimal` into a number and every `Date` into an ISO string.
 *
 * Every amount here ARRIVED FROM THE SERVER. Nothing on the client computes,
 * adjusts or defaults a fee — the totals are rendered exactly as the demand
 * recorded them, which is what makes the printed breakdown and the stored
 * demand provably the same numbers.
 */

export type FeeLineRow = {
  id?: string;
  kind: 'COMPONENT' | 'ADJUSTMENT';
  code: string;
  componentCode?: string;
  name: string;
  componentName?: string;
  headOfAccount: string;
  basis: string;
  variableName: string;
  variableValue: number | null;
  rateApplied: number | null;
  computedAmount: number;
  amount: number;
  /** How the number was reached, in words. */
  note?: string;
  calculationNote?: string;
  displayOrder: number;
};

export type DemandRow = {
  id: string;
  demandNumber: string;
  type: 'ORIGINAL' | 'SHORTFALL' | 'REVISION';
  status: 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED' | 'WAIVED';
  feeStructureId: string;
  feeStructureCode: string;
  feeStructureVersion: number;
  roundingRule: string;
  /** The frozen variable values the demand was calculated from. */
  calculationInputs: Record<string, number | string>;
  subtotal: number;
  adjustmentTotal: number;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  dueDate: string | null;
  issuedAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  cancelReason: string;
  generatedById: string | null;
  generatedByName: string | null;
  createdAt: string;
  charges: FeeLineRow[];
  adjustments: FeeLineRow[];
};

export type PreviewCalculation = {
  structure: {
    id: string | null;
    code: string;
    name: string;
    version: number;
    roundingRule: string;
    isPlaceholder: boolean;
  };
  lines: FeeLineRow[];
  adjustments: FeeLineRow[];
  subtotal: number;
  adjustmentTotal: number;
  total: number;
  skipped: Array<{ code: string; name: string; reason: string }>;
  context: Record<string, number | string>;
};

export type FeesPayload = {
  application: {
    id: string;
    applicationNumber: string;
    status: string;
    applicationTypeName: string;
  };
  demands: DemandRow[];
  preview: PreviewCalculation | null;
  documents: {
    complete: boolean;
    missing: Array<{ code: string; name: string; reason: string }>;
    required: number;
  };
  canGenerate: boolean;
  generateBlockedReason: string | null;
};
