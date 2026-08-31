import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma, type Db, type Tx } from '@/server/db/prisma';
import { applicationScope } from '@/server/auth/scope';
import { can, type AuthUser } from '@/server/auth/context';
import { audit } from './audit';
import { emit, EVENTS } from '@/server/events/outbox';
import { recordEvent, EVENT_TYPES } from './timeline';
import { documentsComplete } from './documents';
import { nextSequence, formatNumber } from './numbering';
import { settingNumber, settingString } from './settings';
import { calculateFee, type Calculation, type FeeContext, type StructureSpec } from './fee-calculator';
import { businessRule, conflict, forbidden, guardFailed, notFound } from '@/server/http/errors';
import { CAPABILITIES } from '@/lib/constants';
import { canGenerateFee, whyCannotGenerateFee, isLiveDemand } from '@/lib/fees';
import { isUuid } from '@/lib/utils';

/**
 * The fee engine — docs/07-subsystems.md N.
 *
 * ── The rule that shapes this file ─────────────────────────────────────
 *
 * A FEE IS CALCULATED ONCE, AT DEMAND TIME, AND THEN FROZEN. Rates change;
 * issued demands do not. That is not a nicety — a demand is a statement of
 * what somebody owes, and a system that quietly recomputes it whenever an
 * administrator edits a rate cannot answer the only question that matters
 * afterwards: "why was I charged this?"
 *
 * So an issued demand carries everything needed to explain itself with no
 * reference to current configuration:
 *
 *   feeStructureId + version + code   which schedule, by identity AND by name
 *   roundingRule                      the rounding then in force
 *   calculationInputs                 every variable value used
 *   fee_line_items                    each component with its basis, variable,
 *                                     quantity, rate, raw amount and note
 *
 * `getFees` therefore reads the demand, never the calculator. The calculator
 * is used for exactly two things: a PREVIEW, which persists nothing, and the
 * single moment a demand is generated.
 *
 * ── And no amount lives in code ────────────────────────────────────────
 *
 * Not here, not in src/lib, not in src/features. Every number came out of
 * `fee_structures` and its children. Search this file for a rupee figure and
 * there is none to find.
 */

type Meta = { ip: string; userAgent: string; correlationId?: string };

const DEFAULT_DEMAND_FORMAT = '{prefix}/{year}/{seq:6}';

// ═══════════════════════════════════════════════════════════════════════════
// Loading the application
// ═══════════════════════════════════════════════════════════════════════════

const APPLICATION_SELECT = {
  id: true,
  applicationNumber: true,
  status: true,
  ltpUserId: true,
  applicationTypeId: true,
  applicationType: { select: { id: true, code: true, name: true, numberPrefix: true } },
  zone: { select: { code: true, name: true } },
  property: true,
  building: true,
} satisfies Prisma.ApplicationSelect;

type ApplicationRow = Prisma.ApplicationGetPayload<{ select: typeof APPLICATION_SELECT }>;

async function requireApplication(
  user: AuthUser,
  applicationId: string,
  db: Db = prisma
): Promise<ApplicationRow> {
  if (!isUuid(applicationId)) throw notFound('That application could not be found.');

  const app = await db.application.findFirst({
    where: { id: applicationId, deletedAt: null, ...applicationScope(user) },
    select: APPLICATION_SELECT,
  });

  if (!app) throw notFound('That application could not be found.');
  return app;
}

// ═══════════════════════════════════════════════════════════════════════════
// Context
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The whitelisted variable set — docs N.3.
 *
 * Every key is present on every application, with a defined value, even when
 * the underlying particular has not been entered. A missing key would make a
 * formula fail at demand time for one applicant and not another; a zero is a
 * visible, explainable input that shows up in `calculationInputs` on the
 * demand, where anybody auditing it can see exactly what was used.
 */
export function buildFeeContext(app: ApplicationRow): FeeContext {
  const property = app.property;
  const building = app.building;

  return {
    plotAreaSqm: building?.plotAreaSqm ?? property?.plotAreaSqm ?? 0,
    builtUpAreaSqm: building?.builtUpAreaSqm ?? 0,
    floorAreaSqm: building?.floorAreaSqm ?? 0,
    coverageAreaSqm: building?.coverageAreaSqm ?? 0,
    parkingAreaSqm: building?.parkingAreaSqm ?? 0,
    numFloors: building?.numFloors ?? 0,
    numBasements: building?.numBasements ?? 0,
    numDwellingUnits: building?.numDwellingUnits ?? 0,
    buildingHeightM: building?.buildingHeightM ?? 0,
    achievedFar: building?.achievedFar ?? 0,
    achievedCoverage: building?.achievedCoverage ?? 0,
    roadWidthM: property?.roadWidthM ?? 0,
    landUseZone: property?.landUseZone ?? '',
    buildingUse: building?.buildingUse ?? '',
    occupancyType: building?.occupancyType ?? '',
    structureType: building?.structureType ?? '',
    tenureType: property?.tenureType ?? '',
    applicationTypeCode: app.applicationType?.code ?? '',
    zoneCode: app.zone?.code ?? '',
    district: property?.district ?? '',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Structure resolution
// ═══════════════════════════════════════════════════════════════════════════

const STRUCTURE_SELECT = {
  id: true,
  code: true,
  name: true,
  version: true,
  roundingRule: true,
  isPlaceholder: true,
  effectiveFrom: true,
  effectiveTo: true,
  applicationTypeId: true,
  notes: true,
  components: {
    where: { isActive: true },
    orderBy: { displayOrder: 'asc' },
    select: {
      id: true,
      code: true,
      name: true,
      headOfAccount: true,
      basis: true,
      rate: true,
      variable: true,
      percentOfCode: true,
      expression: true,
      minAmount: true,
      maxAmount: true,
      condition: true,
      displayOrder: true,
      isActive: true,
      slabs: {
        orderBy: { fromValue: 'asc' },
        select: {
          fromValue: true,
          toValue: true,
          rate: true,
          flatAmount: true,
          displayOrder: true,
        },
      },
    },
  },
  rules: {
    where: { isActive: true },
    orderBy: { displayOrder: 'asc' },
    select: {
      id: true,
      code: true,
      name: true,
      kind: true,
      basis: true,
      rate: true,
      appliesToCode: true,
      minAmount: true,
      maxAmount: true,
      condition: true,
      reason: true,
      displayOrder: true,
      isActive: true,
    },
  },
} satisfies Prisma.FeeStructureSelect;

type StructureRow = Prisma.FeeStructureGetPayload<{ select: typeof STRUCTURE_SELECT }>;

/**
 * The structure in force for an application type ON A GIVEN DATE.
 *
 * Effective-dated and versioned: `effectiveFrom <= date < effectiveTo`. A
 * structure scoped to the application type wins over a general one, and among
 * equals the most recently effective wins — so publishing a revision is a new
 * row with a later `effectiveFrom`, never an edit to the row that issued
 * demands last month.
 *
 * The date argument exists so that re-explaining a historical demand is a
 * call with the demand's own date, not a special code path.
 */
export async function resolveStructure(
  applicationTypeId: string,
  at: Date = new Date(),
  db: Db = prisma
): Promise<StructureRow | null> {
  const candidates = await db.feeStructure.findMany({
    where: {
      isActive: true,
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
      AND: [{ OR: [{ applicationTypeId }, { applicationTypeId: null }] }],
    },
    select: STRUCTURE_SELECT,
    orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }],
  });

  if (!candidates.length) return null;

  // A schedule written for this application type is more specific than a
  // general one and takes precedence, however recent the general one is.
  return candidates.find((c) => c.applicationTypeId === applicationTypeId) ?? candidates[0]!;
}

/** Prisma row → the calculator's plain input. Decimals become numbers here. */
function toSpec(structure: StructureRow): StructureSpec {
  return {
    id: structure.id,
    code: structure.code,
    name: structure.name,
    version: structure.version,
    roundingRule: structure.roundingRule,
    isPlaceholder: structure.isPlaceholder,
    components: structure.components.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      headOfAccount: c.headOfAccount,
      basis: c.basis,
      rate: c.rate === null ? null : c.rate.toNumber(),
      variable: c.variable,
      percentOfCode: c.percentOfCode,
      expression: c.expression,
      minAmount: c.minAmount === null ? null : c.minAmount.toNumber(),
      maxAmount: c.maxAmount === null ? null : c.maxAmount.toNumber(),
      condition: c.condition,
      displayOrder: c.displayOrder,
      isActive: c.isActive,
      slabs: c.slabs.map((s) => ({
        fromValue: s.fromValue.toNumber(),
        toValue: s.toValue === null ? null : s.toValue.toNumber(),
        rate: s.rate.toNumber(),
        flatAmount: s.flatAmount === null ? null : s.flatAmount.toNumber(),
        displayOrder: s.displayOrder,
      })),
    })),
    rules: structure.rules.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      kind: r.kind,
      basis: r.basis as 'FLAT' | 'PERCENTAGE',
      rate: r.rate === null ? null : r.rate.toNumber(),
      appliesToCode: r.appliesToCode,
      minAmount: r.minAmount === null ? null : r.minAmount.toNumber(),
      maxAmount: r.maxAmount === null ? null : r.maxAmount.toNumber(),
      condition: r.condition,
      reason: r.reason,
      displayOrder: r.displayOrder,
      isActive: r.isActive,
    })),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Preview
// ═══════════════════════════════════════════════════════════════════════════

export type FeePreview = {
  application: { id: string; applicationNumber: string; status: string };
  calculation: Calculation;
  /** Whether generating it right now would be permitted, and why not. */
  eligible: boolean;
  blockedReason: string | null;
  documents: { complete: boolean; missing: Array<{ code: string; name: string; reason: string }>; required: number };
};

/**
 * What the demand WOULD be. Persists nothing.
 *
 * The LTP sees this before anything is issued, which matters: a fee is the
 * point at which an applicant discovers what the permission costs, and
 * discovering it only after an irreversible demand has been raised against
 * them is the wrong order.
 */
export async function previewFee(user: AuthUser, applicationId: string): Promise<FeePreview> {
  const app = await requireApplication(user, applicationId);

  const structure = await resolveStructure(app.applicationTypeId);
  if (!structure) throw noStructure(app);

  const documents = await documentsComplete(app.id);
  const statusReason = whyCannotGenerateFee(app.status);

  return {
    application: { id: app.id, applicationNumber: app.applicationNumber, status: app.status },
    calculation: calculateFee(toSpec(structure), buildFeeContext(app)),
    eligible: canGenerateFee(app.status) && documents.complete,
    blockedReason: statusReason ?? missingDocumentsReason(documents.missing),
    documents,
  };
}

const missingDocumentsReason = (
  missing: Array<{ name: string }>
): string | null =>
  missing.length === 0
    ? null
    : `${missing.length} required document${missing.length === 1 ? '' : 's'} still outstanding: ${missing
        .map((m) => m.name)
        .join(', ')}.`;

// Takes the shape rather than the row: the shortfall path knows the
// application type by id and name, not as a full ApplicationRow.
const noStructure = (app: { applicationType?: { name: string } | null }) =>
  businessRule(
    `No fee schedule is configured for ${app.applicationType?.name ?? 'this application type'}. The department must publish one before a demand can be raised.`
  );

// ═══════════════════════════════════════════════════════════════════════════
// Generation — the completion gate
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Issues the demand.
 *
 * ── §5: no fee before the documents are complete ───────────────────────
 *
 * The gate is checked twice on purpose. Once before the transaction, so the
 * caller gets a clear refusal naming every missing document rather than a
 * deadlock-shaped error; and once INSIDE the transaction, because between
 * those two moments an officer could reject a document. The second check is
 * the one that is load-bearing, and it re-derives completeness from the
 * requirement rules rather than trusting `applications.status`.
 *
 * ── Concurrency ────────────────────────────────────────────────────────
 *
 * Two officers pressing Generate together would both pass every check above.
 * The conditional status claim inside the transaction means only one wins, and
 * the `one_live_original_demand` partial unique index means that even if the
 * status were somehow not the guard, the database refuses the second demand.
 */
export async function generateFee(user: AuthUser, applicationId: string, meta: Meta) {
  const app = await requireApplication(user, applicationId);

  if (!canGenerateFee(app.status)) {
    throw guardFailed(whyCannotGenerateFee(app.status) ?? 'A fee cannot be generated right now.');
  }

  const documents = await documentsComplete(app.id);
  if (!documents.complete) throw incompleteDocuments(documents.missing);

  const structure = await resolveStructure(app.applicationTypeId);
  if (!structure) throw noStructure(app);

  const context = buildFeeContext(app);
  const calculation = calculateFee(toSpec(structure), context);

  const [dueDays, format] = await Promise.all([
    // 0 = no due date. No payment deadline was supplied for this jurisdiction
    // (open question Q8), and inventing one would put a date on a demand that
    // has no basis in any rule.
    settingNumber('fee_demand_due_days', 0),
    settingString('fee_demand_number_format', DEFAULT_DEMAND_FORMAT),
  ]);

  return prisma.$transaction(async (tx) => {
    // Re-derive completeness inside the transaction. This is the check that
    // actually guards the money.
    const recheck = await documentsComplete(app.id, tx);
    if (!recheck.complete) throw incompleteDocuments(recheck.missing);

    // Claim the application. `updateMany` with the status in its WHERE is what
    // makes this a compare-and-set rather than a read-then-write.
    const claimed = await tx.application.updateMany({
      where: {
        id: app.id,
        deletedAt: null,
        status: { in: ['SCRUTINY_PASSED', 'DOCUMENT_UPLOAD_PENDING', 'DOCUMENTS_COMPLETED'] },
      },
      data: { status: 'FEE_GENERATED', updatedAt: new Date() },
    });

    if (claimed.count === 0) {
      throw conflict('A demand has already been raised against this application.');
    }

    const now = new Date();
    const year = now.getFullYear();
    const prefix = 'DM';
    const seq = await nextSequence(tx, `demand:${prefix}:${year}`);
    const demandNumber = formatNumber(format || DEFAULT_DEMAND_FORMAT, { prefix, year, seq });

    const demand = await tx.applicationFee.create({
      data: {
        applicationId: app.id,
        demandNumber,
        type: 'ORIGINAL',
        // ISSUED at once. DRAFT exists only for the moment a demand is being
        // assembled inside a transaction; it is never a state a demand rests
        // in, because a demand somebody can see but nobody owes is a demand
        // that will be argued about.
        status: 'ISSUED',
        feeStructureId: structure.id,
        feeStructureVersion: structure.version,
        feeStructureCode: structure.code,
        roundingRule: calculation.structure.roundingRule,
        calculationInputs: context as never,
        subtotal: calculation.subtotal,
        adjustmentTotal: calculation.adjustmentTotal,
        totalAmount: calculation.total,
        generatedById: user.id,
        issuedAt: now,
        dueDate: dueDays > 0 ? new Date(now.getTime() + dueDays * 86_400_000) : null,
        lineItems: {
          create: [...calculation.lines, ...calculation.adjustments].map((line) => ({
            kind: line.kind,
            feeComponentId: line.componentId,
            feeRuleId: line.ruleId,
            componentCode: line.code,
            componentName: line.name,
            headOfAccount: line.headOfAccount,
            basis: line.basis,
            variableName: line.variableName,
            variableValue: line.variableValue,
            rateApplied: line.rateApplied,
            computedAmount: line.computedAmount,
            amount: line.amount,
            calculationNote: line.note,
            displayOrder: line.displayOrder,
          })),
        },
      },
      select: DEMAND_SELECT,
    });

    await recordEvent(tx, {
      applicationId: app.id,
      type: EVENT_TYPES.FEE_GENERATED,
      title: 'Fee demand generated',
      description: `${demandNumber} — ${calculation.total.toFixed(2)} payable.`,
      actor: user,
      metadata: {
        applicationFeeId: demand.id,
        demandNumber,
        total: calculation.total.toFixed(2),
        feeStructureCode: structure.code,
        feeStructureVersion: structure.version,
        isPlaceholder: structure.isPlaceholder,
      },
    });

    await audit(tx, {
      actor: user,
      action: 'FEE_GENERATED',
      entityType: 'ApplicationFee',
      entityId: demand.id,
      applicationId: app.id,
      after: {
        demandNumber,
        subtotal: calculation.subtotal.toFixed(2),
        adjustmentTotal: calculation.adjustmentTotal.toFixed(2),
        total: calculation.total.toFixed(2),
        feeStructureId: structure.id,
        feeStructureCode: structure.code,
        feeStructureVersion: structure.version,
        roundingRule: calculation.structure.roundingRule,
        // The inputs are audited alongside the outputs: a demand is only
        // explainable if the numbers that went in are recorded next to the
        // number that came out.
        calculationInputs: context,
        lines: [...calculation.lines, ...calculation.adjustments].map((l) => ({
          code: l.code,
          basis: l.basis,
          amount: l.amount.toFixed(2),
        })),
      },
      ...meta,
    });

    await emit(tx, {
      eventCode: EVENTS.FEE_GENERATED,
      applicationId: app.id,
      payload: {
        applicationNumber: app.applicationNumber,
        demandNumber,
        total: calculation.total.toFixed(2),
        dueDate: demand.dueDate,
      },
    });

    return shapeDemand(demand);
  });
}

const incompleteDocuments = (missing: Array<{ code: string; name: string; reason: string }>) =>
  guardFailed(
    `The fee cannot be generated until every required document is in. ${missing.length} ${missing.length === 1 ? 'is' : 'are'} outstanding.`,
    missing.map((m) => ({ path: `documents.${m.code}`, message: `${m.name} — ${m.reason}` }))
  );

// ═══════════════════════════════════════════════════════════════════════════
// Shortfall demands
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The demand an officer raises when money is short.
 *
 * ── Why this is not `generateFee` with a flag ──────────────────────────
 *
 * An ORIGINAL demand is CALCULATED: the schedule decides every figure and no
 * officer types a number. A SHORTFALL demand is the opposite — it exists
 * precisely because a person decided a specific amount is owed, and the amount
 * is theirs, not the calculator's. Forcing both through one function would
 * mean either letting a caller override calculated lines (which would destroy
 * the property that an original demand is explainable from the schedule alone)
 * or pretending a schedule produced a figure a human chose.
 *
 * What they DO share is everything that makes a demand a demand: an allocated
 * number, itemised lines with their own amounts, the structure identity frozen
 * on the row, a timeline entry, an audit record and an outbox event. The
 * payment path then treats it identically — which is the point of §12's
 * shortfall fee being payable at all.
 *
 * Called only by the workflow engine's RAISE_SHORTFALL / GENERATE_FEE_DEMAND
 * effect pair, inside the transition's transaction.
 */
export async function createShortfallDemand(
  tx: Tx,
  input: {
    application: { id: string; applicationNumber: string; applicationTypeId: string };
    shortfall: { id: string; shortfallNumber: string; title: string };
    items: Array<{ description: string; amount: number }>;
    actor: Pick<AuthUser, 'id' | 'name'> & { roleKeys?: string[] };
    now: Date;
    meta?: Meta;
  }
) {
  const priced = input.items.filter((i) => Number.isFinite(i.amount) && i.amount > 0);

  if (!priced.length) {
    throw businessRule('A fee shortfall must name at least one amount that is actually payable.');
  }

  // The structure is recorded for provenance, not to compute anything: the row
  // requires one, and "which schedule was in force when this was raised" is
  // worth being able to answer years later.
  const structure = await resolveStructure(input.application.applicationTypeId, input.now, tx);
  if (!structure) throw noStructure({ applicationType: null });

  const [dueDays, format] = await Promise.all([
    settingNumber('fee_demand_due_days', 0),
    settingString('fee_demand_number_format', DEFAULT_DEMAND_FORMAT),
  ]);

  const year = input.now.getFullYear();
  const prefix = 'DM';
  const seq = await nextSequence(tx, `demand:${prefix}:${year}`);
  const demandNumber = formatNumber(format || DEFAULT_DEMAND_FORMAT, { prefix, year, seq });

  const total = priced.reduce((sum, i) => sum + i.amount, 0);

  const demand = await tx.applicationFee.create({
    data: {
      applicationId: input.application.id,
      demandNumber,
      type: 'SHORTFALL',
      status: 'ISSUED',
      feeStructureId: structure.id,
      feeStructureVersion: structure.version,
      feeStructureCode: structure.code,
      roundingRule: structure.roundingRule,
      calculationInputs: {
        source: 'SHORTFALL',
        shortfallId: input.shortfall.id,
        shortfallNumber: input.shortfall.shortfallNumber,
        raisedBy: input.actor.name,
      } as never,
      subtotal: total,
      adjustmentTotal: 0,
      totalAmount: total,
      generatedById: input.actor.id,
      raisedByShortfallId: input.shortfall.id,
      issuedAt: input.now,
      dueDate: dueDays > 0 ? new Date(input.now.getTime() + dueDays * 86_400_000) : null,
      lineItems: {
        create: priced.map((item, index) => ({
          kind: 'COMPONENT',
          componentCode: 'SHORTFALL',
          componentName: item.description.slice(0, 200),
          headOfAccount: '',
          basis: 'FLAT',
          computedAmount: item.amount,
          amount: item.amount,
          calculationNote: `Raised with ${input.shortfall.shortfallNumber}.`,
          displayOrder: index,
        })),
      },
    },
    select: DEMAND_SELECT,
  });

  await recordEvent(tx, {
    applicationId: input.application.id,
    type: EVENT_TYPES.FEE_GENERATED,
    title: 'Additional fee demanded',
    description: `${demandNumber} — ${total.toFixed(2)} payable against ${input.shortfall.shortfallNumber}.`,
    actor: input.actor,
    metadata: {
      applicationFeeId: demand.id,
      demandNumber,
      total: total.toFixed(2),
      shortfallId: input.shortfall.id,
      shortfallNumber: input.shortfall.shortfallNumber,
    },
    occurredAt: input.now,
  });

  await audit(tx, {
    actor: input.actor,
    action: 'FEE_SHORTFALL_DEMANDED',
    entityType: 'ApplicationFee',
    entityId: demand.id,
    applicationId: input.application.id,
    after: {
      demandNumber,
      type: 'SHORTFALL',
      total: total.toFixed(2),
      shortfallNumber: input.shortfall.shortfallNumber,
      lines: priced.map((i) => ({ description: i.description, amount: i.amount.toFixed(2) })),
    },
    ...(input.meta ?? {}),
  });

  await emit(tx, {
    eventCode: EVENTS.FEE_GENERATED,
    applicationId: input.application.id,
    payload: {
      applicationNumber: input.application.applicationNumber,
      demandNumber,
      total: total.toFixed(2),
      dueDate: demand.dueDate,
      shortfallNumber: input.shortfall.shortfallNumber,
    },
  });

  return shapeDemand(demand);
}

// ═══════════════════════════════════════════════════════════════════════════
// Cancellation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cancels a demand raised in error.
 *
 * A demand is never edited — §9 depends on that — so the only way to correct
 * one is to cancel it, with a reason, and raise another. A paid or part-paid
 * demand cannot be cancelled here: money has moved, and unwinding that is a
 * refund, which is Phase 6's job and has its own accounting.
 */
export async function cancelDemand(
  user: AuthUser,
  demandId: string,
  reason: string,
  meta: Meta
) {
  if (!isUuid(demandId)) throw notFound('That demand could not be found.');

  const trimmed = reason.trim().slice(0, 500);
  if (!trimmed) throw businessRule('Say why the demand is being cancelled.');

  const demand = await prisma.applicationFee.findFirst({
    where: { id: demandId, application: { deletedAt: null, ...applicationScope(user) } },
    select: {
      id: true,
      demandNumber: true,
      status: true,
      type: true,
      totalAmount: true,
      paidAmount: true,
      applicationId: true,
      application: { select: { status: true, applicationNumber: true } },
    },
  });

  if (!demand) throw notFound('That demand could not be found.');

  if (!isLiveDemand(demand.status)) {
    throw businessRule(`That demand is already ${demand.status.toLowerCase()}.`);
  }
  if (!demand.paidAmount.isZero()) {
    throw businessRule(
      'Money has been paid against this demand, so it cannot be cancelled. A refund is required instead.'
    );
  }

  return prisma.$transaction(async (tx) => {
    await tx.applicationFee.update({
      where: { id: demand.id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: trimmed },
    });

    // The application returns to the document stage, where a corrected demand
    // can be raised. Only from FEE_GENERATED: once a payment has been
    // attempted the file is past this point.
    if (demand.application.status === 'FEE_GENERATED') {
      await tx.application.update({
        where: { id: demand.applicationId },
        data: { status: 'DOCUMENTS_COMPLETED', updatedAt: new Date() },
      });
    }

    await recordEvent(tx, {
      applicationId: demand.applicationId,
      type: EVENT_TYPES.FEE_CANCELLED,
      title: 'Fee demand cancelled',
      description: `${demand.demandNumber} — ${trimmed}`,
      actor: user,
      metadata: { applicationFeeId: demand.id, demandNumber: demand.demandNumber },
    });

    await audit(tx, {
      actor: user,
      action: 'FEE_CANCELLED',
      entityType: 'ApplicationFee',
      entityId: demand.id,
      applicationId: demand.applicationId,
      before: { status: demand.status, total: demand.totalAmount.toFixed(2) },
      after: { status: 'CANCELLED' },
      remarks: trimmed,
      ...meta,
    });

    return { id: demand.id, demandNumber: demand.demandNumber, status: 'CANCELLED' as const };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Reading
// ═══════════════════════════════════════════════════════════════════════════

const DEMAND_SELECT = {
  id: true,
  demandNumber: true,
  type: true,
  status: true,
  feeStructureId: true,
  feeStructureCode: true,
  feeStructureVersion: true,
  roundingRule: true,
  calculationInputs: true,
  subtotal: true,
  adjustmentTotal: true,
  totalAmount: true,
  paidAmount: true,
  dueDate: true,
  issuedAt: true,
  paidAt: true,
  cancelledAt: true,
  cancelReason: true,
  generatedById: true,
  createdAt: true,
  lineItems: {
    orderBy: [{ kind: 'asc' }, { displayOrder: 'asc' }],
    select: {
      id: true,
      kind: true,
      componentCode: true,
      componentName: true,
      headOfAccount: true,
      basis: true,
      variableName: true,
      variableValue: true,
      rateApplied: true,
      computedAmount: true,
      amount: true,
      calculationNote: true,
      displayOrder: true,
    },
  },
} satisfies Prisma.ApplicationFeeSelect;

type DemandRow = Prisma.ApplicationFeeGetPayload<{ select: typeof DEMAND_SELECT }>;

const shapeDemand = (demand: DemandRow) => ({
  ...demand,
  /** Charges and adjustments, split for the two halves of the demand table. */
  charges: demand.lineItems.filter((l) => l.kind === 'COMPONENT'),
  adjustments: demand.lineItems.filter((l) => l.kind !== 'COMPONENT'),
  balance: demand.totalAmount.minus(demand.paidAmount),
});

/**
 * Everything the Fees tab renders.
 *
 * Issued demands are read from their own frozen rows — never recalculated.
 * The live preview is included only when there is no demand yet, or when the
 * caller may raise one, and it is clearly a preview: seeing what a fee WOULD
 * be is useful; seeing a recalculated figure sitting next to an issued demand
 * that says something different is how trust in the number is lost.
 */
export async function getFees(user: AuthUser, applicationId: string) {
  const app = await requireApplication(user, applicationId);

  const [demands, documents] = await Promise.all([
    prisma.applicationFee.findMany({
      where: { applicationId: app.id },
      select: DEMAND_SELECT,
      orderBy: { createdAt: 'desc' },
    }),
    documentsComplete(app.id),
  ]);

  const generatorNames = await namesFor(demands.map((d) => d.generatedById ?? '').filter(Boolean));

  const hasLive = demands.some((d) => d.type === 'ORIGINAL' && isLiveDemand(d.status));
  const mayGenerate = can(user, CAPABILITIES.FEE_GENERATE);

  // The preview costs a structure resolution and a calculation, so it is only
  // built when it will actually be shown.
  let preview: Calculation | null = null;
  let structureMissing = false;

  if (!hasLive && (mayGenerate || canGenerateFee(app.status))) {
    const structure = await resolveStructure(app.applicationTypeId);
    if (structure) {
      try {
        preview = calculateFee(toSpec(structure), buildFeeContext(app));
      } catch (err) {
        // A misconfigured schedule must not take down the Fees tab. The
        // failure is surfaced as a blocked reason instead.
        console.error(`[fees] preview failed for application ${app.id}:`, err);
      }
    } else {
      structureMissing = true;
    }
  }

  const statusReason = whyCannotGenerateFee(app.status);

  return {
    application: {
      id: app.id,
      applicationNumber: app.applicationNumber,
      status: app.status,
      applicationTypeName: app.applicationType?.name ?? 'Application',
    },
    demands: demands.map((d) => ({
      ...shapeDemand(d),
      generatedByName: d.generatedById ? (generatorNames.get(d.generatedById) ?? null) : null,
    })),
    preview,
    documents,
    canGenerate: mayGenerate && canGenerateFee(app.status) && documents.complete && !structureMissing,
    generateBlockedReason: structureMissing
      ? 'No fee schedule is configured for this application type.'
      : !mayGenerate
        ? 'Your role does not permit a fee to be generated.'
        : (statusReason ?? missingDocumentsReason(documents.missing)),
  };
}

/** Resolves one demand the caller may read, scoped through its application. */
export async function getDemand(user: AuthUser, demandId: string) {
  if (!isUuid(demandId)) throw notFound('That demand could not be found.');

  const demand = await prisma.applicationFee.findFirst({
    where: { id: demandId, application: { deletedAt: null, ...applicationScope(user) } },
    select: {
      ...DEMAND_SELECT,
      application: { select: { id: true, applicationNumber: true, status: true } },
    },
  });

  if (!demand) throw notFound('That demand could not be found.');
  return shapeDemand(demand);
}

async function namesFor(userIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (!unique.length) return new Map();

  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });

  return new Map(users.map((u) => [u.id, u.name]));
}

/** Guard used by the routes that must not run for a role without FEE_VIEW. */
export function assertCanSeeFees(user: AuthUser) {
  if (!can(user, CAPABILITIES.FEE_VIEW)) {
    throw forbidden('Your role does not permit fees to be viewed.');
  }
}
