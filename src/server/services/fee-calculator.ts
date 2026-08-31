import 'server-only';
import { Prisma } from '@prisma/client';
import { evaluateExpression } from '@/lib/fee-expression';
import { evaluateCondition, isAlways, describeCondition } from '@/lib/conditions';
import { isRoundingRule, type RoundingRule } from '@/lib/fees';

/**
 * The fee calculator — docs/07-subsystems.md N.
 *
 * ── What this file is, and what it deliberately is not ─────────────────
 *
 * It is a PURE FUNCTION: structure in, breakdown out. No database, no session,
 * no clock. Everything effective-dated, everything about who may generate a
 * demand and when, lives in services/fees.ts; everything about arithmetic
 * lives here. That separation is what lets the whole of §7 — the money — be
 * tested exhaustively without a database, and it is why a rate change cannot
 * require a code change: the rates are the INPUT to this function.
 *
 * There is not a single fee amount anywhere in this file, or anywhere in
 * src/lib, or anywhere in src/features. Every number on a demand came out of
 * `fee_structures` and its children.
 *
 * ── Order of operations, per component ─────────────────────────────────
 *
 *   1. condition        false → the component is skipped, and the skip is
 *                       RECORDED. "Why was I not charged X?" must have an
 *                       answer, and silence is not one.
 *   2. compute          by basis — FLAT | PER_UNIT_AREA | SLAB | PERCENTAGE |
 *                       FORMULA
 *   3. clamp            min and max, noting that it happened
 *   4. round            per the structure's rule
 *
 * Components are processed in `displayOrder`, which is what makes PERCENTAGE
 * work: it may only refer to a component already computed. A forward reference
 * is a configuration error and is refused loudly rather than silently charging
 * a percentage of zero.
 *
 * Rules (rebates and surcharges) run afterwards, against the same context and
 * the finished component totals.
 */

const D = Prisma.Decimal;
type Decimal = Prisma.Decimal;

const ZERO = new D(0);

// ═══════════════════════════════════════════════════════════════════════════
// Inputs
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The whitelisted variable set (docs N.3), flat by design.
 *
 * Flat rather than nested because these names are what an administrator types
 * into a formula. `plotAreaSqm * 15` is a fee schedule; `property.plotAreaSqm
 * * 15` is a data model leaking into a document that outlives it.
 */
export type FeeContext = Record<string, number | string>;

export type SlabSpec = {
  fromValue: number;
  /** Null = open ended. */
  toValue: number | null;
  rate: number;
  /** When set, the band charges this instead of `rate` × the banded quantity. */
  flatAmount: number | null;
  displayOrder: number;
};

export type ComponentSpec = {
  id?: string | null;
  code: string;
  name: string;
  headOfAccount?: string;
  basis: 'FLAT' | 'PER_UNIT_AREA' | 'SLAB' | 'PERCENTAGE' | 'FORMULA';
  rate: number | null;
  variable?: string;
  /** One or more component codes, comma separated. */
  percentOfCode?: string;
  expression?: string;
  minAmount?: number | null;
  maxAmount?: number | null;
  condition?: unknown;
  displayOrder: number;
  isActive?: boolean;
  slabs?: SlabSpec[];
};

export type RuleSpec = {
  id?: string | null;
  code: string;
  name: string;
  kind: 'REBATE' | 'SURCHARGE';
  basis: 'FLAT' | 'PERCENTAGE';
  rate: number | null;
  /** Component codes the percentage applies to. Empty = the subtotal. */
  appliesToCode?: string;
  minAmount?: number | null;
  maxAmount?: number | null;
  condition?: unknown;
  reason?: string;
  displayOrder: number;
  isActive?: boolean;
};

export type StructureSpec = {
  id?: string | null;
  code: string;
  name: string;
  version: number;
  roundingRule: string;
  isPlaceholder?: boolean;
  components: ComponentSpec[];
  rules?: RuleSpec[];
};

// ═══════════════════════════════════════════════════════════════════════════
// Outputs
// ═══════════════════════════════════════════════════════════════════════════

export type CalculatedLine = {
  kind: 'COMPONENT' | 'ADJUSTMENT';
  componentId: string | null;
  ruleId: string | null;
  code: string;
  name: string;
  headOfAccount: string;
  basis: string;
  variableName: string;
  variableValue: number | null;
  rateApplied: Decimal | null;
  /** Before clamping and rounding. */
  computedAmount: Decimal;
  /** What is charged. Negative on a rebate line. */
  amount: Decimal;
  /** How the number was reached, in words. Printed on the demand. */
  note: string;
  displayOrder: number;
};

export type SkippedComponent = {
  code: string;
  name: string;
  reason: string;
};

export type Calculation = {
  structure: {
    id: string | null;
    code: string;
    name: string;
    version: number;
    roundingRule: RoundingRule;
    isPlaceholder: boolean;
  };
  /** Charges. */
  lines: CalculatedLine[];
  /** Rebates and surcharges. */
  adjustments: CalculatedLine[];
  subtotal: Decimal;
  /** Signed: negative when rebates outweigh surcharges. */
  adjustmentTotal: Decimal;
  total: Decimal;
  /** Components and rules that did not apply, and why. */
  skipped: SkippedComponent[];
  context: FeeContext;
};

export class FeeCalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeeCalculationError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// The calculator
// ═══════════════════════════════════════════════════════════════════════════

export function calculateFee(structure: StructureSpec, context: FeeContext): Calculation {
  const roundingRule: RoundingRule = isRoundingRule(structure.roundingRule)
    ? structure.roundingRule
    : 'NEAREST_1';

  const components = [...structure.components]
    .filter((c) => c.isActive !== false)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.code.localeCompare(b.code));

  const lines: CalculatedLine[] = [];
  const skipped: SkippedComponent[] = [];
  /** Finished component amounts, by code — what PERCENTAGE reads. */
  const computed = new Map<string, Decimal>();

  for (const component of components) {
    if (!isAlways(component.condition) && !evaluateCondition(component.condition, context)) {
      skipped.push({
        code: component.code,
        name: component.name,
        reason: reasonFor(component.condition),
      });
      continue;
    }

    const line = computeComponent(component, context, computed, roundingRule);

    computed.set(component.code, line.amount);
    lines.push(line);
  }

  const subtotal = lines.reduce((sum, line) => sum.plus(line.amount), ZERO);

  const { adjustments, adjustmentTotal, skippedRules } = applyRules(
    structure.rules ?? [],
    context,
    computed,
    subtotal,
    roundingRule
  );

  return {
    structure: {
      id: structure.id ?? null,
      code: structure.code,
      name: structure.name,
      version: structure.version,
      roundingRule,
      isPlaceholder: structure.isPlaceholder ?? false,
    },
    lines,
    adjustments,
    subtotal: money(subtotal),
    adjustmentTotal: money(adjustmentTotal),
    total: money(subtotal.plus(adjustmentTotal)),
    skipped: [...skipped, ...skippedRules],
    context,
  };
}

// ── One component ────────────────────────────────────────────────────────

function computeComponent(
  component: ComponentSpec,
  context: FeeContext,
  computed: Map<string, Decimal>,
  roundingRule: RoundingRule
): CalculatedLine {
  const rate = component.rate === null || component.rate === undefined ? null : new D(component.rate);

  let raw: Decimal;
  let note: string;
  let variableValue: number | null = null;
  const variableName = component.variable ?? '';

  switch (component.basis) {
    case 'FLAT': {
      if (!rate) throw configError(component, 'has no amount set');
      raw = rate;
      note = 'Fixed charge.';
      break;
    }

    case 'PER_UNIT_AREA': {
      if (!rate) throw configError(component, 'has no rate set');
      if (!variableName) throw configError(component, 'does not say which quantity it is charged on');

      variableValue = numericVariable(component, context, variableName);
      raw = rate.mul(variableValue);
      note = `${formatQuantity(variableValue)} × ${rate.toString()}`;
      break;
    }

    case 'SLAB': {
      if (!variableName) throw configError(component, 'does not say which quantity its slabs band');

      variableValue = numericVariable(component, context, variableName);
      const walked = walkSlabs(component, variableValue);
      raw = walked.amount;
      note = walked.note;
      break;
    }

    case 'PERCENTAGE': {
      if (!rate) throw configError(component, 'has no percentage set');

      const codes = splitCodes(component.percentOfCode);
      if (!codes.length) throw configError(component, 'does not say what it is a percentage of');

      const base = codes.reduce((sum, code) => {
        const value = computed.get(code);
        if (value === undefined) {
          // Either the referenced component does not exist, or it comes LATER
          // in displayOrder. Both are configuration faults, and both would
          // otherwise silently charge a percentage of nothing.
          throw configError(
            component,
            `is a percentage of "${code}", which is not charged before it. Give it a lower display order, or correct the code.`
          );
        }
        return sum.plus(value);
      }, ZERO);

      raw = base.mul(rate).div(100);
      note = `${rate.toString()}% of ${codes.join(' + ')} (${base.toFixed(2)})`;
      break;
    }

    case 'FORMULA': {
      if (!component.expression) throw configError(component, 'has no formula');

      const scope = numericScope(context);
      try {
        raw = new D(evaluateExpression(component.expression, scope));
      } catch (err) {
        throw new FeeCalculationError(
          `Fee component "${component.code}" could not be calculated: ${err instanceof Error ? err.message : 'invalid formula'}`
        );
      }
      note = `Formula: ${component.expression}`;
      break;
    }

    default:
      throw configError(component, `uses an unknown calculation basis "${component.basis}"`);
  }

  const computedAmount = money(raw);
  const clamped = clamp(computedAmount, component.minAmount, component.maxAmount);

  if (clamped.hit === 'min') note += ` — raised to the minimum of ${new D(component.minAmount!).toFixed(2)}`;
  if (clamped.hit === 'max') note += ` — capped at the maximum of ${new D(component.maxAmount!).toFixed(2)}`;

  return {
    kind: 'COMPONENT',
    componentId: component.id ?? null,
    ruleId: null,
    code: component.code,
    name: component.name,
    headOfAccount: component.headOfAccount ?? '',
    basis: component.basis,
    variableName,
    variableValue,
    rateApplied: rate,
    computedAmount,
    amount: round(clamped.value, roundingRule),
    note,
    displayOrder: component.displayOrder,
  };
}

/**
 * Walks the slab bands ascending.
 *
 * CUMULATIVE by default — the first 100 m² at one rate, the next 200 at
 * another, the remainder at a third — which is how a graduated schedule
 * actually works. A band that sets `flatAmount` charges that instead of a rate
 * on its own portion, which is how "above 5,000 m²: ₹2,00,000" is expressed.
 *
 * A quantity that falls past the last closed band is charged only up to that
 * band. That is deliberate: silently extrapolating the top rate would invent a
 * charge the schedule does not state. An open-ended top band (`toValue: null`)
 * is how a schedule says "and everything above".
 */
function walkSlabs(component: ComponentSpec, quantity: number): { amount: Decimal; note: string } {
  const slabs = [...(component.slabs ?? [])].sort(
    (a, b) => a.fromValue - b.fromValue || a.displayOrder - b.displayOrder
  );

  if (!slabs.length) throw configError(component, 'is slab-based but has no slabs configured');

  let total = ZERO;
  const parts: string[] = [];

  for (const slab of slabs) {
    if (quantity <= slab.fromValue) break;

    const upper = slab.toValue ?? quantity;
    const banded = Math.min(quantity, upper) - slab.fromValue;
    if (banded <= 0) continue;

    if (slab.flatAmount !== null && slab.flatAmount !== undefined) {
      total = total.plus(slab.flatAmount);
      parts.push(`${formatQuantity(banded)} @ flat ${new D(slab.flatAmount).toFixed(2)}`);
      continue;
    }

    total = total.plus(new D(slab.rate).mul(banded));
    parts.push(`${formatQuantity(banded)} @ ${new D(slab.rate).toString()}`);
  }

  return { amount: total, note: parts.length ? parts.join(' + ') : 'Below the first slab.' };
}

// ── Rules ────────────────────────────────────────────────────────────────

function applyRules(
  rules: RuleSpec[],
  context: FeeContext,
  computed: Map<string, Decimal>,
  subtotal: Decimal,
  roundingRule: RoundingRule
): { adjustments: CalculatedLine[]; adjustmentTotal: Decimal; skippedRules: SkippedComponent[] } {
  const active = [...rules]
    .filter((r) => r.isActive !== false)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.code.localeCompare(b.code));

  const adjustments: CalculatedLine[] = [];
  const skippedRules: SkippedComponent[] = [];
  let adjustmentTotal = ZERO;

  for (const rule of active) {
    if (!isAlways(rule.condition) && !evaluateCondition(rule.condition, context)) {
      skippedRules.push({ code: rule.code, name: rule.name, reason: reasonFor(rule.condition) });
      continue;
    }

    const rate = rule.rate === null || rule.rate === undefined ? null : new D(rule.rate);
    if (!rate) throw new FeeCalculationError(`Fee rule "${rule.code}" has no rate set.`);

    let magnitude: Decimal;
    let note: string;

    if (rule.basis === 'FLAT') {
      magnitude = rate;
      note = rule.reason || 'Fixed adjustment.';
    } else {
      const codes = splitCodes(rule.appliesToCode);
      const base = codes.length
        ? codes.reduce((sum, code) => {
            const value = computed.get(code);
            if (value === undefined) {
              throw new FeeCalculationError(
                `Fee rule "${rule.code}" applies to "${code}", which is not a component of this structure.`
              );
            }
            return sum.plus(value);
          }, ZERO)
        : subtotal;

      magnitude = base.mul(rate).div(100);
      note = `${rate.toString()}% of ${codes.length ? codes.join(' + ') : 'the subtotal'} (${base.toFixed(2)})`;
      if (rule.reason) note += ` — ${rule.reason}`;
    }

    const clamped = clamp(money(magnitude), rule.minAmount, rule.maxAmount);
    let amount = round(clamped.value, roundingRule);

    // A rebate is stored NEGATIVE so that the demand reads as a list that sums
    // to its own total. "Subtotal 33,495 / Adjustments −3,349 / Total 30,146"
    // is checkable by eye; a positive rebate that is subtracted somewhere else
    // is not.
    if (rule.kind === 'REBATE') amount = amount.negated();

    // A rebate may take a demand to nothing. It may never take it below
    // nothing — that would be a refund entitlement, which is a different thing
    // with different accounting, and inventing one here would be wrong.
    const running = subtotal.plus(adjustmentTotal).plus(amount);
    if (running.isNegative()) {
      amount = subtotal.plus(adjustmentTotal).negated();
      note += ' — limited so the demand is not negative';
    }

    adjustmentTotal = adjustmentTotal.plus(amount);

    adjustments.push({
      kind: 'ADJUSTMENT',
      componentId: null,
      ruleId: rule.id ?? null,
      code: rule.code,
      name: rule.name,
      headOfAccount: '',
      basis: rule.basis,
      variableName: '',
      variableValue: null,
      rateApplied: rate,
      computedAmount: money(rule.kind === 'REBATE' ? magnitude.negated() : magnitude),
      amount,
      note,
      displayOrder: rule.displayOrder,
    });
  }

  return { adjustments, adjustmentTotal, skippedRules };
}

// ═══════════════════════════════════════════════════════════════════════════
// Arithmetic helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Money is always two decimal places, half-up. */
const money = (value: Decimal): Decimal => value.toDecimalPlaces(2, D.ROUND_HALF_UP);

export function round(value: Decimal, rule: RoundingRule): Decimal {
  switch (rule) {
    case 'NONE':
      return money(value);
    case 'NEAREST_1':
      return value.toDecimalPlaces(0, D.ROUND_HALF_UP);
    case 'NEAREST_10':
      return value.div(10).toDecimalPlaces(0, D.ROUND_HALF_UP).mul(10);
    case 'UP_10':
      // Rounds AWAY from zero, so a rebate of −41 becomes −50 rather than −40.
      // Rounding an adjustment towards zero would quietly shrink a concession
      // the department had granted.
      return value.isNegative()
        ? value.div(10).floor().mul(10)
        : value.div(10).ceil().mul(10);
    default:
      return money(value);
  }
}

function clamp(
  value: Decimal,
  min: number | null | undefined,
  max: number | null | undefined
): { value: Decimal; hit: 'min' | 'max' | null } {
  if (min !== null && min !== undefined && value.lessThan(min)) {
    return { value: new D(min), hit: 'min' };
  }
  if (max !== null && max !== undefined && value.greaterThan(max)) {
    return { value: new D(max), hit: 'max' };
  }
  return { value, hit: null };
}

function numericVariable(component: ComponentSpec, context: FeeContext, name: string): number {
  const value = Object.prototype.hasOwnProperty.call(context, name) ? context[name] : undefined;
  const numeric = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(numeric)) {
    throw new FeeCalculationError(
      `Fee component "${component.code}" is charged on "${name}", which this application does not have a number for.`
    );
  }
  if (numeric < 0) {
    throw new FeeCalculationError(
      `Fee component "${component.code}" is charged on "${name}", which is negative.`
    );
  }
  return numeric;
}

/** The numeric half of the context — the only thing a formula may see. */
function numericScope(context: FeeContext): Record<string, number> {
  const scope: Record<string, number> = {};
  for (const [key, value] of Object.entries(context)) {
    if (typeof value === 'number' && Number.isFinite(value)) scope[key] = value;
  }
  return scope;
}

const splitCodes = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean);

const configError = (component: ComponentSpec, problem: string) =>
  new FeeCalculationError(`Fee component "${component.code}" ${problem}.`);

/**
 * Why something did not apply.
 *
 * "Not applicable to this application" is true but useless. Describing the
 * condition means an applicant can see that the structural certificate charge
 * was skipped because the building has two floors, and an officer can see it
 * without opening the configuration.
 */
function reasonFor(condition: unknown): string {
  const described = describeCondition(condition);
  return described ? `Only charged when ${described}.` : 'Did not apply to this application.';
}

/** Areas print without trailing zeroes: 620, not 620.0000. */
const formatQuantity = (value: number): string => String(Number(value.toFixed(4)));
