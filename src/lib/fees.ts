/**
 * Fee vocabulary. Isomorphic — the calculator, the demand renderer and the
 * admin structure editor all read this file.
 *
 * ── The rule this file exists to protect ───────────────────────────────
 *
 * NO FEE AMOUNT APPEARS IN FRONTEND CODE. Not a rate, not a minimum, not a
 * default. Every number on a demand came out of `fee_structures` and its
 * children, was computed by the calculator, and was frozen onto the demand.
 * What lives here is the *vocabulary* — how to describe a basis, how to round,
 * how to format rupees — which is the presentation of a number, never its
 * value.
 */

// ── Rounding ─────────────────────────────────────────────────────────────

export const ROUNDING_RULES = ['NONE', 'NEAREST_1', 'NEAREST_10', 'UP_10'] as const;
export type RoundingRule = (typeof ROUNDING_RULES)[number];

export const ROUNDING_LABELS: Record<RoundingRule, string> = {
  NONE: 'No rounding (to the paisa)',
  NEAREST_1: 'Nearest rupee',
  NEAREST_10: 'Nearest ₹10',
  UP_10: 'Up to the next ₹10',
};

export const isRoundingRule = (value: string): value is RoundingRule =>
  (ROUNDING_RULES as readonly string[]).includes(value);

// ── Bases ────────────────────────────────────────────────────────────────

export const CALCULATION_BASES = ['FLAT', 'PER_UNIT_AREA', 'SLAB', 'PERCENTAGE', 'FORMULA'] as const;
export type CalculationBasisKey = (typeof CALCULATION_BASES)[number];

export const BASIS_LABELS: Record<string, string> = {
  FLAT: 'Fixed amount',
  PER_UNIT_AREA: 'Per unit',
  SLAB: 'Slab',
  PERCENTAGE: 'Percentage',
  FORMULA: 'Formula',
};

export const basisLabel = (basis: string): string => BASIS_LABELS[basis] ?? titleise(basis);

/**
 * The context variables a fee structure may read — docs/07-subsystems.md N.3.
 *
 * THE definition, not a copy of one. The calculator builds exactly these keys,
 * the expression parser accepts exactly these names, and the admin editor
 * offers exactly these in its autocomplete. Anything else is a validation
 * error when the structure is SAVED, rather than a surprise when an applicant
 * is waiting for a demand.
 */
export const FEE_VARIABLES = [
  'plotAreaSqm',
  'builtUpAreaSqm',
  'floorAreaSqm',
  'coverageAreaSqm',
  'parkingAreaSqm',
  'numFloors',
  'numBasements',
  'numDwellingUnits',
  'buildingHeightM',
  'achievedFar',
  'achievedCoverage',
  'roadWidthM',
  'landUseZone',
  'buildingUse',
  'occupancyType',
  'structureType',
  'tenureType',
  'applicationTypeCode',
  'zoneCode',
  'district',
] as const;

export type FeeVariable = (typeof FEE_VARIABLES)[number];

/** The subset that carries a number. Only these may appear in arithmetic. */
export const NUMERIC_FEE_VARIABLES: readonly string[] = [
  'plotAreaSqm',
  'builtUpAreaSqm',
  'floorAreaSqm',
  'coverageAreaSqm',
  'parkingAreaSqm',
  'numFloors',
  'numBasements',
  'numDwellingUnits',
  'buildingHeightM',
  'achievedFar',
  'achievedCoverage',
  'roadWidthM',
];

/** Human labels, for the line-item table and the structure editor. */
export const VARIABLE_LABELS: Record<string, string> = {
  plotAreaSqm: 'Plot area (m²)',
  builtUpAreaSqm: 'Built-up area (m²)',
  floorAreaSqm: 'Floor area (m²)',
  coverageAreaSqm: 'Ground coverage (m²)',
  parkingAreaSqm: 'Parking area (m²)',
  numFloors: 'Floors',
  numBasements: 'Basements',
  numDwellingUnits: 'Dwelling units',
  buildingHeightM: 'Height (m)',
  achievedFar: 'Achieved FAR',
  achievedCoverage: 'Achieved coverage (%)',
  roadWidthM: 'Road width (m)',
  landUseZone: 'Land use',
  buildingUse: 'Building use',
  occupancyType: 'Occupancy',
  structureType: 'Structure',
  tenureType: 'Tenure',
  applicationTypeCode: 'Application type',
  zoneCode: 'Zone',
  district: 'District',
};

export const variableLabel = (name: string): string => VARIABLE_LABELS[name] ?? name;

// ── Money ────────────────────────────────────────────────────────────────

/**
 * Indian-format rupees: ₹1,23,456.00, lakh-and-crore grouping.
 *
 * `en-IN` gives the correct grouping in every runtime this ships to; the
 * manual fallback exists because a demand that renders as "NaN" because an
 * environment lacked a locale would be worse than one that renders plainly.
 */
export function formatMoney(amount: number, options: { decimals?: boolean } = {}): string {
  const decimals = options.decimals ?? true;
  const abs = Math.abs(amount);

  try {
    const formatted = new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: decimals ? 2 : 0,
      maximumFractionDigits: decimals ? 2 : 0,
    }).format(abs);
    return `${amount < 0 ? '−' : ''}₹${formatted}`;
  } catch {
    return `${amount < 0 ? '−' : ''}₹${abs.toFixed(decimals ? 2 : 0)}`;
  }
}

/** A rate, which may be a percentage, a per-unit rate or a flat amount. */
export function formatRate(
  basis: string,
  rate: number | null,
  variableName = ''
): string {
  if (rate === null || rate === undefined) return '—';
  if (basis === 'PERCENTAGE') return `${trimZeroes(rate)}%`;
  if (basis === 'PER_UNIT_AREA') {
    const unit = variableName.endsWith('Sqm') ? '/m²' : variableName ? ` per ${variableLabel(variableName).toLowerCase()}` : '';
    return `${formatMoney(rate, { decimals: false })}${unit}`;
  }
  if (basis === 'FLAT') return formatMoney(rate);
  return trimZeroes(rate);
}

const trimZeroes = (value: number): string =>
  String(Number(value.toFixed(4))).replace(/\.?0+$/, (m) => (m.includes('.') ? '' : m));

// ── Demand status ────────────────────────────────────────────────────────

export const DEMAND_TYPE_LABELS: Record<string, string> = {
  ORIGINAL: 'Original demand',
  SHORTFALL: 'Shortfall demand',
  REVISION: 'Revised demand',
};

/** A demand in one of these states is live and blocks a second original. */
export const LIVE_DEMAND_STATUSES: readonly string[] = [
  'DRAFT',
  'ISSUED',
  'PARTIALLY_PAID',
  'PAID',
];

export const isLiveDemand = (status: string): boolean => LIVE_DEMAND_STATUSES.includes(status);

// ── Gates ────────────────────────────────────────────────────────────────

/**
 * Which application statuses permit a demand to be generated.
 *
 * SCRUTINY_PASSED is included on purpose: an application type may have no
 * mandatory documents at all, in which case the document set is complete the
 * moment scrutiny passes and there is nothing to wait for. The completeness
 * gate — not the status — is what actually decides, and it is checked
 * separately and re-checked inside the transaction.
 */
const GENERATABLE = new Set<string>([
  'SCRUTINY_PASSED',
  'DOCUMENT_UPLOAD_PENDING',
  'DOCUMENTS_COMPLETED',
]);

export const canGenerateFee = (status: string): boolean => GENERATABLE.has(status);

export function whyCannotGenerateFee(status: string): string | null {
  if (canGenerateFee(status)) return null;

  if (status === 'DRAFT') {
    return 'This application has not been filed yet.';
  }
  if (['DRAWING_UPLOADED', 'SCRUTINY_IN_PROGRESS', 'SCRUTINY_FAILED', 'SUBMITTED'].includes(status)) {
    return 'The drawing must pass scrutiny before a fee can be raised.';
  }
  if (status === 'FEE_GENERATED') {
    return 'A demand has already been raised against this application.';
  }
  if (['PAYMENT_PENDING', 'PAYMENT_FAILED', 'PAYMENT_SUCCESSFUL'].includes(status)) {
    return 'A demand has already been raised and is being paid.';
  }
  return 'This application is past the fee stage.';
}

function titleise(value: string): string {
  const lower = value.toLowerCase().replace(/_/g, ' ');
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
