import type { PrismaClient } from '@prisma/client';

/**
 * THE WORKFLOW ITSELF.
 *
 * Everything the department does with a file is in this one file, as data:
 * which desks exist, what each may do, where each action sends the file, what
 * must be true before it may, and what else happens when it does.
 *
 * `src/server/workflow/engine.ts` contains none of it. That is the deal Phase 6
 * makes: the engine is a mechanism, and this is the policy. Granting the
 * Additional Commissioner the power to report a shortfall and forward is a row
 * below — not a branch, not a page, not a deployment.
 *
 * ── Where the engine's authority begins ──────────────────────────────────
 *
 * The stage catalogue lists the applicant-side stages (LTP_DRAFT → LTP_PAYMENT)
 * because they are real places a file sits and the register labels them. But
 * the ENGINE takes over at the payment gate: `startWorkflow` creates the
 * instance at LTP_PAYMENT and immediately performs CONFIRM_PAYMENT, which is
 * seeded below as an ordinary transition. Everything before that is driven by
 * the filing services built in Phases 2–5, and no transition rows are seeded
 * for it — configuration that nothing executes would be a lie about how the
 * system works.
 *
 * ── One deliberate departure from docs/03-workflow.md G.3 ────────────────
 *
 * The documented design leaves an answered shortfall sitting at
 * LTP_SHORTFALL_ACTION for the officer to accept from there. This seeds it the
 * other way: RESUBMIT carries the file back to the desk that parked it
 * (RETURN_TO_ORIGIN), where the officer finds it in their own queue reading
 * "Shortfall responded" and accepts or rejects it from their own stage.
 *
 * The reason is the task queue. A task belongs to a stage, and the stage's
 * owner roles decide whose inbox it appears in — so leaving an answered
 * shortfall at the applicant's stage would leave it addressed to the applicant,
 * and the officer waiting for it would never see it arrive. The engine's
 * behaviour is identical either way; this is the arrangement that produces a
 * working inbox.
 */

const WORKFLOW_CODE = 'BP_STANDARD';

// ═══════════════════════════════════════════════════════════════════════════
// 1. Stages
// ═══════════════════════════════════════════════════════════════════════════

type StageSeed = {
  code: string;
  name: string;
  type: 'LTP_ACTION' | 'REVIEW' | 'APPROVAL' | 'TERMINAL';
  sequence: number;
  ownerRoleKeys: string[];
  entryStatus: string;
  workingStatus?: string;
  slaDays?: number;
  isEntry?: boolean;
  isTerminal?: boolean;
  allowReassign?: boolean;
  description: string;
};

/**
 * SLA days are the illustrative figures from the requirement's §26 and are
 * SEED DATA, editable at runtime. They are not law until the department
 * confirms them — see docs/10-open-questions.md Q11.
 */
const STAGES: StageSeed[] = [
  {
    code: 'LTP_DRAFT',
    name: 'Filing',
    type: 'LTP_ACTION',
    sequence: 10,
    ownerRoleKeys: ['LTP'],
    entryStatus: 'DRAFT',
    description: 'The applicant is filling in the application. Driven by the filing wizard.',
  },
  {
    code: 'LTP_DRAWING',
    name: 'Drawing and scrutiny',
    type: 'LTP_ACTION',
    sequence: 20,
    ownerRoleKeys: ['LTP'],
    entryStatus: 'DRAWING_UPLOADED',
    workingStatus: 'SCRUTINY_IN_PROGRESS',
    description: 'The drawing is uploaded and checked. Driven by the scrutiny service.',
  },
  {
    code: 'LTP_DOCUMENTS',
    name: 'Documents',
    type: 'LTP_ACTION',
    sequence: 30,
    ownerRoleKeys: ['LTP'],
    entryStatus: 'DOCUMENT_UPLOAD_PENDING',
    description: 'The checklist is being completed. Driven by the document service.',
  },
  {
    code: 'LTP_PAYMENT',
    name: 'Payment',
    type: 'LTP_ACTION',
    sequence: 40,
    ownerRoleKeys: ['LTP'],
    entryStatus: 'FEE_GENERATED',
    workingStatus: 'PAYMENT_PENDING',
    // Where every departmental run begins. The instance is created here and
    // leaves immediately by CONFIRM_PAYMENT — so the first row in a file's
    // history is the payment that carried it to the department, which is
    // exactly the fact §8 says must be provable.
    isEntry: true,
    description: 'The fee is payable. A confirmed payment carries the file to the department.',
  },

  {
    code: 'TPA_REVIEW',
    name: 'Town Planning Assistant',
    type: 'REVIEW',
    sequence: 50,
    ownerRoleKeys: ['TPA'],
    entryStatus: 'PENDING_TPA',
    workingStatus: 'TPA_REVIEW',
    slaDays: 5,
    description: 'First departmental desk. Technical scrutiny, document verification, shortfalls.',
  },
  {
    code: 'ZAD_ZDD_REVIEW',
    name: 'Zonal Assistant / Deputy Director',
    type: 'REVIEW',
    sequence: 60,
    // Two roles, one desk. A task addressed to either is visible to both,
    // because the QUEUE is scoped by the stage's owners rather than by the
    // task's own role — see taskScope() in src/server/auth/scope.ts.
    ownerRoleKeys: ['ZAD', 'ZDD'],
    entryStatus: 'PENDING_ZAD_ZDD',
    workingStatus: 'ZAD_ZDD_REVIEW',
    slaDays: 5,
    description: 'Zonal review.',
  },
  {
    code: 'ZJD_REVIEW',
    name: 'Zonal Joint Director',
    type: 'REVIEW',
    sequence: 70,
    ownerRoleKeys: ['ZJD'],
    entryStatus: 'PENDING_ZJD',
    workingStatus: 'ZJD_REVIEW',
    slaDays: 7,
    description: 'Zonal review. May report a fee shortfall and still forward.',
  },
  {
    code: 'DIRECTOR_DP_REVIEW',
    name: 'Director (Development Plan)',
    type: 'REVIEW',
    sequence: 80,
    ownerRoleKeys: ['DIRECTOR_DP'],
    entryStatus: 'PENDING_DIRECTOR_DP',
    workingStatus: 'DIRECTOR_REVIEW',
    slaDays: 7,
    description: 'City-wide review. May report a shortfall and still forward.',
  },
  {
    code: 'ADDL_COMMISSIONER_REVIEW',
    name: 'Additional Commissioner',
    type: 'REVIEW',
    sequence: 90,
    ownerRoleKeys: ['ADDL_COMMISSIONER'],
    entryStatus: 'PENDING_ADDITIONAL_COMMISSIONER',
    workingStatus: 'ADDITIONAL_COMMISSIONER_REVIEW',
    slaDays: 5,
    description: 'Penultimate review. The action set is configured, not fixed — see Q5.',
  },
  {
    code: 'COMMISSIONER_REVIEW',
    name: 'Commissioner',
    type: 'APPROVAL',
    sequence: 100,
    ownerRoleKeys: ['COMMISSIONER'],
    entryStatus: 'PENDING_COMMISSIONER',
    workingStatus: 'COMMISSIONER_REVIEW',
    slaDays: 5,
    description: 'Final authority. The only desk that may approve or reject.',
  },

  {
    code: 'LTP_SHORTFALL_ACTION',
    name: 'With the applicant',
    type: 'LTP_ACTION',
    sequence: 110,
    ownerRoleKeys: ['LTP'],
    // Set by whichever transition parked the file — TPA_DOCUMENT_SHORTFALL,
    // ZJD_FEE_SHORTFALL, and so on. The value here is only the fallback.
    entryStatus: 'RETURNED_TO_APPLICANT',
    allowReassign: false,
    description: 'A blocking shortfall has parked the file. The applicant must answer.',
  },

  {
    code: 'CLOSED_APPROVED',
    name: 'Approved',
    type: 'TERMINAL',
    sequence: 900,
    ownerRoleKeys: [],
    entryStatus: 'APPROVED',
    isTerminal: true,
    description: 'Permission granted. The approval order is issued.',
  },
  {
    code: 'CLOSED_REJECTED',
    name: 'Rejected',
    type: 'TERMINAL',
    sequence: 910,
    ownerRoleKeys: [],
    entryStatus: 'REJECTED',
    isTerminal: true,
    description: 'Permission refused.',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// 2. Actions
// ═══════════════════════════════════════════════════════════════════════════
//
// Reusable across stages. A stage becomes able to perform one by having a
// transition row that references it — which is why FORWARD is defined once and
// means "send it on" at six different desks.

type ActionSeed = {
  code: string;
  label: string;
  kind: 'FORWARD' | 'RETURN' | 'REPORT_AND_FORWARD' | 'APPROVE' | 'REJECT' | 'RESUBMIT' | 'CLARIFY' | 'SYSTEM';
  intent: 'primary' | 'secondary' | 'destructive';
  capabilityKey: string;
  requiresRemarks: boolean;
  requiresAttachment?: boolean;
  confirmText?: string;
  displayOrder: number;
};

const ACTIONS: ActionSeed[] = [
  {
    code: 'CONFIRM_PAYMENT',
    label: 'Payment confirmed',
    kind: 'SYSTEM',
    intent: 'secondary',
    capabilityKey: '',
    requiresRemarks: false,
    displayOrder: 0,
  },
  {
    code: 'FORWARD',
    label: 'Forward',
    kind: 'FORWARD',
    intent: 'primary',
    capabilityKey: 'WORKFLOW_FORWARD',
    requiresRemarks: true,
    displayOrder: 10,
  },
  {
    code: 'RAISE_DOCUMENT_SHORTFALL',
    label: 'Raise document shortfall',
    kind: 'RETURN',
    intent: 'secondary',
    capabilityKey: 'SHORTFALL_CREATE',
    requiresRemarks: true,
    confirmText: 'The application goes back to the applicant until this is answered.',
    displayOrder: 20,
  },
  {
    code: 'RAISE_FEE_SHORTFALL',
    label: 'Raise fee shortfall',
    kind: 'RETURN',
    intent: 'secondary',
    // Raising one ISSUES A DEMAND, so it needs the fee capability as well as
    // the shortfall one. `capabilityKey` holds a single key, and FEE_GENERATE
    // is the more consequential of the two — it is the one that can make
    // somebody owe money.
    capabilityKey: 'FEE_GENERATE',
    requiresRemarks: true,
    confirmText: 'A demand will be raised and the application goes back to the applicant.',
    displayOrder: 30,
  },
  {
    code: 'RAISE_TECHNICAL_SHORTFALL',
    label: 'Raise technical shortfall',
    kind: 'RETURN',
    intent: 'secondary',
    capabilityKey: 'SHORTFALL_CREATE',
    requiresRemarks: true,
    confirmText: 'The applicant must correct the drawing before the file moves on.',
    displayOrder: 40,
  },
  {
    code: 'RAISE_CLARIFICATION',
    label: 'Ask for clarification',
    kind: 'CLARIFY',
    intent: 'secondary',
    capabilityKey: 'SHORTFALL_CREATE',
    requiresRemarks: true,
    displayOrder: 50,
  },
  {
    code: 'REPORT_FEE_SHORTFALL_AND_FORWARD',
    label: 'Report fee shortfall and forward',
    kind: 'REPORT_AND_FORWARD',
    intent: 'secondary',
    capabilityKey: 'FEE_GENERATE',
    requiresRemarks: true,
    confirmText:
      'The shortfall travels with the file and must be settled before approval. The file moves on now.',
    displayOrder: 60,
  },
  {
    code: 'REPORT_SHORTFALL_AND_FORWARD',
    label: 'Report shortfall and forward',
    kind: 'REPORT_AND_FORWARD',
    intent: 'secondary',
    capabilityKey: 'SHORTFALL_CREATE',
    requiresRemarks: true,
    confirmText:
      'The shortfall travels with the file and must be settled before approval. The file moves on now.',
    displayOrder: 70,
  },
  {
    code: 'RETURN_TO_PREVIOUS',
    label: 'Return',
    kind: 'RETURN',
    intent: 'secondary',
    capabilityKey: 'WORKFLOW_RETURN',
    requiresRemarks: true,
    displayOrder: 80,
  },
  {
    code: 'RESUBMIT',
    label: 'Submit response',
    kind: 'RESUBMIT',
    intent: 'primary',
    capabilityKey: 'SHORTFALL_RESPOND',
    requiresRemarks: true,
    displayOrder: 90,
  },
  {
    code: 'ACCEPT_RESOLUTION',
    label: 'Accept response',
    kind: 'FORWARD',
    intent: 'primary',
    capabilityKey: 'SHORTFALL_RESOLVE',
    requiresRemarks: true,
    displayOrder: 100,
  },
  {
    code: 'REJECT_RESOLUTION',
    label: 'Reject response',
    kind: 'RETURN',
    intent: 'destructive',
    capabilityKey: 'SHORTFALL_RESOLVE',
    requiresRemarks: true,
    confirmText: 'The application goes back to the applicant for another attempt.',
    displayOrder: 110,
  },
  {
    code: 'RESOLVE_REPORTED_SHORTFALL',
    label: 'Close reported shortfall',
    kind: 'FORWARD',
    intent: 'secondary',
    capabilityKey: 'SHORTFALL_RESOLVE',
    requiresRemarks: true,
    confirmText: 'Say what settled it — the payment, or the document supplied.',
    displayOrder: 115,
  },
  {
    code: 'APPROVE',
    label: 'Approve',
    kind: 'APPROVE',
    intent: 'primary',
    capabilityKey: 'APPLICATION_APPROVE',
    requiresRemarks: true,
    confirmText: 'This grants the building permission and issues the approval order.',
    displayOrder: 120,
  },
  {
    code: 'REJECT',
    label: 'Reject',
    kind: 'REJECT',
    intent: 'destructive',
    capabilityKey: 'APPLICATION_REJECT',
    requiresRemarks: true,
    confirmText: 'This refuses the application. It cannot be undone.',
    displayOrder: 130,
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// 3. Transitions
// ═══════════════════════════════════════════════════════════════════════════

type TransitionSeed = {
  from: string;
  action: string;
  /** Null applies whatever the current status is. */
  fromStatus?: string | null;
  /** Null when an effect chooses — RETURN_TO_ORIGIN resumes the parked stage. */
  to: string | null;
  toStatus: string;
  allowedRoleKeys?: string[];
  guards?: string[];
  effects?: Array<Record<string, unknown>>;
  notify?: string;
  sla?: 'START' | 'PAUSE' | 'RESUME' | 'STOP' | 'NONE';
};

/** The departmental pipeline, in order. Used to generate FORWARD and RETURN. */
const PIPELINE = [
  'TPA_REVIEW',
  'ZAD_ZDD_REVIEW',
  'ZJD_REVIEW',
  'DIRECTOR_DP_REVIEW',
  'ADDL_COMMISSIONER_REVIEW',
  'COMMISSIONER_REVIEW',
] as const;

const ENTRY_STATUS: Record<string, string> = Object.fromEntries(
  STAGES.map((s) => [s.code, s.entryStatus])
);

const WORKING_STATUS: Record<string, string> = Object.fromEntries(
  STAGES.map((s) => [s.code, s.workingStatus ?? s.entryStatus])
);

/** The status a file takes while parked, per raising stage and kind. */
const PARKED_STATUS: Record<string, Record<string, string>> = {
  TPA_REVIEW: {
    DOCUMENT: 'TPA_DOCUMENT_SHORTFALL',
    FEE: 'TPA_FEE_SHORTFALL',
    TECHNICAL: 'TPA_TECHNICAL_SHORTFALL',
    CLARIFICATION: 'RETURNED_TO_APPLICANT',
  },
  ZAD_ZDD_REVIEW: {
    DOCUMENT: 'ZAD_ZDD_SHORTFALL',
    CLARIFICATION: 'ZAD_ZDD_SHORTFALL',
  },
  ZJD_REVIEW: {
    DOCUMENT: 'ZJD_SHORTFALL',
    FEE: 'ZJD_FEE_SHORTFALL',
  },
  DIRECTOR_DP_REVIEW: {
    DOCUMENT: 'DIRECTOR_SHORTFALL',
    FEE: 'DIRECTOR_SHORTFALL',
    TECHNICAL: 'DIRECTOR_SHORTFALL',
  },
  ADDL_COMMISSIONER_REVIEW: {
    DOCUMENT: 'ADDITIONAL_COMMISSIONER_SHORTFALL',
  },
  COMMISSIONER_REVIEW: {
    DOCUMENT: 'COMMISSIONER_SHORTFALL',
  },
};

/** A blocking shortfall: park the file, pause the clock. */
const park = (from: string, kind: string, action: string, extra: Array<Record<string, unknown>> = []): TransitionSeed => ({
  from,
  action,
  to: 'LTP_SHORTFALL_ACTION',
  toStatus: PARKED_STATUS[from]?.[kind] ?? 'RETURNED_TO_APPLICANT',
  guards: ['has_remarks'],
  effects: [{ type: 'RAISE_SHORTFALL', kind, mode: 'BLOCKING' }, ...extra],
  // No `notify`: the shortfall engine emits SHORTFALL_RAISED itself, carrying
  // the shortfall id the dispatcher needs in order to record that somebody was
  // actually told. A second event here would announce one decision twice.
  notify: '',
  sla: 'PAUSE',
});

/** A reported shortfall: record it, and move on regardless. */
const report = (from: string, kind: string, action: string, extra: Array<Record<string, unknown>> = []): TransitionSeed => {
  const next = PIPELINE[PIPELINE.indexOf(from as never) + 1]!;
  return {
    from,
    action,
    to: next,
    toStatus: from === 'DIRECTOR_DP_REVIEW' ? 'DIRECTOR_REPORTED_SHORTFALL' : ENTRY_STATUS[next]!,
    guards: ['has_remarks'],
    effects: [{ type: 'RAISE_SHORTFALL', kind, mode: 'REPORTED' }, ...extra],
    // The shortfall engine announces the shortfall; this announces the
    // movement, which is a different fact for a different reader — the next
    // desk needs to know the file has arrived.
    notify: 'APPLICATION_FORWARDED',
    // The clock keeps running. That is the whole difference from `park`: the
    // department has not stopped work, so it is still measuring itself.
    sla: 'START',
  };
};

/** Send it on to the next desk. */
const forward = (from: string): TransitionSeed => {
  const next = PIPELINE[PIPELINE.indexOf(from as never) + 1]!;
  return {
    from,
    action: 'FORWARD',
    to: next,
    toStatus: ENTRY_STATUS[next]!,
    guards: ['has_remarks'],
    notify: 'APPLICATION_FORWARDED',
    sla: 'START',
  };
};

/** Send it back one desk. */
const returnBack = (from: string): TransitionSeed => {
  const previous = PIPELINE[PIPELINE.indexOf(from as never) - 1]!;
  return {
    from,
    action: 'RETURN_TO_PREVIOUS',
    to: previous,
    toStatus: ENTRY_STATUS[previous]!,
    guards: ['has_remarks'],
    notify: 'APPLICATION_RETURNED',
    sla: 'START',
  };
};

/** Accept or reject the applicant's answer, from the desk that raised it. */
/**
 * Close a shortfall that TRAVELLED here rather than parking the file.
 *
 * A reported shortfall has no parked stage and no RESUBMIT to answer it: the
 * applicant settles it by paying the demand or supplying the document, and
 * whichever officer holds the file then records that it is settled. Every
 * review desk gets this, because a reported shortfall may still be open at any
 * of them — and since an open one blocks approval absolutely, a file with no
 * way to close one could never be approved.
 */
const closeReported = (stage: string): TransitionSeed => ({
  from: stage,
  action: 'RESOLVE_REPORTED_SHORTFALL',
  fromStatus: null,
  // Same stage: settling a shortfall is not a movement, and the officer keeps
  // the file and the clock they already had.
  to: stage,
  toStatus: WORKING_STATUS[stage]!,
  guards: ['reported_shortfall_open', 'has_remarks'],
  effects: [{ type: 'RESOLVE_SHORTFALL', mode: 'REPORTED' }],
  notify: '',
  sla: 'NONE',
});

const shortfallVerdict = (stage: string): TransitionSeed[] => [
  {
    from: stage,
    action: 'ACCEPT_RESOLUTION',
    fromStatus: 'SHORTFALL_RESPONDED',
    // Same stage: the officer keeps the file they are already holding, and
    // their SLA — resumed when the answer arrived — keeps running.
    to: stage,
    toStatus: WORKING_STATUS[stage]!,
    guards: ['shortfall_awaiting_review', 'has_remarks'],
    effects: [{ type: 'RESOLVE_SHORTFALL' }],
    notify: '',
    sla: 'NONE',
  },
  {
    from: stage,
    action: 'REJECT_RESOLUTION',
    fromStatus: 'SHORTFALL_RESPONDED',
    to: 'LTP_SHORTFALL_ACTION',
    toStatus: 'RETURNED_TO_APPLICANT',
    guards: ['shortfall_awaiting_review', 'has_remarks'],
    effects: [{ type: 'REJECT_RESOLUTION' }],
    notify: '',
    sla: 'PAUSE',
  },
];

const TRANSITIONS: TransitionSeed[] = [
  // ── The gate. §8: only a confirmed payment carries a file here ─────────
  {
    from: 'LTP_PAYMENT',
    action: 'CONFIRM_PAYMENT',
    fromStatus: null,
    to: 'TPA_REVIEW',
    toStatus: 'PENDING_TPA',
    guards: ['fees_paid'],
    notify: 'APPLICATION_FORWARDED',
    sla: 'START',
  },

  // ── §5 TPA ─────────────────────────────────────────────────────────────
  forward('TPA_REVIEW'),
  park('TPA_REVIEW', 'DOCUMENT', 'RAISE_DOCUMENT_SHORTFALL'),
  park('TPA_REVIEW', 'FEE', 'RAISE_FEE_SHORTFALL', [
    { type: 'GENERATE_FEE_DEMAND', demandType: 'SHORTFALL' },
  ]),
  park('TPA_REVIEW', 'TECHNICAL', 'RAISE_TECHNICAL_SHORTFALL'),
  // The first desk has no previous DESK, so its "return" is to the applicant.
  // Modelled as a clarification rather than as a special case, so the file is
  // parked, the applicant is told what is wanted, and the same RESUBMIT path
  // brings it back.
  park('TPA_REVIEW', 'CLARIFICATION', 'RETURN_TO_PREVIOUS'),
  ...shortfallVerdict('TPA_REVIEW'),
  closeReported('TPA_REVIEW'),

  // ── §6 ZAD / ZDD ───────────────────────────────────────────────────────
  forward('ZAD_ZDD_REVIEW'),
  park('ZAD_ZDD_REVIEW', 'DOCUMENT', 'RAISE_DOCUMENT_SHORTFALL'),
  park('ZAD_ZDD_REVIEW', 'CLARIFICATION', 'RAISE_CLARIFICATION'),
  returnBack('ZAD_ZDD_REVIEW'),
  ...shortfallVerdict('ZAD_ZDD_REVIEW'),
  closeReported('ZAD_ZDD_REVIEW'),

  // ── §7 ZJD — the desk that may report a FEE shortfall and forward ──────
  forward('ZJD_REVIEW'),
  park('ZJD_REVIEW', 'DOCUMENT', 'RAISE_DOCUMENT_SHORTFALL'),
  park('ZJD_REVIEW', 'FEE', 'RAISE_FEE_SHORTFALL', [
    { type: 'GENERATE_FEE_DEMAND', demandType: 'SHORTFALL' },
  ]),
  report('ZJD_REVIEW', 'FEE', 'REPORT_FEE_SHORTFALL_AND_FORWARD', [
    { type: 'GENERATE_FEE_DEMAND', demandType: 'SHORTFALL' },
  ]),
  returnBack('ZJD_REVIEW'),
  ...shortfallVerdict('ZJD_REVIEW'),
  closeReported('ZJD_REVIEW'),

  // ── §8 Director — may report ANY shortfall and forward ─────────────────
  forward('DIRECTOR_DP_REVIEW'),
  park('DIRECTOR_DP_REVIEW', 'DOCUMENT', 'RAISE_DOCUMENT_SHORTFALL'),
  park('DIRECTOR_DP_REVIEW', 'TECHNICAL', 'RAISE_TECHNICAL_SHORTFALL'),
  park('DIRECTOR_DP_REVIEW', 'FEE', 'RAISE_FEE_SHORTFALL', [
    { type: 'GENERATE_FEE_DEMAND', demandType: 'SHORTFALL' },
  ]),
  report('DIRECTOR_DP_REVIEW', 'DOCUMENT', 'REPORT_SHORTFALL_AND_FORWARD'),
  returnBack('DIRECTOR_DP_REVIEW'),
  ...shortfallVerdict('DIRECTOR_DP_REVIEW'),
  closeReported('DIRECTOR_DP_REVIEW'),

  // ── §9 Additional Commissioner ─────────────────────────────────────────
  //
  // §14 says only "configurable according to workflow configuration" — so this
  // is a PROVISIONAL seed (Q5), and changing it is an admin edit rather than a
  // code change. That is precisely the claim this engine exists to make good.
  forward('ADDL_COMMISSIONER_REVIEW'),
  park('ADDL_COMMISSIONER_REVIEW', 'DOCUMENT', 'RAISE_DOCUMENT_SHORTFALL'),
  report('ADDL_COMMISSIONER_REVIEW', 'DOCUMENT', 'REPORT_SHORTFALL_AND_FORWARD'),
  returnBack('ADDL_COMMISSIONER_REVIEW'),
  ...shortfallVerdict('ADDL_COMMISSIONER_REVIEW'),
  closeReported('ADDL_COMMISSIONER_REVIEW'),

  // ── §10 Commissioner ───────────────────────────────────────────────────
  {
    from: 'COMMISSIONER_REVIEW',
    action: 'APPROVE',
    to: 'CLOSED_APPROVED',
    toStatus: 'APPROVED',
    // THE approval guard. `no_open_shortfalls` counts every open shortfall of
    // every kind and every mode, with no override anywhere in the system —
    // docs/03-workflow.md F.5.1. A reported shortfall that travelled here with
    // the file blocks approval exactly as a blocking one would.
    guards: ['no_open_shortfalls', 'fees_paid', 'has_remarks'],
    effects: [
      { type: 'GENERATE_APPROVAL_ORDER' },
      { type: 'CLOSE_WORKFLOW', status: 'COMPLETED', outcome: 'APPROVED' },
    ],
    notify: 'APPLICATION_APPROVED',
    sla: 'STOP',
  },
  {
    from: 'COMMISSIONER_REVIEW',
    action: 'REJECT',
    to: 'CLOSED_REJECTED',
    toStatus: 'REJECTED',
    guards: ['has_remarks'],
    effects: [{ type: 'CLOSE_WORKFLOW', status: 'COMPLETED', outcome: 'REJECTED' }],
    notify: 'APPLICATION_REJECTED',
    sla: 'STOP',
  },
  park('COMMISSIONER_REVIEW', 'DOCUMENT', 'RAISE_DOCUMENT_SHORTFALL'),
  returnBack('COMMISSIONER_REVIEW'),
  ...shortfallVerdict('COMMISSIONER_REVIEW'),
  closeReported('COMMISSIONER_REVIEW'),

  // ── The applicant's answer ─────────────────────────────────────────────
  //
  // One row covers every parked status, because the destination is not in the
  // configuration at all: RETURN_TO_ORIGIN reads `parkedStageId`. That is why
  // there is no table here mapping each shortfall status back to a desk.
  {
    from: 'LTP_SHORTFALL_ACTION',
    action: 'RESUBMIT',
    fromStatus: null,
    to: null,
    toStatus: 'SHORTFALL_RESPONDED',
    allowedRoleKeys: ['LTP'],
    guards: ['has_remarks'],
    effects: [{ type: 'RECORD_RESOLUTION' }, { type: 'RETURN_TO_ORIGIN' }],
    notify: '',
    // The desk's clock picks up where it left off, with the days it had left.
    sla: 'RESUME',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// 4. Assignment rules
// ═══════════════════════════════════════════════════════════════════════════
//
// Who each desk's work is addressed to. ROLE_QUEUE everywhere by default: the
// task lands in a shared inbox and an officer claims it. Naming a person is a
// deliberate act (DIRECT), and spreading work automatically is another
// (LEAST_LOADED) — both are rows, so a department can change how it distributes
// work without anybody deploying anything.

const ASSIGNMENTS: Array<{
  stage: string;
  roleKey: string;
  strategy: 'ROLE_QUEUE' | 'LEAST_LOADED';
  priority: number;
  notes: string;
}> = [
  { stage: 'TPA_REVIEW', roleKey: 'TPA', strategy: 'ROLE_QUEUE', priority: 0, notes: 'Shared TPA inbox.' },
  { stage: 'ZAD_ZDD_REVIEW', roleKey: 'ZAD', strategy: 'ROLE_QUEUE', priority: 0, notes: 'ZAD and ZDD share this desk.' },
  { stage: 'ZJD_REVIEW', roleKey: 'ZJD', strategy: 'ROLE_QUEUE', priority: 5, notes: '' },
  { stage: 'DIRECTOR_DP_REVIEW', roleKey: 'DIRECTOR_DP', strategy: 'ROLE_QUEUE', priority: 10, notes: 'Senior desk — sorts above zonal work.' },
  { stage: 'ADDL_COMMISSIONER_REVIEW', roleKey: 'ADDL_COMMISSIONER', strategy: 'ROLE_QUEUE', priority: 15, notes: '' },
  { stage: 'COMMISSIONER_REVIEW', roleKey: 'COMMISSIONER', strategy: 'ROLE_QUEUE', priority: 20, notes: 'Approval decisions sort to the top.' },
  { stage: 'LTP_SHORTFALL_ACTION', roleKey: 'LTP', strategy: 'ROLE_QUEUE', priority: 0, notes: 'Addressed to the applicant who filed it.' },
];

// ═══════════════════════════════════════════════════════════════════════════
// Seeding
// ═══════════════════════════════════════════════════════════════════════════

export async function seedWorkflow(prisma: PrismaClient) {
  const workflow = await prisma.workflow.upsert({
    where: { code_version: { code: WORKFLOW_CODE, version: 1 } },
    create: {
      code: WORKFLOW_CODE,
      version: 1,
      name: 'Standard building permission workflow',
      description: 'TPA → ZAD/ZDD → ZJD → Director → Additional Commissioner → Commissioner.',
    },
    update: {
      name: 'Standard building permission workflow',
      description: 'TPA → ZAD/ZDD → ZJD → Director → Additional Commissioner → Commissioner.',
    },
  });

  // ── Stages ──────────────────────────────────────────────────────────────
  const stageIds = new Map<string, string>();

  for (const stage of STAGES) {
    const row = await prisma.workflowStage.upsert({
      where: { workflowId_code: { workflowId: workflow.id, code: stage.code } },
      create: {
        workflowId: workflow.id,
        code: stage.code,
        name: stage.name,
        type: stage.type,
        sequence: stage.sequence,
        ownerRoleKeys: stage.ownerRoleKeys,
        entryStatus: stage.entryStatus as never,
        workingStatus: (stage.workingStatus ?? null) as never,
        slaDays: stage.slaDays ?? 0,
        isEntry: stage.isEntry ?? false,
        isTerminal: stage.isTerminal ?? false,
        allowReassign: stage.allowReassign ?? true,
        description: stage.description,
      },
      update: {
        name: stage.name,
        type: stage.type,
        sequence: stage.sequence,
        ownerRoleKeys: stage.ownerRoleKeys,
        entryStatus: stage.entryStatus as never,
        workingStatus: (stage.workingStatus ?? null) as never,
        slaDays: stage.slaDays ?? 0,
        isEntry: stage.isEntry ?? false,
        isTerminal: stage.isTerminal ?? false,
        allowReassign: stage.allowReassign ?? true,
        description: stage.description,
        isActive: true,
      },
    });
    stageIds.set(stage.code, row.id);
  }

  // ── Actions ─────────────────────────────────────────────────────────────
  const actionIds = new Map<string, string>();

  for (const action of ACTIONS) {
    const row = await prisma.workflowAction.upsert({
      where: { code: action.code },
      create: {
        code: action.code,
        label: action.label,
        kind: action.kind,
        intent: action.intent,
        capabilityKey: action.capabilityKey,
        requiresRemarks: action.requiresRemarks,
        requiresAttachment: action.requiresAttachment ?? false,
        confirmText: action.confirmText ?? '',
        displayOrder: action.displayOrder,
      },
      update: {
        label: action.label,
        kind: action.kind,
        intent: action.intent,
        capabilityKey: action.capabilityKey,
        requiresRemarks: action.requiresRemarks,
        requiresAttachment: action.requiresAttachment ?? false,
        confirmText: action.confirmText ?? '',
        displayOrder: action.displayOrder,
        isActive: true,
      },
    });
    actionIds.set(action.code, row.id);
  }

  // ── Transitions ─────────────────────────────────────────────────────────
  //
  // Rows not in this seed are DEACTIVATED rather than deleted: a running
  // instance may have taken one, and its history row names it. Deleting the
  // row would leave that history referring to something that no longer exists.
  const seededTransitionIds: string[] = [];

  for (const t of TRANSITIONS) {
    const fromStageId = stageIds.get(t.from);
    const actionId = actionIds.get(t.action);
    if (!fromStageId || !actionId) {
      throw new Error(`Workflow seed: unknown stage or action in transition ${t.from} → ${t.action}`);
    }

    const data = {
      workflowId: workflow.id,
      fromStageId,
      actionId,
      fromStatus: (t.fromStatus ?? null) as never,
      toStageId: t.to ? (stageIds.get(t.to) ?? null) : null,
      toStatus: t.toStatus as never,
      allowedRoleKeys: t.allowedRoleKeys ?? [],
      guards: t.guards ?? [],
      effects: (t.effects ?? []) as never,
      notifyEvent: t.notify ?? '',
      slaBehavior: t.sla ?? 'NONE',
      isActive: true,
    };

    // `findFirst` then create/update rather than `upsert`: `fromStatus` is
    // nullable and Prisma refuses a null inside a composite unique key, which
    // is exactly the shape every "applies to any status" row has.
    const existing = await prisma.workflowTransition.findFirst({
      where: {
        workflowId: workflow.id,
        fromStageId,
        actionId,
        fromStatus: (t.fromStatus ?? null) as never,
      },
      select: { id: true },
    });

    const row = existing
      ? await prisma.workflowTransition.update({ where: { id: existing.id }, data })
      : await prisma.workflowTransition.create({ data });

    seededTransitionIds.push(row.id);
  }

  const { count: retired } = await prisma.workflowTransition.updateMany({
    where: { workflowId: workflow.id, id: { notIn: seededTransitionIds }, isActive: true },
    data: { isActive: false },
  });

  // ── SLA rules ───────────────────────────────────────────────────────────
  let slaRules = 0;
  for (const stage of STAGES) {
    if (!stage.slaDays) continue;
    const stageId = stageIds.get(stage.code)!;

    // Same nullable-composite-key limitation as the transitions above: the
    // general rule for a stage has no application type, so it is matched by
    // hand rather than through the unique key.
    const existing = await prisma.slaRule.findFirst({
      where: { workflowStageId: stageId, applicationTypeId: null },
      select: { id: true },
    });

    if (existing) {
      await prisma.slaRule.update({
        where: { id: existing.id },
        data: { days: stage.slaDays, isActive: true },
      });
    } else {
      await prisma.slaRule.create({
        data: {
          workflowStageId: stageId,
          days: stage.slaDays,
          calendar: 'WORKING_DAYS',
          warnAtPercent: 70,
          pauseOnShortfall: true,
        },
      });
    }
    slaRules += 1;
  }

  // ── Assignment rules ────────────────────────────────────────────────────
  for (const rule of ASSIGNMENTS) {
    const stageId = stageIds.get(rule.stage);
    if (!stageId) continue;

    // The unique key includes a nullable zone, so the "every zone" rule is
    // matched by hand — `upsert` cannot express a NULL in a composite key.
    const existing = await prisma.workflowAssignment.findFirst({
      where: { stageId, roleKey: rule.roleKey, zoneId: null },
      select: { id: true },
    });

    if (existing) {
      await prisma.workflowAssignment.update({
        where: { id: existing.id },
        data: { strategy: rule.strategy, priority: rule.priority, notes: rule.notes, isActive: true },
      });
    } else {
      await prisma.workflowAssignment.create({
        data: {
          workflowId: workflow.id,
          stageId,
          roleKey: rule.roleKey,
          strategy: rule.strategy,
          priority: rule.priority,
          notes: rule.notes,
        },
      });
    }
  }

  // ── Validate, then publish ──────────────────────────────────────────────
  //
  // The seed publishes ONLY a workflow that validates. A graph with a dead end
  // or an unknown guard stays unpublished, and `startWorkflow` refuses to route
  // applications through an unpublished workflow — so the failure is a clear
  // refusal at the gate rather than a file stuck at a desk with no way out.
  const { validateWorkflow } = await import('../../src/server/workflow/validate');
  const report = await validateWorkflow(prisma, workflow.id);

  if (report.valid) {
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { isPublished: true, publishedAt: new Date() },
    });
  } else {
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { isPublished: false },
    });
  }

  return {
    stages: STAGES.length,
    actions: ACTIONS.length,
    transitions: TRANSITIONS.length,
    retired,
    slaRules,
    assignments: ASSIGNMENTS.length,
    published: report.valid,
    issues: report.issues,
  };
}
