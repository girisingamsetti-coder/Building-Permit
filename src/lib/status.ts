/**
 * Status → label and tone. THE single mapping.
 *
 * Adding a status touches this file and nothing else. Tones carry fixed
 * meanings (docs/06-frontend.md K.4) and every badge shows text as well as
 * colour, so the interface stays readable for a colour-blind officer.
 */

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'purple';

type Meta = { label: string; tone: Tone };

const APPLICATION_STATUS: Record<string, Meta> = {
  // LTP side
  DRAFT: { label: 'Draft', tone: 'neutral' },
  DRAWING_UPLOADED: { label: 'Drawing uploaded', tone: 'info' },
  SCRUTINY_IN_PROGRESS: { label: 'Scrutiny in progress', tone: 'info' },
  SCRUTINY_FAILED: { label: 'Scrutiny failed', tone: 'danger' },
  SCRUTINY_PASSED: { label: 'Scrutiny passed', tone: 'success' },
  DOCUMENT_UPLOAD_PENDING: { label: 'Documents Submission', tone: 'warning' },
  DOCUMENTS_COMPLETED: { label: 'Documents complete', tone: 'success' },
  FEE_GENERATED: { label: 'Fee generated', tone: 'warning' },
  PAYMENT_PENDING: { label: 'Payment pending', tone: 'warning' },
  PAYMENT_FAILED: { label: 'Payment failed', tone: 'danger' },
  PAYMENT_SUCCESSFUL: { label: 'Payment successful', tone: 'success' },
  SUBMITTED: { label: 'Submitted', tone: 'info' },

  // Department side
  PENDING_TPA: { label: 'Pending — TPA', tone: 'info' },
  TPA_REVIEW: { label: 'TPA review', tone: 'purple' },
  TPA_DOCUMENT_SHORTFALL: { label: 'TPA — document shortfall', tone: 'warning' },
  TPA_FEE_SHORTFALL: { label: 'TPA — fee shortfall', tone: 'warning' },
  TPA_TECHNICAL_SHORTFALL: { label: 'TPA — technical shortfall', tone: 'warning' },
  PENDING_ZAD_ZDD: { label: 'Pending — ZAD/ZDD', tone: 'info' },
  ZAD_ZDD_REVIEW: { label: 'ZAD/ZDD review', tone: 'purple' },
  ZAD_ZDD_SHORTFALL: { label: 'ZAD/ZDD — shortfall', tone: 'warning' },
  PENDING_ZJD: { label: 'Pending — ZJD', tone: 'info' },
  ZJD_REVIEW: { label: 'ZJD review', tone: 'purple' },
  ZJD_SHORTFALL: { label: 'ZJD — shortfall', tone: 'warning' },
  ZJD_FEE_SHORTFALL: { label: 'ZJD — fee shortfall', tone: 'warning' },
  PENDING_DIRECTOR_DP: { label: 'Pending — Director', tone: 'info' },
  DIRECTOR_REVIEW: { label: 'Director review', tone: 'purple' },
  DIRECTOR_SHORTFALL: { label: 'Director — shortfall', tone: 'warning' },
  DIRECTOR_REPORTED_SHORTFALL: { label: 'Director — reported shortfall', tone: 'warning' },
  PENDING_ADDITIONAL_COMMISSIONER: { label: 'Pending — Addl Commissioner', tone: 'info' },
  ADDITIONAL_COMMISSIONER_REVIEW: { label: 'Addl Commissioner review', tone: 'purple' },
  ADDITIONAL_COMMISSIONER_SHORTFALL: { label: 'Addl Commissioner — shortfall', tone: 'warning' },
  PENDING_COMMISSIONER: { label: 'Pending — Commissioner', tone: 'info' },
  COMMISSIONER_REVIEW: { label: 'Commissioner review', tone: 'purple' },

  // Terminal
  APPROVED: { label: 'Approved', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'neutral' },
  LAPSED: { label: 'Lapsed', tone: 'neutral' },
};

const USER_STATUS: Record<string, Meta> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  INACTIVE: { label: 'Inactive', tone: 'neutral' },
  LOCKED: { label: 'Locked', tone: 'danger' },
  SUSPENDED: { label: 'Suspended', tone: 'danger' },
};

const SLA_STATUS: Record<string, Meta> = {
  ON_TRACK: { label: 'On track', tone: 'success' },
  DUE_SOON: { label: 'Due soon', tone: 'warning' },
  // Notification only — passing the date carries no legal effect (docs R.1.1).
  OVERDUE: { label: 'Overdue', tone: 'danger' },
  PAUSED: { label: 'Paused', tone: 'neutral' },
  COMPLETED: { label: 'Completed', tone: 'neutral' },
};

/**
 * Where one shortfall stands. The lifecycle itself is in
 * `src/lib/shortfalls.ts`; this is only how each state is coloured.
 *
 * RAISED is `danger`, and it is the only status here that describes a fault in
 * the SYSTEM rather than a state of the work: it means the shortfall was
 * recorded and the applicant was never told. Painting it the same amber as
 * "waiting for the applicant" would hide the one case where nobody is waiting
 * for anything because nobody knows.
 */
const SHORTFALL_STATUS: Record<string, Meta> = {
  RAISED: { label: 'Not yet sent', tone: 'danger' },
  NOTIFIED: { label: 'Sent to applicant', tone: 'info' },
  ACTION_REQUIRED: { label: 'Action required', tone: 'warning' },
  RESOLUTION_SUBMITTED: { label: 'Response submitted', tone: 'info' },
  UNDER_REVIEW: { label: 'Under review', tone: 'purple' },
  RESOLVED: { label: 'Resolved', tone: 'success' },
  RESOLUTION_REJECTED: { label: 'Response rejected', tone: 'danger' },
  CANCELLED: { label: 'Withdrawn', tone: 'neutral' },
};

/**
 * Which desk the file is sitting at, derived from its status.
 *
 * `applications.currentStageCode` is authoritative — but it stays null until
 * the workflow engine populates it in Phase 7. Until then the status implies
 * the stage well enough to fill the column, and `stageLabel()` prefers the
 * real code the moment there is one. The alternative was a column reading "—"
 * on every row for eight phases.
 */
const STAGE_BY_STATUS: Record<string, string> = {
  DRAFT: 'Filing',
  DRAWING_UPLOADED: 'Drawing',
  SCRUTINY_IN_PROGRESS: 'Scrutiny',
  SCRUTINY_FAILED: 'Scrutiny',
  SCRUTINY_PASSED: 'Scrutiny',
  DOCUMENT_UPLOAD_PENDING: 'Documents',
  DOCUMENTS_COMPLETED: 'Documents',
  FEE_GENERATED: 'Payment',
  PAYMENT_PENDING: 'Payment',
  PAYMENT_FAILED: 'Payment',
  PAYMENT_SUCCESSFUL: 'Payment',
  SUBMITTED: 'With department',

  PENDING_TPA: 'TPA',
  TPA_REVIEW: 'TPA',
  TPA_DOCUMENT_SHORTFALL: 'TPA',
  TPA_FEE_SHORTFALL: 'TPA',
  TPA_TECHNICAL_SHORTFALL: 'TPA',
  PENDING_ZAD_ZDD: 'ZAD/ZDD',
  ZAD_ZDD_REVIEW: 'ZAD/ZDD',
  ZAD_ZDD_SHORTFALL: 'ZAD/ZDD',
  PENDING_ZJD: 'ZJD',
  ZJD_REVIEW: 'ZJD',
  ZJD_SHORTFALL: 'ZJD',
  ZJD_FEE_SHORTFALL: 'ZJD',
  PENDING_DIRECTOR_DP: 'Director',
  DIRECTOR_REVIEW: 'Director',
  DIRECTOR_SHORTFALL: 'Director',
  DIRECTOR_REPORTED_SHORTFALL: 'Director',
  PENDING_ADDITIONAL_COMMISSIONER: 'Addl Commissioner',
  ADDITIONAL_COMMISSIONER_REVIEW: 'Addl Commissioner',
  ADDITIONAL_COMMISSIONER_SHORTFALL: 'Addl Commissioner',
  PENDING_COMMISSIONER: 'Commissioner',
  COMMISSIONER_REVIEW: 'Commissioner',

  APPROVED: 'Closed',
  REJECTED: 'Closed',
  WITHDRAWN: 'Closed',
  LAPSED: 'Closed',
};

export function stageLabel(status: string | null | undefined, currentStageCode?: string | null): string {
  if (currentStageCode) return titleise(currentStageCode);
  if (!status) return '—';
  return STAGE_BY_STATUS[status] ?? titleise(status);
}

/** How a scrutiny RUN is going. Distinct from its outcome — see below. */
const SCRUTINY_STATUS: Record<string, Meta> = {
  QUEUED: { label: 'Queued', tone: 'info' },
  RUNNING: { label: 'Running', tone: 'info' },
  COMPLETED: { label: 'Completed', tone: 'neutral' },
  // The engine could not be reached or failed mid-run. NOT a compliance
  // verdict — the drawing has not been judged either way, and the run retries.
  ERRORED: { label: 'Engine error', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

/**
 * What a completed run DECIDED. Deliberately separate from ScrutinyStatus:
 * "COMPLETED" says the engine finished, "FAIL" says the drawing did not
 * comply, and conflating them is how a UI ends up showing a green tick for a
 * run that completed with twelve critical findings.
 */
const SCRUTINY_OUTCOME: Record<string, Meta> = {
  PASS: { label: 'Passed', tone: 'success' },
  FAIL: { label: 'Failed', tone: 'danger' },
};

const SEVERITY: Record<string, Meta> = {
  CRITICAL: { label: 'Critical', tone: 'danger' },
  MAJOR: { label: 'Major', tone: 'danger' },
  MINOR: { label: 'Minor', tone: 'warning' },
  INFO: { label: 'Advisory', tone: 'info' },
};

/**
 * Where one document stands.
 *
 * NOT_UPLOADED is deliberately "Not uploaded" and neutral rather than a red
 * "Missing": on a checklist of fourteen documents, an applicant who has just
 * started has not done anything wrong, and painting the whole list in alarm
 * colours makes the two rows that ARE wrong impossible to find.
 */
const DOCUMENT_STATUS: Record<string, Meta> = {
  NOT_UPLOADED: { label: 'Not uploaded', tone: 'neutral' },
  UPLOADED: { label: 'Uploaded', tone: 'info' },
  UNDER_VERIFICATION: { label: 'Being checked', tone: 'purple' },
  VERIFIED: { label: 'Verified', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  SUPERSEDED: { label: 'Superseded', tone: 'neutral' },
};

/** Where one demand stands. */
const DEMAND_STATUS: Record<string, Meta> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  ISSUED: { label: 'Payable', tone: 'warning' },
  PARTIALLY_PAID: { label: 'Part paid', tone: 'warning' },
  PAID: { label: 'Paid', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  WAIVED: { label: 'Waived', tone: 'info' },
};

/**
 * Where one payment attempt stands.
 *
 * TIMEOUT is `warning`, not `danger`: the gateway did not answer, which is not
 * the applicant's fault and not a refusal. FAILED is danger because something
 * was actually refused and the LTP has to do something about it.
 */
const PAYMENT_STATUS: Record<string, Meta> = {
  INITIATED: { label: 'Starting', tone: 'neutral' },
  PENDING: { label: 'Awaiting payment', tone: 'warning' },
  PROCESSING: { label: 'At the payment gateway', tone: 'info' },
  SUCCESS: { label: 'Paid', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  TIMEOUT: { label: 'Timed out', tone: 'warning' },
  REFUNDED: { label: 'Refunded', tone: 'purple' },
};

/** Antivirus state of a stored file. */
const SCAN_STATUS: Record<string, Meta> = {
  PENDING: { label: 'Scanning', tone: 'warning' },
  CLEAN: { label: 'Clean', tone: 'success' },
  INFECTED: { label: 'Infected', tone: 'danger' },
  // No scanner configured. Honest label — not "Clean", which would claim a
  // check that never happened.
  SKIPPED: { label: 'Not scanned', tone: 'neutral' },
  FAILED: { label: 'Scan failed', tone: 'danger' },
};

export type StatusKind =
  | 'application'
  | 'user'
  | 'sla'
  | 'shortfall'
  | 'scrutiny'
  | 'outcome'
  | 'severity'
  | 'scan'
  | 'document'
  | 'demand'
  | 'payment';

const REGISTRY: Record<StatusKind, Record<string, Meta>> = {
  application: APPLICATION_STATUS,
  user: USER_STATUS,
  sla: SLA_STATUS,
  shortfall: SHORTFALL_STATUS,
  scrutiny: SCRUTINY_STATUS,
  outcome: SCRUTINY_OUTCOME,
  severity: SEVERITY,
  scan: SCAN_STATUS,
  document: DOCUMENT_STATUS,
  demand: DEMAND_STATUS,
  payment: PAYMENT_STATUS,
};

/** An unknown status renders as itself rather than blank — silence hides bugs. */
export function statusMeta(kind: StatusKind, status: string | null | undefined): Meta {
  if (!status) return { label: '—', tone: 'neutral' };
  return REGISTRY[kind][status] ?? { label: titleise(status), tone: 'neutral' };
}

function titleise(value: string): string {
  const lower = value.toLowerCase().replace(/_/g, ' ');
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
