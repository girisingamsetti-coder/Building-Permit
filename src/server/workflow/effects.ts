import 'server-only';
import type { Tx } from '@/server/db/prisma';
import type { AuthUser } from '@/server/auth/context';
import { businessRule, guardFailed } from '@/server/http/errors';
import { enqueue, JOB_TYPES } from '@/server/jobs/queue';
import {
  raiseShortfall,
  reviewResolution,
  settleShortfall,
  submitResolution,
} from '@/server/shortfalls/engine';
import { EFFECTS, type EffectSpec } from '@/lib/workflow';
import { CLOSED_SHORTFALL_STATUSES } from '@/lib/constants';
import { SHORTFALL_STATUS } from '@/lib/shortfalls';

/**
 * The effect registry — what a transition DOES, beyond moving the file.
 *
 * Effects run in the order the transition lists them, inside the transition's
 * transaction, after every guard has passed. One throwing abandons the whole
 * transition: no shortfall, no demand, no history row, no moved file.
 *
 * ── Effects may change where the file goes ───────────────────────────────
 *
 * `RETURN_TO_ORIGIN` is the reason this is not a list of side-effects but a
 * pipeline with a mutable destination. A transition out of the shortfall stage
 * cannot name its destination in configuration, because the destination is
 * wherever the file was parked — which is different for every application. The
 * effect writes `ctx.toStageId`, and the engine routes to whatever the effects
 * left there.
 *
 * That single mechanism is what keeps "return to the LTP, then back to
 * whoever raised it" out of the code. There is no map of raising stage to
 * resume stage anywhere in this repository; there is one nullable column,
 * `workflow_instances.parkedStageId`, and one effect that reads it.
 */

export type EffectContext = {
  tx: Tx;
  actor: Pick<AuthUser, 'id' | 'name'> & { roleKeys?: string[] };
  now: Date;
  meta: { ip: string; userAgent: string; correlationId?: string };

  application: {
    id: string;
    applicationNumber: string;
    applicationTypeId: string;
    status: string;
    zoneId: string | null;
    ltpUserId: string;
  };

  instance: { id: string; currentStageId: string | null; parkedStageId: string | null };

  /** The stage the file is leaving. */
  fromStage: { id: string; code: string; name: string };

  /** What the actor supplied. */
  input: {
    remarks: string;
    attachments: Array<Record<string, unknown>>;
    shortfall?: {
      title?: string;
      description?: string;
      /** What the applicant must DO. Goes in the SMS. */
      requiredAction?: string;
      dueDate?: string | null;
      items?: Array<{ description: string; amount?: number | null; documentTypeId?: string | null }>;
    };
    shortfallId?: string;
  };

  // ── Mutable outputs, read by the engine once every effect has run ──────
  toStageId: string | null;
  toStatus: string;
  parkedStageId: string | null;
  /** Overrides the transition's own slaBehavior when an effect must. */
  slaBehaviour: string | null;
  /** What happened, recorded verbatim on the history row. */
  applied: Array<Record<string, unknown>>;
  /** Shortfalls opened by this transition, linked to the history row after. */
  raisedShortfallIds: string[];
  /** Set by CLOSE_WORKFLOW. */
  closeAs: 'COMPLETED' | 'CANCELLED' | null;
};

export type Effect = (ctx: EffectContext, spec: EffectSpec) => Promise<void>;

const REGISTRY: Record<string, Effect> = {
  // ── RAISE_SHORTFALL ────────────────────────────────────────────────────
  //
  // The one code path that can create a shortfall. Raising one is an effect of
  // a transition and nothing else — there is no "create shortfall" endpoint,
  // which is what makes every shortfall in the system provably attached to a
  // recorded decision by a named officer at a named stage.
  //
  // The work itself belongs to the shortfall engine: numbering, the state
  // machine, the counter, the demand, the timeline, the audit row and the
  // notification are ONE implementation, whichever door a shortfall came
  // through. What stays here is the only part that is about the WORKFLOW —
  // that a blocking shortfall parks the file at this stage.

  [EFFECTS.RAISE_SHORTFALL]: async (ctx, spec) => {
    const kind = String(spec.kind ?? 'DOCUMENT');
    const mode = String(spec.mode ?? 'BLOCKING');

    const raised = await raiseShortfall(ctx.tx, {
      application: ctx.application,
      kind,
      mode,
      stageCode: ctx.fromStage.code,
      actor: ctx.actor,
      title: ctx.input.shortfall?.title,
      description: (ctx.input.shortfall?.description ?? ctx.input.remarks).trim(),
      requiredAction: ctx.input.shortfall?.requiredAction,
      dueDate: ctx.input.shortfall?.dueDate ? new Date(ctx.input.shortfall.dueDate) : null,
      items: ctx.input.shortfall?.items ?? [],
      // A fee shortfall raises its demand in the same statement. Splitting the
      // two allowed a shortfall demanding money with no demand behind it.
      withDemand: kind === 'FEE',
      now: ctx.now,
      meta: ctx.meta,
    });

    ctx.raisedShortfallIds.push(raised.id);

    // BLOCKING parks the file. The stage it is parked AT is where it resumes,
    // and it is recorded here rather than derived later — by the time the
    // applicant answers, days have passed and the officer who raised it may
    // have been reassigned.
    if (mode === 'BLOCKING') {
      ctx.parkedStageId = ctx.fromStage.id;
    }

    ctx.applied.push({
      type: EFFECTS.RAISE_SHORTFALL,
      kind,
      mode,
      shortfallId: raised.id,
      shortfallNumber: raised.shortfallNumber,
      items: (ctx.input.shortfall?.items ?? []).length,
      ...(raised.demand
        ? { demandNumber: raised.demand.demandNumber, total: raised.demand.totalAmount }
        : {}),
    });
  },

  // ── GENERATE_FEE_DEMAND ────────────────────────────────────────────────
  //
  // Kept as a named effect because the seed and the documentation both refer
  // to it, but the demand is now raised INSIDE `raiseShortfall`. Two effects
  // meant two moments at which a fee shortfall could exist without a demand
  // behind it, and the second was reachable: any transition that listed
  // RAISE_SHORTFALL and forgot this one produced a shortfall demanding money
  // that nobody could pay.
  //
  // So it verifies rather than acts, and fails loudly if the invariant it is
  // checking has been broken by configuration.

  [EFFECTS.GENERATE_FEE_DEMAND]: async (ctx, spec) => {
    const type = String(spec.demandType ?? 'SHORTFALL');

    if (type !== 'SHORTFALL') {
      // ORIGINAL demands are raised by the fee engine at the documents gate,
      // where the schedule decides every figure. A transition asking for one
      // would be configuration reaching into a calculation it cannot see.
      throw businessRule(`The workflow can only raise SHORTFALL demands, not ${type}.`);
    }

    const shortfallId = ctx.raisedShortfallIds.at(-1);
    if (!shortfallId) {
      throw businessRule('A fee demand can only be raised alongside the shortfall that justifies it.');
    }

    const demand = await ctx.tx.applicationFee.findFirst({
      where: { raisedByShortfallId: shortfallId },
      select: { id: true, demandNumber: true, totalAmount: true },
    });

    if (!demand) {
      throw businessRule(
        'This action is configured to raise a fee demand, but the shortfall it raised was not a fee ' +
          'shortfall. An administrator must correct the workflow.'
      );
    }

    ctx.applied.push({
      type: EFFECTS.GENERATE_FEE_DEMAND,
      demandType: type,
      applicationFeeId: demand.id,
      demandNumber: demand.demandNumber,
      total: demand.totalAmount.toFixed(2),
    });
  },

  // ── RECORD_RESOLUTION ──────────────────────────────────────────────────

  [EFFECTS.RECORD_RESOLUTION]: async (ctx) => {
    const targets = await targetShortfalls(ctx, { mode: 'BLOCKING' });

    if (!targets.length) {
      throw guardFailed('There is no open shortfall on this application to respond to.');
    }

    for (const target of targets) {
      await submitResolution(ctx.tx, {
        shortfallId: target.id,
        actor: ctx.actor,
        response: ctx.input.remarks,
        attachments: ctx.input.attachments,
        now: ctx.now,
        meta: ctx.meta,
      });
    }

    ctx.applied.push({
      type: EFFECTS.RECORD_RESOLUTION,
      shortfalls: targets.map((t) => t.shortfallNumber),
      attachments: ctx.input.attachments.length,
    });
  },

  // ── RESOLVE_SHORTFALL ──────────────────────────────────────────────────
  //
  // `mode` in the spec chooses which: BLOCKING (the default) for the parked
  // file whose answer an officer has just accepted, REPORTED for one that
  // travelled here with the file, ANY for both. An explicit `shortfallId` from
  // the actor beats all of it, which is how a file carrying several is settled
  // one at a time.

  [EFFECTS.RESOLVE_SHORTFALL]: async (ctx, spec) => {
    const targets = await targetShortfalls(ctx, { mode: String(spec.mode ?? 'BLOCKING') });

    if (!targets.length) throw guardFailed('There is no open shortfall to close.');

    for (const target of targets) {
      // A response awaiting a verdict is ACCEPTED; a shortfall with none is
      // SETTLED. The two are different acts and the record says which — the
      // difference is whether an applicant answered, and reading it from the
      // data means one effect covers the blocking and reported cases without
      // the configuration having to say which it is.
      const answered = await ctx.tx.shortfallResolution.count({
        where: { shortfallId: target.id, reviewedAt: null },
      });

      if (answered > 0) {
        await reviewResolution(ctx.tx, {
          shortfallId: target.id,
          actor: ctx.actor,
          accept: true,
          remarks: ctx.input.remarks,
          now: ctx.now,
          meta: ctx.meta,
        });
      } else {
        await settleShortfall(ctx.tx, {
          shortfallId: target.id,
          actor: ctx.actor,
          remarks: ctx.input.remarks,
          now: ctx.now,
          meta: ctx.meta,
        });
      }
    }

    ctx.applied.push({
      type: EFFECTS.RESOLVE_SHORTFALL,
      shortfalls: targets.map((t) => t.shortfallNumber),
    });
  },

  // ── REJECT_RESOLUTION ──────────────────────────────────────────────────
  //
  // The answer was not good enough. The shortfall STAYS OPEN and the file goes
  // back to the applicant — both attempts remain on the record.

  [EFFECTS.REJECT_RESOLUTION]: async (ctx) => {
    const targets = await targetShortfalls(ctx, { mode: 'ANY', answeredOnly: true });

    if (!targets.length) throw guardFailed('There is no response awaiting a decision.');

    for (const target of targets) {
      await reviewResolution(ctx.tx, {
        shortfallId: target.id,
        actor: ctx.actor,
        accept: false,
        remarks: ctx.input.remarks,
        now: ctx.now,
        meta: ctx.meta,
      });
    }

    // The file goes back to the applicant, so it is parked again — at THIS
    // desk, which is the one that will judge the next attempt. Re-parking here
    // rather than in configuration is what makes a second rejection behave
    // exactly like the first.
    ctx.parkedStageId = ctx.fromStage.id;

    ctx.applied.push({
      type: EFFECTS.REJECT_RESOLUTION,
      shortfalls: targets.map((t) => t.shortfallNumber),
    });
  },

  // ── RETURN_TO_ORIGIN ───────────────────────────────────────────────────

  /**
   * Sends the file back to the desk it was parked at.
   *
   * THIS IS WHAT MAKES THE RETURN PATH CONFIGURABLE. There is no map from
   * raising stage to resuming stage anywhere in this repository — there is one
   * nullable column, `workflow_instances.parkedStageId`, written when the
   * shortfall was raised and read here.
   *
   * The STATUS is left to the transition unless the spec asks otherwise, so an
   * answered shortfall can arrive back at the officer's desk reading
   * "Shortfall responded" rather than as though nothing had happened. Passing
   * `status: "WORKING"` or `"ENTRY"` takes the parked stage's own instead.
   */
  [EFFECTS.RETURN_TO_ORIGIN]: async (ctx, spec) => {
    const parked = ctx.instance.parkedStageId;
    if (!parked) {
      throw guardFailed('This application is not parked, so there is nowhere to return it to.');
    }

    const stage = await ctx.tx.workflowStage.findUniqueOrThrow({
      where: { id: parked },
      select: { id: true, code: true, workingStatus: true, entryStatus: true },
    });

    ctx.toStageId = stage.id;

    const status = String(spec.status ?? '');
    if (status === 'WORKING') ctx.toStatus = stage.workingStatus ?? stage.entryStatus;
    else if (status === 'ENTRY') ctx.toStatus = stage.entryStatus;

    ctx.parkedStageId = null;

    ctx.applied.push({ type: EFFECTS.RETURN_TO_ORIGIN, toStageCode: stage.code, toStatus: ctx.toStatus });
  },

  // ── GENERATE_APPROVAL_ORDER ────────────────────────────────────────────

  [EFFECTS.GENERATE_APPROVAL_ORDER]: async (ctx) => {
    // Enqueued rather than rendered inline: the order carries a PDF, and a
    // approval must not fail because a renderer was slow. The row is created
    // by the job, which is idempotent on the application id.
    await enqueue(ctx.tx, {
      type: JOB_TYPES.RENDER_APPROVAL_ORDER,
      payload: { applicationId: ctx.application.id, issuedById: ctx.actor.id },
      dedupeKey: `approval-order:${ctx.application.id}`,
    });

    ctx.applied.push({ type: EFFECTS.GENERATE_APPROVAL_ORDER, queued: true });
  },

  // ── CLOSE_WORKFLOW ─────────────────────────────────────────────────────

  [EFFECTS.CLOSE_WORKFLOW]: async (ctx, spec) => {
    ctx.closeAs = String(spec.status ?? 'COMPLETED') === 'CANCELLED' ? 'CANCELLED' : 'COMPLETED';
    ctx.applied.push({ type: EFFECTS.CLOSE_WORKFLOW, status: ctx.closeAs, outcome: spec.status ?? '' });
  },
};

/**
 * Which shortfalls this action is about.
 *
 * An explicit `shortfallId` from the actor always wins — that is how a file
 * carrying three of them is settled one at a time from the shortfall page.
 * Without one, the transition's own `mode` decides, which is what makes
 * ACCEPT_RESOLUTION (blocking) and RESOLVE_REPORTED_SHORTFALL (reported) two
 * configurations of one effect rather than two effects.
 */
async function targetShortfalls(
  ctx: EffectContext,
  options: { mode: string; answeredOnly?: boolean }
): Promise<Array<{ id: string; shortfallNumber: string }>> {
  return ctx.tx.shortfall.findMany({
    where: {
      applicationId: ctx.application.id,
      status: options.answeredOnly
        ? { in: [SHORTFALL_STATUS.RESOLUTION_SUBMITTED, SHORTFALL_STATUS.UNDER_REVIEW] }
        : { notIn: [...CLOSED_SHORTFALL_STATUSES] },
      ...(ctx.input.shortfallId
        ? { id: ctx.input.shortfallId }
        : options.mode === 'ANY'
          ? {}
          : { mode: options.mode as never }),
    },
    orderBy: { raisedAt: 'asc' },
    select: { id: true, shortfallNumber: true },
  });
}

export const isKnownEffect = (type: string): boolean => type in REGISTRY;

export const effectNames = (): string[] => Object.keys(REGISTRY).sort();

/**
 * Runs a transition's effects in order.
 *
 * An unknown effect type THROWS. The alternative — skipping it — would let a
 * transition configured to raise a shortfall quietly move the file without
 * raising one, and nothing downstream would notice.
 */
export async function applyEffects(ctx: EffectContext, specs: EffectSpec[]): Promise<void> {
  for (const spec of specs) {
    const effect = REGISTRY[String(spec.type)];
    if (!effect) {
      throw businessRule(
        `This action is configured with an unknown effect (${spec.type}) and cannot be performed. ` +
          'An administrator must correct the workflow.'
      );
    }
    await effect(ctx, spec);
  }
}
