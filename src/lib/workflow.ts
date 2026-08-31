/**
 * Shared workflow vocabulary. Isomorphic — the seed, the engine, the API and
 * the officer's screens all read these names from here.
 *
 * ── What is NOT in this file ─────────────────────────────────────────────
 *
 * No routing. Not one line here says which stage follows which, which role may
 * act, or what an action does to an application. That lives entirely in
 * `workflow_transitions` rows, and `src/server/workflow/engine.ts` is the only
 * code that reads them.
 *
 * The distinction matters because it is the whole design: this file is the
 * ALPHABET (the codes that may appear in a row, and how each one is spelled
 * for a human), and the database holds the SENTENCES. Adding "the Additional
 * Commissioner may now report a shortfall and forward" is a row. Adding a
 * genuinely new *kind* of action — one the engine must reason about
 * differently — is the only change that touches code.
 */

// ── Action codes ─────────────────────────────────────────────────────────
//
// The catalogue of `workflow_actions.code`. Seeded by 09-workflow.ts; a stage
// acquires one by having a transition row that references it.

export const ACTIONS = {
  /** System-raised when the last demand is settled. Starts the department run. */
  CONFIRM_PAYMENT: 'CONFIRM_PAYMENT',

  FORWARD: 'FORWARD',
  RETURN_TO_PREVIOUS: 'RETURN_TO_PREVIOUS',

  RAISE_DOCUMENT_SHORTFALL: 'RAISE_DOCUMENT_SHORTFALL',
  RAISE_FEE_SHORTFALL: 'RAISE_FEE_SHORTFALL',
  RAISE_TECHNICAL_SHORTFALL: 'RAISE_TECHNICAL_SHORTFALL',
  RAISE_CLARIFICATION: 'RAISE_CLARIFICATION',

  /** Records the shortfall and advances anyway. Two rows, not one flag. */
  REPORT_SHORTFALL_AND_FORWARD: 'REPORT_SHORTFALL_AND_FORWARD',
  REPORT_FEE_SHORTFALL_AND_FORWARD: 'REPORT_FEE_SHORTFALL_AND_FORWARD',

  RESUBMIT: 'RESUBMIT',
  ACCEPT_RESOLUTION: 'ACCEPT_RESOLUTION',
  REJECT_RESOLUTION: 'REJECT_RESOLUTION',
  /**
   * Closes a shortfall that was REPORTED and travelled with the file.
   *
   * A reported shortfall never parks the application, so there is no parked
   * stage to return to and no RESUBMIT to answer it — the applicant settles it
   * by paying the demand or supplying the document, and the officer holding
   * the file at that moment records that it is settled. Without this action a
   * reported shortfall could never be closed, and since an open one blocks
   * approval absolutely, the file could never be approved either.
   */
  RESOLVE_REPORTED_SHORTFALL: 'RESOLVE_REPORTED_SHORTFALL',

  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
} as const;

export type ActionCode = (typeof ACTIONS)[keyof typeof ACTIONS];

/**
 * The actions that raise a shortfall, and what shape it takes.
 *
 * Read by the UI to decide whether the action modal needs the shortfall
 * fields, and by nothing else — the engine learns the same thing from the
 * transition's `effects`, which is authoritative.
 */
export const SHORTFALL_ACTIONS: Record<string, { kind: string; mode: string }> = {
  [ACTIONS.RAISE_DOCUMENT_SHORTFALL]: { kind: 'DOCUMENT', mode: 'BLOCKING' },
  [ACTIONS.RAISE_FEE_SHORTFALL]: { kind: 'FEE', mode: 'BLOCKING' },
  [ACTIONS.RAISE_TECHNICAL_SHORTFALL]: { kind: 'TECHNICAL', mode: 'BLOCKING' },
  [ACTIONS.RAISE_CLARIFICATION]: { kind: 'CLARIFICATION', mode: 'BLOCKING' },
  [ACTIONS.REPORT_SHORTFALL_AND_FORWARD]: { kind: 'DOCUMENT', mode: 'REPORTED' },
  [ACTIONS.REPORT_FEE_SHORTFALL_AND_FORWARD]: { kind: 'FEE', mode: 'REPORTED' },
};

// ── Guards ───────────────────────────────────────────────────────────────
//
// Every name a `workflow_transitions.guards` array may contain. The engine
// refuses to evaluate a transition naming a guard it does not implement — a
// typo in configuration must fail loudly, never silently permit.

export const GUARDS = {
  DRAWING_UPLOADED: 'drawing_uploaded',
  SCRUTINY_PASSED: 'scrutiny_passed',
  DOCUMENTS_COMPLETE: 'documents_complete',
  FEE_DEMAND_ISSUED: 'fee_demand_issued',
  FEES_PAID: 'fees_paid',
  NO_OPEN_BLOCKING_SHORTFALLS: 'no_open_blocking_shortfalls',
  NO_OPEN_SHORTFALLS: 'no_open_shortfalls',
  HAS_REMARKS: 'has_remarks',
  HAS_ATTACHMENT: 'has_attachment',
  SHORTFALL_AWAITING_REVIEW: 'shortfall_awaiting_review',
  REPORTED_SHORTFALL_OPEN: 'reported_shortfall_open',
  SLA_NOT_OVERDUE: 'sla_not_overdue',
} as const;

export type GuardName = (typeof GUARDS)[keyof typeof GUARDS];

// ── Effects ──────────────────────────────────────────────────────────────

export const EFFECTS = {
  RAISE_SHORTFALL: 'RAISE_SHORTFALL',
  RECORD_RESOLUTION: 'RECORD_RESOLUTION',
  RESOLVE_SHORTFALL: 'RESOLVE_SHORTFALL',
  REJECT_RESOLUTION: 'REJECT_RESOLUTION',
  GENERATE_FEE_DEMAND: 'GENERATE_FEE_DEMAND',
  RETURN_TO_ORIGIN: 'RETURN_TO_ORIGIN',
  GENERATE_APPROVAL_ORDER: 'GENERATE_APPROVAL_ORDER',
  CLOSE_WORKFLOW: 'CLOSE_WORKFLOW',
} as const;

export type EffectType = (typeof EFFECTS)[keyof typeof EFFECTS];

/** One entry of a transition's ordered `effects` array. */
export type EffectSpec = { type: EffectType | string } & Record<string, unknown>;

// ── SLA clock control ────────────────────────────────────────────────────

export const SLA_BEHAVIOURS = ['START', 'PAUSE', 'RESUME', 'STOP', 'NONE'] as const;
export type SlaBehaviour = (typeof SLA_BEHAVIOURS)[number];

// ── Display ──────────────────────────────────────────────────────────────

/**
 * Short stage labels for columns and badges.
 *
 * Unknown codes fall back to a title-cased version of the code itself, so a
 * stage added by an administrator renders as something readable rather than
 * as a blank cell.
 */
export const STAGE_LABELS: Record<string, string> = {
  LTP_DRAFT: 'Filing',
  LTP_DRAWING: 'Drawing',
  LTP_DOCUMENTS: 'Documents',
  LTP_PAYMENT: 'Payment',
  TPA_REVIEW: 'TPA',
  ZAD_ZDD_REVIEW: 'ZAD/ZDD',
  ZJD_REVIEW: 'ZJD',
  DIRECTOR_DP_REVIEW: 'Director',
  ADDL_COMMISSIONER_REVIEW: 'Addl Commissioner',
  COMMISSIONER_REVIEW: 'Commissioner',
  LTP_SHORTFALL_ACTION: 'With applicant',
  CLOSED_APPROVED: 'Approved',
  CLOSED_REJECTED: 'Rejected',
};

/** The officer inbox's filters. Each is a saved question, not a free search. */
export const TASK_FILTERS = {
  ALL: 'all',
  NEW: 'new',
  PENDING: 'pending',
  DUE_SOON: 'due-soon',
  OVERDUE: 'overdue',
  SHORTFALL: 'shortfall',
} as const;

export type TaskFilter = (typeof TASK_FILTERS)[keyof typeof TASK_FILTERS];

export const TASK_FILTER_META: Array<{ key: TaskFilter; label: string; description: string }> = [
  { key: TASK_FILTERS.ALL, label: 'All', description: 'Every file at your desk.' },
  { key: TASK_FILTERS.NEW, label: 'New', description: 'Arrived and not yet opened by anyone.' },
  { key: TASK_FILTERS.PENDING, label: 'In progress', description: 'Claimed and being worked.' },
  { key: TASK_FILTERS.DUE_SOON, label: 'Due soon', description: 'Approaching the service standard.' },
  { key: TASK_FILTERS.OVERDUE, label: 'Overdue', description: 'Past the service standard.' },
  {
    key: TASK_FILTERS.SHORTFALL,
    label: 'Shortfall',
    description: 'Carrying an open shortfall, raised here or travelling with the file.',
  },
];

export const isTaskFilter = (value: string): value is TaskFilter =>
  TASK_FILTER_META.some((f) => f.key === value);

/**
 * Priority as a word. Stamped on the task by the assignment rule that routed
 * it; 0 is the ordinary case and is deliberately called "Normal" rather than
 * left blank, so a column of priorities never has holes in it.
 */
export function priorityLabel(priority: number): { label: string; tone: 'neutral' | 'warning' | 'danger' } {
  if (priority >= 20) return { label: 'Urgent', tone: 'danger' };
  if (priority >= 10) return { label: 'High', tone: 'warning' };
  return { label: 'Normal', tone: 'neutral' };
}

/** Whole days between two instants, floored — "3 days pending", never "3.4". */
export function daysBetween(from: Date | string, to: Date | string = new Date()): number {
  const a = typeof from === 'string' ? new Date(from) : from;
  const b = typeof to === 'string' ? new Date(to) : to;
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 86_400_000));
}

/**
 * How an SLA reads on a row: "2 days left", "Due today", "3 days over".
 *
 * OVERDUE is worded as elapsed time rather than as a breach, because passing
 * the date has no legal effect in this system (docs/07-subsystems.md R.1.1).
 * The row says what is true; it does not accuse anybody.
 */
export function slaLabel(dueAt: Date | string | null | undefined, now: Date = new Date()): string {
  if (!dueAt) return '—';
  const due = typeof dueAt === 'string' ? new Date(dueAt) : dueAt;
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / 86_400_000);

  if (diffDays > 1) return `${diffDays} days left`;
  if (diffDays === 1) return 'Due tomorrow';
  if (diffDays === 0) return 'Due today';
  const over = Math.abs(diffDays);
  return over === 1 ? '1 day over' : `${over} days over`;
}

export function stageName(code: string | null | undefined): string {
  if (!code) return '—';
  return (
    STAGE_LABELS[code] ??
    code
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/^./, (c) => c.toUpperCase())
  );
}
