/**
 * The JSON condition language — docs/07-subsystems.md P.2.
 *
 * One evaluator, used by three things that must agree: which documents a
 * particular application requires, which fee components it is charged, and
 * which rebates or surcharges apply to it. Three separate implementations of
 * "does this rule apply?" is three chances for the checklist to disagree with
 * the demand raised against it.
 *
 * ── The language ───────────────────────────────────────────────────────
 *
 *   {}                                   always true
 *   { "gte": ["building.numFloors", 4] } floors ≥ 4
 *   { "eq": ["building.buildingUse", "APARTMENT"] }
 *   { "in": ["property.landUseZone", ["RESIDENTIAL", "MIXED"]] }
 *   { "between": ["plotAreaSqm", 100, 500] }
 *   { "and": [ {...}, {...} ] }   { "or": [...] }   { "not": {...} }
 *
 * ── Why the first operand is always a path ─────────────────────────────
 *
 * `["building.buildingUse", "APARTMENT"]` has to mean "the building use equals
 * the literal APARTMENT", not "the building use equals whatever is at the path
 * APARTMENT". Guessing — treat a string as a path if it happens to resolve —
 * would make a rule's meaning depend on the shape of the context it is
 * evaluated against, so a typo in a path would silently become a literal and
 * the rule would quietly stop matching. Instead the position decides: operand
 * ONE is a path, the rest are literals. `{ "var": "…" }` and
 * `{ "value": … }` are available on either side when a rule genuinely needs to
 * compare two paths or to put a literal first.
 *
 * ── Unknown paths ──────────────────────────────────────────────────────
 *
 * A path that resolves to nothing yields `undefined`, and every comparison
 * against `undefined` is FALSE. A requirement whose condition cannot be
 * evaluated does not apply — which is the safe direction for a document rule
 * (it is not demanded) and for a fee rule (it is not charged). `isMandatory`
 * and the mandatory-document gate are what make sure that safety does not turn
 * into a missing statutory document.
 */

export type ConditionContext = Record<string, unknown>;

export type ConditionResult = {
  matched: boolean;
  /** Empty when the condition is `{}` — "always". */
  description: string;
};

const COMPARATORS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'nin', 'between', 'contains'] as const;
const LOGICAL = ['and', 'or', 'not'] as const;
const PRESENCE = ['exists', 'empty'] as const;

export const CONDITION_OPERATORS: readonly string[] = [...COMPARATORS, ...LOGICAL, ...PRESENCE];

/** True when a condition is absent, empty, or `{}` — i.e. "always applies". */
export function isAlways(condition: unknown): boolean {
  if (condition === null || condition === undefined) return true;
  if (typeof condition !== 'object') return true;
  return Object.keys(condition as object).length === 0;
}

export function evaluateCondition(condition: unknown, context: ConditionContext): boolean {
  if (isAlways(condition)) return true;

  const node = condition as Record<string, unknown>;
  const keys = Object.keys(node);

  // A condition object carries exactly one operator. Several would need a
  // combining rule ("and"? "or"?) that nobody reading the JSON could infer, so
  // it is refused rather than guessed at.
  if (keys.length !== 1) {
    throw new ConditionError(
      `A condition must have exactly one operator, found ${keys.length}: ${keys.join(', ')}.`
    );
  }

  const operator = keys[0]!;
  const operand = node[operator];

  switch (operator) {
    case 'and':
      return asArray(operator, operand).every((c) => evaluateCondition(c, context));
    case 'or':
      return asArray(operator, operand).some((c) => evaluateCondition(c, context));
    case 'not':
      return !evaluateCondition(operand, context);
    default:
      return compare(operator, asArray(operator, operand), context);
  }
}

/**
 * As above, but never throws: a malformed condition returns false and its
 * reason, so ONE broken rule cannot take down the whole checklist for every
 * applicant. The reason is surfaced to administrators, not to applicants.
 */
export function tryEvaluate(
  condition: unknown,
  context: ConditionContext
): { matched: boolean; error: string | null } {
  try {
    return { matched: evaluateCondition(condition, context), error: null };
  } catch (err) {
    return { matched: false, error: err instanceof Error ? err.message : 'Invalid condition.' };
  }
}

export class ConditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConditionError';
  }
}

// ── Comparison ───────────────────────────────────────────────────────────

function compare(operator: string, args: unknown[], context: ConditionContext): boolean {
  if (!args.length) throw new ConditionError(`"${operator}" needs at least one operand.`);

  const left = resolveOperand(args[0], context, true);

  switch (operator) {
    case 'exists':
      return left !== undefined && left !== null && left !== '';
    case 'empty':
      return left === undefined || left === null || left === '';
    case 'between': {
      const low = toNumber(resolveOperand(args[1], context, false));
      const high = toNumber(resolveOperand(args[2], context, false));
      const value = toNumber(left);
      if (value === null || low === null || high === null) return false;
      return value >= low && value <= high;
    }
    case 'in':
    case 'nin': {
      const list = resolveOperand(args[1], context, false);
      const values = Array.isArray(list) ? list : [list];
      const hit = values.some((v) => looseEquals(left, v));
      return operator === 'in' ? hit : !hit;
    }
    case 'contains': {
      const needle = resolveOperand(args[1], context, false);
      if (Array.isArray(left)) return left.some((v) => looseEquals(v, needle));
      if (typeof left === 'string' && typeof needle === 'string') {
        return left.toLowerCase().includes(needle.toLowerCase());
      }
      return false;
    }
    default: {
      const right = resolveOperand(args[1], context, false);

      if (operator === 'eq') return looseEquals(left, right);
      if (operator === 'ne') return !looseEquals(left, right);

      // Ordering comparisons are numeric only. Comparing "APARTMENT" > "SHOP"
      // would silently succeed as a string comparison and mean nothing.
      const a = toNumber(left);
      const b = toNumber(right);
      if (a === null || b === null) return false;

      switch (operator) {
        case 'gt':
          return a > b;
        case 'gte':
          return a >= b;
        case 'lt':
          return a < b;
        case 'lte':
          return a <= b;
        default:
          throw new ConditionError(`Unknown condition operator "${operator}".`);
      }
    }
  }
}

/**
 * Operand one is a PATH; the rest are literals — unless wrapped.
 *
 * `{ "var": "building.numFloors" }` forces a path anywhere,
 * `{ "value": "APARTMENT" }` forces a literal anywhere.
 */
function resolveOperand(operand: unknown, context: ConditionContext, isFirst: boolean): unknown {
  if (operand && typeof operand === 'object' && !Array.isArray(operand)) {
    const wrapper = operand as Record<string, unknown>;
    if ('var' in wrapper) return resolvePath(String(wrapper.var), context);
    if ('value' in wrapper) return wrapper.value;
  }

  if (isFirst && typeof operand === 'string') return resolvePath(operand, context);
  return operand;
}

/** Dotted path lookup. Never touches prototypes — own properties only. */
export function resolvePath(path: string, context: ConditionContext): unknown {
  let current: unknown = context;

  for (const segment of path.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

/**
 * Equality that treats 4 and "4" as equal, and is case-insensitive for the
 * code-like strings this language actually compares.
 *
 * Both are deliberate. Values reach the context from three places — form
 * input, master data and JSON configuration — and an administrator typing
 * `residential` rather than `RESIDENTIAL` into a rule should not produce a
 * requirement that never fires and that nobody can see is broken.
 */
function looseEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false;

  if (typeof a === 'boolean' || typeof b === 'boolean') return Boolean(a) === Boolean(b);

  const na = toNumber(a);
  const nb = toNumber(b);
  if (na !== null && nb !== null) return na === nb;

  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asArray(operator: string, operand: unknown): unknown[] {
  if (Array.isArray(operand)) return operand;
  // `{ "not": {...} }` and `{ "exists": "path" }` take a bare operand.
  return [operand];
}

// ── Validation ───────────────────────────────────────────────────────────

export type ConditionProblem = { path: string; message: string };

/**
 * Checks a condition's SHAPE, with no data to evaluate it against.
 *
 * This is the check that has to happen when an administrator SAVES a rule,
 * and the reason is asymmetric: `resolveRequirements` treats a condition it
 * cannot evaluate as not applying, so a malformed rule fails silently — the
 * document is simply never asked for, no error reaches anybody, and the
 * omission surfaces months later as a file that went to an officer without a
 * certificate it needed. One bad rule must not take the checklist down for
 * every applicant, so the evaluator is right to be forgiving; the save path is
 * where the strictness belongs.
 *
 * Returns every problem it finds rather than the first, so a form can mark all
 * of them at once.
 */
export function validateCondition(condition: unknown, path = 'condition'): ConditionProblem[] {
  if (isAlways(condition)) {
    // `{}`, null and undefined all mean "always applies", which is valid.
    // A non-object scalar is not: `"numFloors"` is almost certainly a
    // half-written rule, and isAlways() would wave it through as "always".
    if (condition !== null && condition !== undefined && typeof condition !== 'object') {
      return [{ path, message: 'A condition must be an object, such as { "gte": ["building.numFloors", 4] }.' }];
    }
    return [];
  }

  if (Array.isArray(condition)) {
    return [{ path, message: 'A condition is an object, not a list.' }];
  }

  const node = condition as Record<string, unknown>;
  const keys = Object.keys(node);

  if (keys.length !== 1) {
    return [
      {
        path,
        message: `A condition carries exactly one operator, found ${keys.length}${keys.length ? `: ${keys.join(', ')}` : ''}. Combine them with "and" or "or".`,
      },
    ];
  }

  const operator = keys[0]!;
  const operand = node[operator];

  if (!CONDITION_OPERATORS.includes(operator)) {
    return [
      {
        path,
        message: `"${operator}" is not a condition operator. Use one of: ${CONDITION_OPERATORS.join(', ')}.`,
      },
    ];
  }

  if (operator === 'and' || operator === 'or') {
    if (!Array.isArray(operand) || operand.length === 0) {
      return [{ path: `${path}.${operator}`, message: `"${operator}" takes a non-empty list of conditions.` }];
    }
    return operand.flatMap((child, i) => validateCondition(child, `${path}.${operator}[${i}]`));
  }

  if (operator === 'not') {
    return validateCondition(operand, `${path}.not`);
  }

  const args = Array.isArray(operand) ? operand : [operand];
  const problems: ConditionProblem[] = [];

  const expected = ARITY[operator] ?? 2;
  if (args.length !== expected) {
    problems.push({
      path: `${path}.${operator}`,
      message: `"${operator}" takes ${expected} operand${expected === 1 ? '' : 's'}, found ${args.length}.`,
    });
  }

  // Operand one is always a path — that is what makes a rule's meaning
  // independent of the data it is evaluated against. A number or a boolean
  // there is a rule written back to front.
  const first = args[0];
  const isPath =
    typeof first === 'string' ||
    (first !== null && typeof first === 'object' && !Array.isArray(first) && 'var' in (first as object));

  if (!isPath) {
    problems.push({
      path: `${path}.${operator}[0]`,
      message: 'The first operand is the field being tested, written as a path such as "building.numFloors".',
    });
  } else if (typeof first === 'string' && first.trim() === '') {
    problems.push({ path: `${path}.${operator}[0]`, message: 'The field path is empty.' });
  }

  if (operator === 'between') {
    for (const i of [1, 2]) {
      if (args.length > i && typeof args[i] !== 'number') {
        problems.push({ path: `${path}.between[${i}]`, message: '"between" takes two numbers.' });
      }
    }
  }

  return problems;
}

/** How many operands each non-logical operator takes. */
const ARITY: Record<string, number> = {
  exists: 1,
  empty: 1,
  between: 3,
};

/** Convenience for a save path: the first problem, as a sentence. */
export function conditionError(condition: unknown): string | null {
  const problems = validateCondition(condition);
  return problems.length ? problems[0]!.message : null;
}

// ── Explanation ──────────────────────────────────────────────────────────

const OPERATOR_WORDS: Record<string, string> = {
  eq: 'is',
  ne: 'is not',
  gt: 'is more than',
  gte: 'is at least',
  lt: 'is less than',
  lte: 'is at most',
  in: 'is one of',
  nin: 'is not one of',
  contains: 'contains',
  exists: 'is given',
  empty: 'is not given',
};

/**
 * A condition, in a sentence.
 *
 * The checklist shows this next to a conditionally-required document, so an
 * applicant asked for a structural certificate can read WHY it is being asked
 * for — "required because the building has at least 4 floors" — rather than
 * finding an unexplained extra row and telephoning the office about it.
 *
 * `labels` maps a path to the words a person uses for it.
 */
export function describeCondition(
  condition: unknown,
  labels: Record<string, string> = {}
): string {
  if (isAlways(condition)) return '';

  try {
    return describe(condition, labels);
  } catch {
    // An unexplainable condition is not worth failing a page render over.
    return '';
  }
}

function describe(condition: unknown, labels: Record<string, string>): string {
  const node = condition as Record<string, unknown>;
  const keys = Object.keys(node);

  // Same structural rules as the evaluator. Without these a malformed
  // condition would be DESCRIBED — as "x nonsense nothing" — and shown to an
  // applicant as the reason a document is being demanded of them. Throwing
  // here means describeCondition's catch returns an empty string instead, and
  // the row simply carries no explanation.
  if (keys.length !== 1) throw new ConditionError('A condition must have exactly one operator.');

  const operator = keys[0]!;
  if (!CONDITION_OPERATORS.includes(operator)) {
    throw new ConditionError(`Unknown condition operator "${operator}".`);
  }

  const operand = node[operator];

  if (operator === 'and' || operator === 'or') {
    const parts = asArray(operator, operand).map((c) => describe(c, labels));
    const joiner = operator === 'and' ? ' and ' : ' or ';
    return parts.filter(Boolean).join(joiner);
  }

  if (operator === 'not') return `not ${describe(operand, labels)}`;

  const args = asArray(operator, operand);
  const subject = pathLabel(args[0], labels);

  if (operator === 'between') {
    return `${subject} is between ${literal(args[1])} and ${literal(args[2])}`;
  }
  if (operator === 'exists' || operator === 'empty') {
    return `${subject} ${OPERATOR_WORDS[operator]}`;
  }
  if (operator === 'in' || operator === 'nin') {
    const list = Array.isArray(args[1]) ? args[1] : [args[1]];
    return `${subject} ${OPERATOR_WORDS[operator]} ${list.map(literal).join(', ')}`;
  }

  return `${subject} ${OPERATOR_WORDS[operator] ?? operator} ${literal(args[1])}`;
}

function pathLabel(operand: unknown, labels: Record<string, string>): string {
  const path =
    operand && typeof operand === 'object' && 'var' in (operand as object)
      ? String((operand as Record<string, unknown>).var)
      : String(operand);

  if (labels[path]) return labels[path]!;

  // "building.numFloors" → "num floors" is poor; "the number of floors" is not
  // derivable. The leaf, spaced out, is the honest middle: readable, and
  // obviously the raw name so nobody mistakes it for prose written for them.
  const leaf = path.split('.').pop() ?? path;
  return leaf.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
}

function literal(value: unknown): string {
  if (value === null || value === undefined) return 'nothing';
  if (value && typeof value === 'object' && 'value' in (value as object)) {
    return literal((value as Record<string, unknown>).value);
  }
  if (typeof value === 'string') return value.replace(/_/g, ' ').toLowerCase();
  return String(value);
}
