/**
 * The FORMULA sandbox — docs/07-subsystems.md N.4.
 *
 * ── Why this file exists rather than a one-line `new Function(...)` ─────
 *
 * A fee formula is authored by an administrator through a web form and then
 * evaluated on the server against an applicant's data. That is user-supplied
 * code running on our machine: a genuine injection surface, and it is treated
 * as one. `eval`, `new Function`, `vm`, template literals and dynamic imports
 * are all absent by construction — the expression never becomes JavaScript at
 * any point. It is tokenised, parsed into a small tree, and that tree is walked.
 *
 * What the grammar permits, and nothing else:
 *
 *   numbers                      12   0.5   1e3
 *   variables                    the N.3 whitelist, nothing else
 *   arithmetic                   + - * / %   and unary minus
 *   comparison                   < <= > >= == !=      → 1 or 0
 *   functions                    min max round ceil floor
 *   grouping                     ( )
 *
 * What it cannot express, deliberately: property access, indexing, assignment,
 * function definition, strings, and any identifier that is not a declared
 * variable. There is no syntax for reaching anything outside the context, so
 * there is nothing to escape from.
 *
 * ── Validated at SAVE time ─────────────────────────────────────────────
 *
 * `validateExpression` is what the admin editor calls as the administrator
 * types. A formula that references an unknown variable, or is too long, or
 * does not parse, is refused THERE — by the person who wrote it, who can fix
 * it — rather than at the moment an applicant is waiting for a demand.
 */

import { NUMERIC_FEE_VARIABLES } from './fees';

/** Caps. A fee formula that needs more than this is a formula nobody can audit. */
export const MAX_EXPRESSION_LENGTH = 500;
export const MAX_EXPRESSION_NODES = 200;

const FUNCTIONS: Record<string, { arity: [number, number]; apply: (args: number[]) => number }> = {
  min: { arity: [1, 8], apply: (a) => Math.min(...a) },
  max: { arity: [1, 8], apply: (a) => Math.max(...a) },
  round: { arity: [1, 1], apply: (a) => Math.round(a[0]!) },
  ceil: { arity: [1, 1], apply: (a) => Math.ceil(a[0]!) },
  floor: { arity: [1, 1], apply: (a) => Math.floor(a[0]!) },
};

export class ExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExpressionError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Tokeniser
// ═══════════════════════════════════════════════════════════════════════════

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'name'; value: string }
  | { kind: 'op'; value: string }
  | { kind: 'paren'; value: '(' | ')' }
  | { kind: 'comma' };

const OPERATORS = ['<=', '>=', '==', '!=', '<', '>', '+', '-', '*', '/', '%'];

function tokenise(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const char = source[i]!;

    if (/\s/.test(char)) {
      i += 1;
      continue;
    }

    if (char === '(' || char === ')') {
      tokens.push({ kind: 'paren', value: char });
      i += 1;
      continue;
    }

    if (char === ',') {
      tokens.push({ kind: 'comma' });
      i += 1;
      continue;
    }

    // Numbers, including a decimal point and an exponent. The dot is only ever
    // part of a number — there is no member-access operator in this grammar,
    // which is what makes `context.constructor` unspellable.
    if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(source[i + 1] ?? ''))) {
      const match = /^[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?/.exec(source.slice(i));
      if (!match) throw new ExpressionError(`Could not read the number at position ${i + 1}.`);
      tokens.push({ kind: 'number', value: Number(match[0]) });
      i += match[0].length;
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(i))!;
      tokens.push({ kind: 'name', value: match[0] });
      i += match[0].length;
      continue;
    }

    const operator = OPERATORS.find((op) => source.startsWith(op, i));
    if (operator) {
      tokens.push({ kind: 'op', value: operator });
      i += operator.length;
      continue;
    }

    // Anything left is not part of the language. Naming the character is what
    // lets an administrator see they typed `&&` or a smart quote.
    throw new ExpressionError(`"${char}" is not allowed in a fee formula (position ${i + 1}).`);
  }

  return tokens;
}

// ═══════════════════════════════════════════════════════════════════════════
// Parser — precedence climbing
// ═══════════════════════════════════════════════════════════════════════════

type Node =
  | { type: 'number'; value: number }
  | { type: 'variable'; name: string }
  | { type: 'unary'; operator: '-'; operand: Node }
  | { type: 'binary'; operator: string; left: Node; right: Node }
  | { type: 'call'; name: string; args: Node[] };

/** Higher binds tighter. Comparison is loosest, so `a * 2 > b` parses as `(a*2) > b`. */
const PRECEDENCE: Record<string, number> = {
  '<': 1, '<=': 1, '>': 1, '>=': 1, '==': 1, '!=': 1,
  '+': 2, '-': 2,
  '*': 3, '/': 3, '%': 3,
};

class Parser {
  private position = 0;
  private nodes = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): Node {
    const node = this.parseExpression(0);
    if (this.position < this.tokens.length) {
      throw new ExpressionError('There is something after the end of the formula.');
    }
    return node;
  }

  private count() {
    this.nodes += 1;
    if (this.nodes > MAX_EXPRESSION_NODES) {
      throw new ExpressionError(
        `That formula is too complex (over ${MAX_EXPRESSION_NODES} terms). Split it into separate components.`
      );
    }
  }

  private peek(): Token | undefined {
    return this.tokens[this.position];
  }

  private parseExpression(minPrecedence: number): Node {
    let left = this.parseUnary();

    for (;;) {
      const token = this.peek();
      if (!token || token.kind !== 'op') break;

      const precedence = PRECEDENCE[token.value];
      if (precedence === undefined || precedence < minPrecedence) break;

      this.position += 1;
      // Every operator here is left-associative, so the right-hand side binds
      // only tighter operators: 10 - 3 - 2 is (10-3)-2, not 10-(3-2).
      const right = this.parseExpression(precedence + 1);
      this.count();
      left = { type: 'binary', operator: token.value, left, right };
    }

    return left;
  }

  private parseUnary(): Node {
    const token = this.peek();

    if (token?.kind === 'op' && (token.value === '-' || token.value === '+')) {
      this.position += 1;
      const operand = this.parseUnary();
      this.count();
      return token.value === '-' ? { type: 'unary', operator: '-', operand } : operand;
    }

    return this.parsePrimary();
  }

  private parsePrimary(): Node {
    const token = this.peek();
    if (!token) throw new ExpressionError('The formula ends unexpectedly.');

    if (token.kind === 'number') {
      this.position += 1;
      this.count();
      return { type: 'number', value: token.value };
    }

    if (token.kind === 'paren' && token.value === '(') {
      this.position += 1;
      const inner = this.parseExpression(0);
      this.expectClose();
      return inner;
    }

    if (token.kind === 'name') {
      this.position += 1;
      const next = this.peek();

      if (next?.kind === 'paren' && next.value === '(') {
        this.position += 1;
        const args = this.parseArguments();
        this.count();
        return { type: 'call', name: token.value, args };
      }

      this.count();
      return { type: 'variable', name: token.value };
    }

    throw new ExpressionError('The formula is not valid here.');
  }

  private parseArguments(): Node[] {
    const args: Node[] = [];
    const next = this.peek();

    if (next?.kind === 'paren' && next.value === ')') {
      this.position += 1;
      return args;
    }

    for (;;) {
      args.push(this.parseExpression(0));
      const token = this.peek();

      if (token?.kind === 'comma') {
        this.position += 1;
        continue;
      }
      this.expectClose();
      return args;
    }
  }

  private expectClose() {
    const token = this.peek();
    if (!token || token.kind !== 'paren' || token.value !== ')') {
      throw new ExpressionError('A bracket is not closed in the formula.');
    }
    this.position += 1;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Public surface
// ═══════════════════════════════════════════════════════════════════════════

export type ExpressionScope = Record<string, number>;

function compile(source: string): Node {
  if (typeof source !== 'string' || !source.trim()) {
    throw new ExpressionError('The formula is empty.');
  }
  if (source.length > MAX_EXPRESSION_LENGTH) {
    throw new ExpressionError(
      `That formula is longer than ${MAX_EXPRESSION_LENGTH} characters. Split it into separate components.`
    );
  }
  return new Parser(tokenise(source)).parse();
}

/** Every variable a formula reads. Used by validation and by the admin editor. */
export function variablesUsed(source: string): string[] {
  const found = new Set<string>();
  walk(compile(source), (node) => {
    if (node.type === 'variable') found.add(node.name);
  });
  return [...found];
}

function walk(node: Node, visit: (node: Node) => void): void {
  visit(node);
  if (node.type === 'unary') walk(node.operand, visit);
  else if (node.type === 'binary') {
    walk(node.left, visit);
    walk(node.right, visit);
  } else if (node.type === 'call') node.args.forEach((arg) => walk(arg, visit));
}

/**
 * Checks a formula WITHOUT evaluating it. What the admin editor calls on every
 * keystroke, and what the seed and the structure importer call before writing.
 */
export function validateExpression(
  source: string,
  allowed: readonly string[] = NUMERIC_FEE_VARIABLES
): { ok: true; variables: string[] } | { ok: false; error: string } {
  let tree: Node;
  try {
    tree = compile(source);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'That formula is not valid.' };
  }

  const variables = new Set<string>();
  let error: string | null = null;

  walk(tree, (node) => {
    if (node.type === 'variable') {
      variables.add(node.name);
      if (!allowed.includes(node.name)) {
        error ??= `"${node.name}" is not a fee variable. Available: ${allowed.join(', ')}.`;
      }
    }
    if (node.type === 'call') {
      const fn = FUNCTIONS[node.name];
      if (!fn) {
        error ??= `"${node.name}" is not a function a fee formula may use. Available: ${Object.keys(FUNCTIONS).join(', ')}.`;
        return;
      }
      const [minArity, maxArity] = fn.arity;
      if (node.args.length < minArity || node.args.length > maxArity) {
        error ??= `${node.name}() takes ${minArity === maxArity ? minArity : `${minArity} to ${maxArity}`} argument(s), not ${node.args.length}.`;
      }
    }
  });

  if (error) return { ok: false, error };
  return { ok: true, variables: [...variables] };
}

/**
 * Evaluates a formula against a fixed scope.
 *
 * The scope IS the whole world the expression can see — there is no fallback
 * to a global, so an unknown name is an error rather than `undefined`
 * propagating silently into a demand as NaN.
 */
export function evaluateExpression(source: string, scope: ExpressionScope): number {
  const result = evaluateNode(compile(source), scope);

  if (!Number.isFinite(result)) {
    throw new ExpressionError('That formula did not produce a usable number.');
  }
  return result;
}

function evaluateNode(node: Node, scope: ExpressionScope): number {
  switch (node.type) {
    case 'number':
      return node.value;

    case 'variable': {
      const value = Object.prototype.hasOwnProperty.call(scope, node.name)
        ? scope[node.name]
        : undefined;

      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new ExpressionError(`"${node.name}" is not a fee variable with a numeric value.`);
      }
      return value;
    }

    case 'unary':
      return -evaluateNode(node.operand, scope);

    case 'binary': {
      const left = evaluateNode(node.left, scope);
      const right = evaluateNode(node.right, scope);

      switch (node.operator) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/':
          // Infinity would travel silently into a demand. A fee that cannot be
          // computed must say so.
          if (right === 0) throw new ExpressionError('That formula divides by zero.');
          return left / right;
        case '%':
          if (right === 0) throw new ExpressionError('That formula divides by zero.');
          return left % right;
        // Comparisons yield 1 or 0, which is what makes
        // `plotAreaSqm * (numFloors >= 4)` a usable way to write a conditional
        // charge without the grammar needing an if.
        case '<': return left < right ? 1 : 0;
        case '<=': return left <= right ? 1 : 0;
        case '>': return left > right ? 1 : 0;
        case '>=': return left >= right ? 1 : 0;
        case '==': return left === right ? 1 : 0;
        case '!=': return left !== right ? 1 : 0;
        default:
          throw new ExpressionError(`"${node.operator}" is not an operator a fee formula may use.`);
      }
    }

    case 'call': {
      const fn = FUNCTIONS[node.name];
      if (!fn) {
        throw new ExpressionError(`"${node.name}" is not a function a fee formula may use.`);
      }
      const [minArity, maxArity] = fn.arity;
      if (node.args.length < minArity || node.args.length > maxArity) {
        throw new ExpressionError(`${node.name}() was given ${node.args.length} argument(s).`);
      }
      return fn.apply(node.args.map((arg) => evaluateNode(arg, scope)));
    }
  }
}
