/**
 * The shortfall vocabulary and its state machine. Isomorphic — the engine, the
 * API, the officer's screens and the applicant's all read it from here.
 *
 * ── Why the machine lives in `src/lib` ───────────────────────────────────
 *
 * Because both sides need it and they must not disagree. The server refuses an
 * illegal transition; the client uses the same table to decide which buttons
 * exist. Two copies of a state machine is two state machines, and the second
 * one is always the one that is wrong.
 */

// ── Kinds ────────────────────────────────────────────────────────────────

export const SHORTFALL_KINDS = {
  DOCUMENT: 'DOCUMENT',
  FEE: 'FEE',
  TECHNICAL: 'TECHNICAL',
  CLARIFICATION: 'CLARIFICATION',
  OTHER: 'OTHER',
} as const;

export type ShortfallKind = (typeof SHORTFALL_KINDS)[keyof typeof SHORTFALL_KINDS];

export const KIND_META: Record<
  string,
  { label: string; noun: string; /** What the applicant has to produce. */ asks: string }
> = {
  DOCUMENT: {
    label: 'Document',
    noun: 'document shortfall',
    asks: 'Upload the documents listed below.',
  },
  FEE: {
    label: 'Fee',
    noun: 'fee shortfall',
    asks: 'Pay the additional demand, then submit your response.',
  },
  TECHNICAL: {
    label: 'Technical',
    noun: 'technical shortfall',
    asks: 'Upload a corrected drawing, then submit your response.',
  },
  CLARIFICATION: {
    label: 'Clarification',
    noun: 'request for clarification',
    asks: 'Answer in writing below.',
  },
  OTHER: {
    label: 'Other',
    noun: 'shortfall',
    asks: 'Respond below, attaching anything the officer has asked for.',
  },
};

export const kindLabel = (kind: string): string => KIND_META[kind]?.label ?? kind;

// ── Statuses ─────────────────────────────────────────────────────────────

export const SHORTFALL_STATUS = {
  RAISED: 'RAISED',
  NOTIFIED: 'NOTIFIED',
  ACTION_REQUIRED: 'ACTION_REQUIRED',
  RESOLUTION_SUBMITTED: 'RESOLUTION_SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  RESOLVED: 'RESOLVED',
  RESOLUTION_REJECTED: 'RESOLUTION_REJECTED',
  CANCELLED: 'CANCELLED',
} as const;

export type ShortfallStatus = (typeof SHORTFALL_STATUS)[keyof typeof SHORTFALL_STATUS];

/**
 * Settled. Everything else is open, and open blocks approval.
 *
 * Expressed as the closed set rather than the open one on purpose: a status
 * added later is open until somebody deliberately says otherwise, which is the
 * safe direction for a rule whose failure mode is approving an application
 * that should not have been.
 */
export const CLOSED_SHORTFALL_STATUSES = [
  SHORTFALL_STATUS.RESOLVED,
  SHORTFALL_STATUS.CANCELLED,
] as const;

export const isShortfallOpen = (status: string): boolean =>
  !(CLOSED_SHORTFALL_STATUSES as readonly string[]).includes(status);

/** Whose move it is. Drives the banner, the queue filters and the wording. */
export type Turn = 'APPLICANT' | 'OFFICER' | 'SYSTEM' | 'NOBODY';

export const turnOf = (status: string): Turn => {
  switch (status) {
    case SHORTFALL_STATUS.RAISED:
      // Nobody has been told yet — the dispatcher owes somebody a message.
      return 'SYSTEM';
    case SHORTFALL_STATUS.NOTIFIED:
    case SHORTFALL_STATUS.ACTION_REQUIRED:
    case SHORTFALL_STATUS.RESOLUTION_REJECTED:
      return 'APPLICANT';
    case SHORTFALL_STATUS.RESOLUTION_SUBMITTED:
    case SHORTFALL_STATUS.UNDER_REVIEW:
      return 'OFFICER';
    default:
      return 'NOBODY';
  }
};

/**
 * THE state machine. Every legal move, and nothing else.
 *
 * The engine refuses a transition that is not here, which is what stops a
 * second click, a replayed request or a well-meaning admin script from
 * resolving a shortfall the applicant never answered.
 */
export const SHORTFALL_TRANSITIONS: Record<string, readonly string[]> = {
  // RAISED and NOTIFIED both accept a response, and that is deliberate. The
  // applicant can SEE the shortfall on their application the moment it is
  // raised, and seeing it is notice. Making their ability to answer depend on
  // a background job having run would mean that a stalled dispatcher stops an
  // applicant who already knows from doing anything about it — the lifecycle
  // is here to RECORD what happened, not to obstruct it.
  [SHORTFALL_STATUS.RAISED]: [
    SHORTFALL_STATUS.NOTIFIED,
    SHORTFALL_STATUS.RESOLUTION_SUBMITTED,
    SHORTFALL_STATUS.RESOLVED,
    SHORTFALL_STATUS.CANCELLED,
  ],
  [SHORTFALL_STATUS.NOTIFIED]: [
    SHORTFALL_STATUS.ACTION_REQUIRED,
    SHORTFALL_STATUS.RESOLUTION_SUBMITTED,
    SHORTFALL_STATUS.RESOLVED,
    SHORTFALL_STATUS.CANCELLED,
  ],
  [SHORTFALL_STATUS.ACTION_REQUIRED]: [
    SHORTFALL_STATUS.RESOLUTION_SUBMITTED,
    // Settled directly. A REPORTED shortfall never parked the file and has no
    // formal response to review — the applicant pays the demand or supplies
    // the document, and the officer holding the file records that it is done.
    // `settleShortfall` refuses this route for a BLOCKING shortfall, where an
    // answer is the whole point; the way out of one of those raised in error
    // is to withdraw it, which says so on the record.
    SHORTFALL_STATUS.RESOLVED,
    SHORTFALL_STATUS.CANCELLED,
  ],
  [SHORTFALL_STATUS.RESOLUTION_SUBMITTED]: [
    SHORTFALL_STATUS.UNDER_REVIEW,
    // An officer who accepts or rejects straight from the inbox never passes
    // through UNDER_REVIEW, and forcing them to would be ceremony.
    SHORTFALL_STATUS.RESOLVED,
    SHORTFALL_STATUS.RESOLUTION_REJECTED,
    SHORTFALL_STATUS.CANCELLED,
  ],
  [SHORTFALL_STATUS.UNDER_REVIEW]: [
    SHORTFALL_STATUS.RESOLVED,
    SHORTFALL_STATUS.RESOLUTION_REJECTED,
    SHORTFALL_STATUS.CANCELLED,
  ],
  [SHORTFALL_STATUS.RESOLUTION_REJECTED]: [
    SHORTFALL_STATUS.RESOLUTION_SUBMITTED,
    SHORTFALL_STATUS.RESOLVED,
    SHORTFALL_STATUS.CANCELLED,
  ],
  // Terminal. A resolved shortfall is not reopened — a new one is raised, so
  // the record shows two decisions rather than one that changed its mind.
  [SHORTFALL_STATUS.RESOLVED]: [],
  [SHORTFALL_STATUS.CANCELLED]: [],
};

export const canTransition = (from: string, to: string): boolean =>
  (SHORTFALL_TRANSITIONS[from] ?? []).includes(to);

/**
 * Why a move is not allowed, in the words of whoever is being refused.
 *
 * Every branch names the state the thing is actually in, because "invalid
 * transition" tells a user nothing they can act on.
 */
export function whyNotTransition(from: string, to: string): string | null {
  if (canTransition(from, to)) return null;

  if (from === SHORTFALL_STATUS.RESOLVED) return 'This shortfall has already been settled.';
  if (from === SHORTFALL_STATUS.CANCELLED) return 'This shortfall was cancelled.';

  if (to === SHORTFALL_STATUS.RESOLUTION_SUBMITTED) {
    if (from === SHORTFALL_STATUS.RESOLUTION_SUBMITTED || from === SHORTFALL_STATUS.UNDER_REVIEW) {
      return 'Your response is already with the department. You will be told when it has been looked at.';
    }
  }

  if (to === SHORTFALL_STATUS.RESOLVED || to === SHORTFALL_STATUS.RESOLUTION_REJECTED) {
    return 'There is no response to decide on yet.';
  }

  return `A shortfall that is ${statusLabel(from).toLowerCase()} cannot become ${statusLabel(to).toLowerCase()}.`;
}

/** The label the badge shows. Kept beside the machine so the two agree. */
export const SHORTFALL_STATUS_LABELS: Record<string, string> = {
  RAISED: 'Raised',
  NOTIFIED: 'Notified',
  ACTION_REQUIRED: 'Action required',
  RESOLUTION_SUBMITTED: 'Response submitted',
  UNDER_REVIEW: 'Under review',
  RESOLVED: 'Resolved',
  RESOLUTION_REJECTED: 'Response rejected',
  CANCELLED: 'Cancelled',
};

export const statusLabel = (status: string): string =>
  SHORTFALL_STATUS_LABELS[status] ?? status;

/** The filters on the shortfall register. Each is a question somebody asks. */
export const SHORTFALL_FILTERS = {
  ALL: 'all',
  OPEN: 'open',
  AWAITING_APPLICANT: 'awaiting-applicant',
  AWAITING_OFFICER: 'awaiting-officer',
  OVERDUE: 'overdue',
  RESOLVED: 'resolved',
} as const;

export type ShortfallFilter = (typeof SHORTFALL_FILTERS)[keyof typeof SHORTFALL_FILTERS];

export const SHORTFALL_FILTER_META: Array<{
  key: ShortfallFilter;
  label: string;
  description: string;
}> = [
  { key: SHORTFALL_FILTERS.ALL, label: 'All', description: 'Every shortfall you can see.' },
  { key: SHORTFALL_FILTERS.OPEN, label: 'Open', description: 'Not yet settled. These block approval.' },
  {
    key: SHORTFALL_FILTERS.AWAITING_APPLICANT,
    label: 'With the applicant',
    description: 'Sent, and waiting for a response.',
  },
  {
    key: SHORTFALL_FILTERS.AWAITING_OFFICER,
    label: 'With the department',
    description: 'Answered, and waiting for an officer to decide.',
  },
  {
    key: SHORTFALL_FILTERS.OVERDUE,
    label: 'Overdue',
    description: 'Past the date the applicant was asked to respond by.',
  },
  { key: SHORTFALL_FILTERS.RESOLVED, label: 'Settled', description: 'Resolved or cancelled.' },
];

export const isShortfallFilter = (value: string): value is ShortfallFilter =>
  SHORTFALL_FILTER_META.some((f) => f.key === value);

/**
 * How a due date reads on a row.
 *
 * A shortfall with no due date says so plainly rather than showing a blank:
 * no statutory response period has been supplied (Q19), so most shortfalls
 * genuinely have none, and an empty cell would look like missing data.
 */
export function dueLabel(dueDate: string | Date | null | undefined, now = new Date()): string {
  if (!dueDate) return 'No date set';

  const due = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
  const days = Math.ceil((due.getTime() - now.getTime()) / 86_400_000);

  if (days > 1) return `${days} days left`;
  if (days === 1) return 'Due tomorrow';
  if (days === 0) return 'Due today';
  return Math.abs(days) === 1 ? '1 day overdue' : `${Math.abs(days)} days overdue`;
}

export const isOverdue = (
  dueDate: string | Date | null | undefined,
  status: string,
  now = new Date()
): boolean => {
  if (!dueDate || !isShortfallOpen(status)) return false;
  const due = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
  return due.getTime() < now.getTime();
};
