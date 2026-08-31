import 'server-only';
import type { Tx } from '@/server/db/prisma';
import { documentsComplete } from '@/server/services/documents';
import { GUARDS } from '@/lib/workflow';
import { CLOSED_SHORTFALL_STATUSES } from '@/lib/constants';
import { SHORTFALL_STATUS } from '@/lib/shortfalls';

/**
 * The guard registry.
 *
 * A guard is a PURE QUESTION about the application, asked before anything is
 * written. Every one of them is evaluated inside the transition's transaction
 * and a single failure abandons it whole — so a refused action leaves no
 * shortfall, no task, no history row and no half-moved file.
 *
 * ── Two properties worth stating ─────────────────────────────────────────
 *
 * A guard NEVER writes. Not a status, not a counter, not a log line. That is
 * what makes it safe to evaluate the same guards again when the UI asks which
 * actions are available — the officer's action bar runs exactly the checks the
 * POST will run, which is why a button that is offered cannot then be refused.
 *
 * A guard's failure MESSAGE is written for the officer, and names the thing to
 * do about it. "3 mandatory documents are still missing" tells someone what
 * happens next; "guard documents_complete failed" tells them to ring support.
 */

export type GuardContext = {
  tx: Tx;
  application: {
    id: string;
    status: string;
    applicationTypeId: string;
    zoneId: string | null;
    openShortfalls: number;
  };
  /** What the actor supplied with the action. */
  input: { remarks: string; attachments: unknown[] };
};

export type GuardResult = { passed: boolean; message: string };

export type Guard = (ctx: GuardContext) => Promise<GuardResult> | GuardResult;

const ok: GuardResult = { passed: true, message: '' };
const no = (message: string): GuardResult => ({ passed: false, message });

const REGISTRY: Record<string, Guard> = {
  // ── Drawing and scrutiny ───────────────────────────────────────────────

  [GUARDS.DRAWING_UPLOADED]: async ({ tx, application }) => {
    const count = await tx.drawingVersion.count({
      where: { isActive: true, drawing: { applicationId: application.id } },
    });
    return count > 0 ? ok : no('No drawing has been uploaded yet.');
  },

  [GUARDS.SCRUTINY_PASSED]: async ({ tx, application }) => {
    // The LATEST result on an ACTIVE version. Asking merely whether a PASS
    // exists anywhere would let a passed version be superseded by a failing
    // one and still satisfy the gate.
    const latest = await tx.scrutinyResult.findFirst({
      where: {
        request: {
          drawingVersion: { isActive: true, drawing: { applicationId: application.id } },
        },
      },
      orderBy: { evaluatedAt: 'desc' },
      select: { outcome: true },
    });

    if (!latest) return no('The drawing has not been scrutinised yet.');
    return latest.outcome === 'PASS'
      ? ok
      : no('The current drawing did not pass scrutiny. A corrected version must be uploaded.');
  },

  // ── Documents ──────────────────────────────────────────────────────────

  [GUARDS.DOCUMENTS_COMPLETE]: async ({ tx, application }) => {
    // The same function the checklist screen and the fee engine call, so what
    // an applicant sees and what blocks them cannot disagree.
    const { complete, missing } = await documentsComplete(application.id, tx);
    if (complete) return ok;

    const names = missing.slice(0, 3).map((m) => m.name).join(', ');
    const more = missing.length > 3 ? ` and ${missing.length - 3} more` : '';
    return no(
      `${missing.length} mandatory ${missing.length === 1 ? 'document is' : 'documents are'} still missing: ${names}${more}.`
    );
  },

  // ── Money ──────────────────────────────────────────────────────────────

  [GUARDS.FEE_DEMAND_ISSUED]: async ({ tx, application }) => {
    const count = await tx.applicationFee.count({
      where: {
        applicationId: application.id,
        type: 'ORIGINAL',
        status: { in: ['ISSUED', 'PARTIALLY_PAID', 'PAID'] },
      },
    });
    return count > 0 ? ok : no('No fee demand has been raised for this application.');
  },

  /**
   * Every demand settled.
   *
   * Expressed as "nothing is outstanding" rather than "the original is paid",
   * because a shortfall demand raised at ZJD is exactly as payable as the
   * original and an approval must not be able to step over it.
   */
  [GUARDS.FEES_PAID]: async ({ tx, application }) => {
    const outstanding = await tx.applicationFee.findMany({
      where: {
        applicationId: application.id,
        status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
      },
      select: { demandNumber: true, totalAmount: true, paidAmount: true },
    });

    if (!outstanding.length) return ok;

    const due = outstanding.reduce((sum, d) => sum + d.totalAmount.minus(d.paidAmount).toNumber(), 0);
    return no(
      `${outstanding.length} ${outstanding.length === 1 ? 'demand is' : 'demands are'} unpaid — ` +
        `${due.toFixed(2)} outstanding.`
    );
  },

  // ── Shortfalls ─────────────────────────────────────────────────────────

  [GUARDS.NO_OPEN_BLOCKING_SHORTFALLS]: async ({ tx, application }) => {
    const count = await tx.shortfall.count({
      where: {
        applicationId: application.id,
        mode: 'BLOCKING',
        status: { notIn: [...CLOSED_SHORTFALL_STATUSES] },
      },
    });
    return count === 0
      ? ok
      : no(`${count} blocking ${count === 1 ? 'shortfall is' : 'shortfalls are'} still open.`);
  },

  /**
   * THE approval guard. Absolute, and with no override anywhere in the system.
   *
   * Counts every open shortfall regardless of kind and regardless of mode — a
   * shortfall that was merely REPORTED and forwarded travels with the file and
   * still blocks approval, which is the entire difference between reporting
   * one and approving past it. See docs/03-workflow.md F.5.1.
   *
   * The live COUNT is deliberate: `applications.openShortfalls` is a cache,
   * and a cache must never be the thing that authorises an approval.
   */
  [GUARDS.NO_OPEN_SHORTFALLS]: async ({ tx, application }) => {
    const open = await tx.shortfall.findMany({
      where: { applicationId: application.id, status: { notIn: [...CLOSED_SHORTFALL_STATUSES] } },
      select: { shortfallNumber: true, kind: true, mode: true },
    });

    if (!open.length) return ok;

    const reported = open.filter((s) => s.mode === 'REPORTED').length;
    const detail = reported
      ? ` (${reported} of them reported and carried forward, which does not settle them)`
      : '';

    return no(
      `${open.length} ${open.length === 1 ? 'shortfall is' : 'shortfalls are'} still open${detail}. ` +
        'These must be resolved before the application can be approved.'
    );
  },

  /**
   * There is something for the officer to accept or reject.
   *
   * Without this, ACCEPT_RESOLUTION could resume a parked file that the
   * applicant has not answered — the officer would be accepting nothing, and
   * the shortfall would close with no response recorded against it.
   */
  [GUARDS.SHORTFALL_AWAITING_REVIEW]: async ({ tx, application }) => {
    const count = await tx.shortfall.count({
      where: {
        applicationId: application.id,
        status: {
          in: [SHORTFALL_STATUS.RESOLUTION_SUBMITTED, SHORTFALL_STATUS.UNDER_REVIEW],
        },
        resolutions: { some: { reviewedAt: null } },
      },
    });
    return count > 0 ? ok : no('The applicant has not responded to the shortfall yet.');
  },

  /**
   * There is a reported shortfall on this file to close.
   *
   * Distinct from `shortfall_awaiting_review`, which asks about a PARKED file
   * the applicant has answered. This one asks about a shortfall that travelled
   * here with the file — nobody parked anything, and the officer holding it
   * now is the one who can settle it.
   */
  [GUARDS.REPORTED_SHORTFALL_OPEN]: async ({ tx, application }) => {
    const count = await tx.shortfall.count({
      where: {
        applicationId: application.id,
        mode: 'REPORTED',
        status: { notIn: [...CLOSED_SHORTFALL_STATUSES] },
      },
    });
    return count > 0 ? ok : no('There is no reported shortfall on this application to close.');
  },

  // ── The action itself ──────────────────────────────────────────────────

  [GUARDS.HAS_REMARKS]: ({ input }) =>
    input.remarks.trim().length > 0 ? ok : no('Remarks are required for this action.'),

  [GUARDS.HAS_ATTACHMENT]: ({ input }) =>
    input.attachments.length > 0 ? ok : no('At least one attachment is required for this action.'),

  /**
   * Informational, and deliberately always true.
   *
   * It exists so a transition CAN be annotated with the SLA question without
   * that annotation ever blocking anybody: passing a due date has no legal
   * effect in this system, and a guard that quietly acquired one would be a
   * significant change of policy made by editing a configuration row.
   * See docs/07-subsystems.md R.1.1.
   */
  [GUARDS.SLA_NOT_OVERDUE]: () => ok,
};

/**
 * Guards that answer "does this action APPLY here?" rather than "is the file
 * ready for it?".
 *
 * The distinction decides what an officer sees. A failing readiness guard is
 * worth showing — "Approve · 3 shortfalls are still open" tells somebody what
 * to do next, and hiding it would leave them wondering whether the system can
 * approve at all. A failing applicability guard is not: a permanently disabled
 * "Close reported shortfall" on every file that has never had one is furniture,
 * and furniture is what teaches people to stop reading the action bar.
 *
 * Declared here, next to the guards themselves, so adding a guard means
 * deciding which kind it is rather than discovering the answer in the UI.
 */
const APPLICABILITY_GUARDS = new Set<string>([
  GUARDS.SHORTFALL_AWAITING_REVIEW,
  GUARDS.REPORTED_SHORTFALL_OPEN,
]);

export const isApplicabilityGuard = (name: string): boolean => APPLICABILITY_GUARDS.has(name);

export const isKnownGuard = (name: string): boolean => name in REGISTRY;

export const guardNames = (): string[] => Object.keys(REGISTRY).sort();

/**
 * Evaluates one guard by name.
 *
 * An unknown name FAILS rather than passing. A transition referring to a guard
 * the engine does not implement is a configuration error, and the safe reading
 * of "I do not know whether this is allowed" is "no".
 */
export async function evaluateGuard(name: string, ctx: GuardContext): Promise<GuardResult> {
  const guard = REGISTRY[name];
  if (!guard) {
    return no(`This action is configured with an unknown condition (${name}) and cannot be performed.`);
  }
  return guard(ctx);
}

export type GuardEvaluation = { name: string; passed: boolean; message: string };

/** Evaluates every guard on a transition, in order, and reports all of them. */
export async function evaluateGuards(names: string[], ctx: GuardContext): Promise<GuardEvaluation[]> {
  const results: GuardEvaluation[] = [];
  for (const name of names) {
    const { passed, message } = await evaluateGuard(name, ctx);
    results.push({ name, passed, message });
  }
  return results;
}
