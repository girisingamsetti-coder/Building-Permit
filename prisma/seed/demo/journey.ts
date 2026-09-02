import type { PrismaClient } from '@prisma/client';
import type { Rng } from './rng';
import type { Stop } from './plan';
import {
  ACCEPT_REMARKS,
  APPROVAL_REMARKS,
  DISTRICTS,
  FIRST_NAMES,
  FORWARD_REMARKS,
  LAYOUTS,
  LOCALITIES,
  REJECTION_REMARKS,
  RESOLUTION_TEXT,
  SHORTFALL_TEXT,
  STREETS,
  SURNAMES,
  type BuildingProfile,
} from './dataset';

import { createApplication, saveStep, submitApplication } from '../../../src/server/services/applications';
import { uploadDrawing } from '../../../src/server/services/drawings';
import { requestScrutiny } from '../../../src/server/services/scrutiny';
import { getDocuments, uploadDocument } from '../../../src/server/services/documents';
import { generateFee } from '../../../src/server/services/fees';
import { handleWebhook, initiatePayment } from '../../../src/server/services/payments';
import { buildMockGatewayRequest } from '../../../src/server/payments/mock';
import { performAction } from '../../../src/server/workflow/engine';
import { claimTask } from '../../../src/server/workflow/tasks';
import { ACTIONS } from '../../../src/lib/workflow';
import type { AuthUser } from '../../../src/server/auth/context';

/**
 * ONE APPLICATION, WALKED THE WHOLE WAY.
 *
 * Nothing here writes a status, a task, a history row, a demand or a receipt.
 * Every one of those is produced by the same service the product calls, in the
 * same order a real user would call it, and the file stops where the plan says
 * it stops.
 *
 * That is a deliberate and expensive choice. Inserting seventy rows with
 * `status: 'PENDING_ZJD'` would take a second and would be a lie: the guards
 * would never have run, the shortfall counter would be whatever the seed
 * happened to write, and an "approved" application could sit there with three
 * open shortfalls — the exact combination the approval guard exists to make
 * impossible. Driving the real path means a demo file and a production file
 * are the same kind of object, and the reconciliation script can therefore
 * check the demo the same way it would check live data.
 */

export const META = {
  ip: '127.0.0.1',
  userAgent: 'lams-demo-seed',
  correlationId: 'demo-seed',
};

/** A minimal, genuinely well-formed PDF. The upload pipeline sniffs the bytes. */
export const PDF_BYTES = Buffer.from(
  '%PDF-1.7\n' +
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\n' +
    'trailer<</Root 1 0 R>>\n%%EOF\n',
  'latin1'
);

/**
 * The identity a seeded action is performed as.
 *
 * Deliberately the SERVICES' OWN `AuthUser` rather than a look-alike. A
 * structurally similar type would compile and would let the seed drift away
 * from what the product actually requires of a caller — and the whole point of
 * this seed is that it goes through the same front door a user does. The
 * import is type-only, so the `server-only` module it comes from is erased and
 * never loaded by this CLI process.
 */
export type Actor = AuthUser;

export type JourneyContext = {
  prisma: PrismaClient;
  rng: Rng;
  /** Demo LTP accounts, round-robined across the seventy files. */
  ltps: Actor[];
  /** Officers who can actually see a given zone, per role. */
  officerFor: (roleKeys: string[], zoneId: string) => Actor;
  finance: Actor;
  admin: Actor;
  applicationTypes: Array<{ id: string; code: string; numberPrefix: string; name: string }>;
  zones: Array<{ id: string; code: string; name: string }>;
  /** Runs the job queue to completion — scans, scrutiny, notifications. */
  drainJobs: () => Promise<number>;
  /** Points the mock scrutiny engine at a version ladder. */
  setScrutinyPassFrom: (version: number) => Promise<void>;
};

export type JourneySpec = {
  stop: Stop;
  /** Days before "now" that this file was created. */
  ageDays: number;
  ltp: Actor;
  applicationType: { id: string; code: string; numberPrefix: string; name: string };
  zone: { id: string; code: string; name: string };
  profile: BuildingProfile;
};

export type JourneyResult = {
  applicationId: string;
  applicationNumber: string;
  stop: Stop;
  status: string;
  ageDays: number;
  /**
   * True for a file whose scrutiny run must be requested AFTER every other
   * application has been built.
   *
   * A file resting at SCRUTINY_IN_PROGRESS is one whose run is genuinely still
   * queued — and any later application's `drainJobs()` would execute that
   * queued job and move the file on. So the request is deferred to the very
   * end of the seed, where nothing drains after it.
   */
  deferScrutiny?: boolean;
};

// ═══════════════════════════════════════════════════════════════════════════
// Building the particulars
// ═══════════════════════════════════════════════════════════════════════════

const personName = (rng: Rng) => `${rng.pick(FIRST_NAMES)} ${rng.pick(SURNAMES)}`;

/**
 * A coherent set of building numbers.
 *
 * Derived from the profile rather than drawn independently, because the fee
 * engine multiplies by built-up area and the document rules branch on floor
 * count: a 90 m² plot carrying a 4 000 m² built-up area would produce a demand
 * and a checklist that contradict each other on the same screen.
 */
function particulars(rng: Rng, profile: BuildingProfile) {
  const district = rng.pick(DISTRICTS);
  const plotAreaSqm = rng.float(profile.plotArea[0], profile.plotArea[1], 2);
  const numFloors = rng.int(profile.floors[0], profile.floors[1]);
  const numBasements = rng.int(profile.basements[0], profile.basements[1]);
  const numDwellingUnits = profile.units[1] ? rng.int(profile.units[0], profile.units[1]) : 0;

  const far = rng.float(profile.farTarget[0], profile.farTarget[1], 2);
  const builtUpAreaSqm = Math.round(plotAreaSqm * far * 100) / 100;
  const coverageAreaSqm = Math.round(plotAreaSqm * rng.float(0.4, 0.6, 2) * 100) / 100;
  const floorAreaSqm = Math.round((builtUpAreaSqm / Math.max(1, numFloors)) * 100) / 100;
  const parkingAreaSqm = Math.round(builtUpAreaSqm * rng.float(0.08, 0.2, 2) * 100) / 100;

  const applicantName = personName(rng);
  const ownerSame = rng.chance(0.75);

  return {
    applicantName,
    fatherName: `${rng.pick(FIRST_NAMES)} ${rng.pick(SURNAMES)}`,
    phone: `9${rng.int(100000000, 999999999)}`,
    email: `${applicantName.toLowerCase().replace(/\s+/g, '.')}@example.com`,
    address: `${rng.int(1, 120)}-${rng.int(1, 40)}, ${rng.pick(STREETS)}, ${rng.pick(LOCALITIES)}, Amaravati, Andhra Pradesh, India`,
    ownerSame,
    ownerName: ownerSame ? '' : personName(rng),
    ownerPhone: ownerSame ? '' : `9${rng.int(100000000, 999999999)}`,

    district: district.name,
    mandal: rng.pick(district.mandals),
    village: rng.pick(LOCALITIES),
    localityName: rng.pick(LOCALITIES),
    wardNo: String(rng.int(1, 60)),
    streetName: rng.pick(STREETS),
    doorNo: `${rng.int(1, 120)}-${rng.int(1, 40)}-${rng.int(1, 99)}`,
    pincode: String(rng.int(500001, 535999)),

    surveyNumbers: `${rng.int(10, 480)}/${rng.pick(['A', 'B', 'C', 'A1', 'B2', 'P'])}`,
    plotNo: String(rng.int(1, 220)),
    layoutName: rng.chance(0.6) ? rng.pick(LAYOUTS) : '',
    lpNumber: rng.chance(0.35) ? `LP/${rng.int(2018, 2025)}/${rng.int(100, 999)}` : '',
    plotAreaSqm,
    roadWidthM: rng.pick([9, 12, 15, 18, 24, 30]),
    landUseZone: profile.landUseZone,
    tenureType: rng.pick(['FREEHOLD', 'LEASEHOLD']),

    numFloors,
    numBasements,
    numDwellingUnits,
    buildingHeightM: Math.round((numFloors * 3.2 + 1.2) * 100) / 100,
    builtUpAreaSqm,
    floorAreaSqm,
    coverageAreaSqm,
    parkingAreaSqm,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// The walk
// ═══════════════════════════════════════════════════════════════════════════

/** Where each stop sits on the applicant-side ladder, for early returns. */
const LTP_STOPS = new Set<Stop>([
  'DRAFT_EARLY',
  'DRAFT_LATE',
  'SUBMITTED',
  'DRAWING_UPLOADED',
  'SCRUTINY_QUEUED',
  'SCRUTINY_FAILED',
  'SCRUTINY_REUPLOADED',
  'SCRUTINY_PASSED',
  'DOCUMENTS_PARTIAL',
  'DOCUMENTS_COMPLETE',
  'FEE_GENERATED',
  'PAYMENT_PENDING',
  'PAYMENT_FAILED',
]);

export async function buildApplication(
  ctx: JourneyContext,
  spec: JourneySpec
): Promise<JourneyResult> {
  const { rng } = ctx;
  const p = particulars(rng, spec.profile);
  const ltp = spec.ltp;

  const created = await createApplication(ltp, { applicationTypeId: spec.applicationType.id }, META);
  const id = created.id;

  const done = async (): Promise<JourneyResult> => {
    const row = await ctx.prisma.application.findUniqueOrThrow({
      where: { id },
      select: { applicationNumber: true, status: true },
    });
    return {
      applicationId: id,
      applicationNumber: row.applicationNumber,
      stop: spec.stop,
      status: row.status,
      ageDays: spec.ageDays,
      deferScrutiny: spec.stop === 'SCRUTINY_QUEUED',
    };
  };

  // ── The filing wizard ──────────────────────────────────────────────────
  const steps: Array<[string, Record<string, unknown>]> = [
    [
      'applicant',
      {
        name: p.applicantName,
        phone: p.phone,
        address: p.address,
        fatherName: p.fatherName,
        email: p.email,
        aadhaarLast4: String(rng.int(1000, 9999)),
        panMasked: '',
      },
    ],
    [
      'owner',
      {
        ownerSameAsApplicant: p.ownerSame,
        ownerName: p.ownerName,
        ownerPhone: p.ownerPhone,
        ownerAddress: p.ownerSame ? '' : p.address,
      },
    ],
    [
      'property',
      {
        district: p.district,
        mandal: p.mandal,
        village: p.village,
        localityName: p.localityName,
        wardNo: p.wardNo,
      },
    ],
    [
      'location',
      {
        zoneId: spec.zone.id,
        streetName: p.streetName,
        doorNo: p.doorNo,
        pincode: p.pincode,
        boundaryNorth: 'Plot of ' + personName(rng),
        boundarySouth: `${p.streetName} (${p.roadWidthM} m)`,
        boundaryEast: 'Plot of ' + personName(rng),
        boundaryWest: 'Open land',
      },
    ],
    [
      'survey',
      {
        surveyNumbers: p.surveyNumbers,
        plotNo: p.plotNo,
        plotAreaSqm: p.plotAreaSqm,
        roadWidthM: p.roadWidthM,
        layoutName: p.layoutName,
        lpNumber: p.lpNumber,
        landUseZone: p.landUseZone,
        tenureType: p.tenureType,
      },
    ],
    [
      'development',
      {
        buildingUse: spec.profile.buildingUse,
        occupancyType: spec.profile.occupancyType,
        buildingSubUse: spec.profile.buildingSubUse,
        structureType: spec.profile.structureType,
        numFloors: p.numFloors,
        numBasements: p.numBasements,
        numDwellingUnits: p.numDwellingUnits,
        buildingHeightM: p.buildingHeightM,
      },
    ],
    [
      'building',
      {
        plotAreaSqm: p.plotAreaSqm,
        builtUpAreaSqm: p.builtUpAreaSqm,
        floorAreaSqm: p.floorAreaSqm,
        coverageAreaSqm: p.coverageAreaSqm,
        parkingAreaSqm: p.parkingAreaSqm,
        setbackFrontM: rng.float(1.5, 6, 1),
        setbackRearM: rng.float(1, 4, 1),
        setbackLeftM: rng.float(1, 3, 1),
        setbackRightM: rng.float(1, 3, 1),
      },
    ],
    ['ltp', { declarationAccepted: true, remarks: '' }],
  ];

  // An early draft has answered the first three steps and no more — which is
  // what a half-filled wizard genuinely looks like.
  const upto = spec.stop === 'DRAFT_EARLY' ? 3 : steps.length;

  for (const [step, data] of steps.slice(0, upto)) {
    await saveStep(ltp, id, { step: step as never, data, partial: false }, META);
  }

  if (spec.stop === 'DRAFT_EARLY' || spec.stop === 'DRAFT_LATE') return done();

  await submitApplication(ltp, id, META);
  if (spec.stop === 'SUBMITTED') return done();

  // ── Drawings ───────────────────────────────────────────────────────────
  //
  // Whether this file failed scrutiny the first time is decided HERE, before
  // anything is uploaded, because the mock engine's verdict is a function of
  // the version number. A file that must end up failed uploads one version
  // against a ladder that passes from version 2.
  const failsFirst =
    spec.stop === 'SCRUTINY_FAILED' ||
    spec.stop === 'SCRUTINY_REUPLOADED' ||
    (!LTP_STOPS.has(spec.stop) && rng.chance(0.3));

  await ctx.setScrutinyPassFrom(failsFirst ? 2 : 1);

  const sheets = rng.sample(
    ['SITE_PLAN', 'FLOOR_PLAN', 'ELEVATION', 'SECTION'],
    spec.stop === 'DRAWING_UPLOADED' ? rng.int(1, 2) : rng.int(2, 3)
  );

  const drawingIds: string[] = [];
  for (const category of sheets) {
    const result = await uploadDrawing(
      ltp,
      {
        applicationId: id,
        category,
        title: `${category.replace(/_/g, ' ').toLowerCase()} — ${p.plotNo}`,
        remarks: 'Uploaded with the application.',
        file: {
          name: `${category.toLowerCase()}-${p.plotNo}.pdf`,
          type: 'application/pdf',
          bytes: PDF_BYTES,
        },
      },
      META
    );
    drawingIds.push(result.drawingId);
  }
  await ctx.drainJobs();

  if (spec.stop === 'DRAWING_UPLOADED') return done();

  // The drawings are on file and virus-checked. The scrutiny REQUEST is made
  // by the orchestrator once every other application is finished — see
  // `deferScrutiny` above.
  if (spec.stop === 'SCRUTINY_QUEUED') return done();

  // ── Scrutiny ───────────────────────────────────────────────────────────
  await requestScrutiny(ltp, id, META);
  await ctx.drainJobs();

  if (spec.stop === 'SCRUTINY_FAILED') return done();

  if (failsFirst) {
    // The correction: a NEW version of every sheet, against a ladder that now
    // passes. Uploading into the existing drawing id is what makes it V2 of
    // the same sheet rather than a second sheet.
    await ctx.setScrutinyPassFrom(1);
    for (let i = 0; i < drawingIds.length; i += 1) {
      await uploadDrawing(
        ltp,
        {
          applicationId: id,
          drawingId: drawingIds[i],
          category: sheets[i]!,
          remarks: 'Corrected as per the scrutiny findings.',
          file: {
            name: `${sheets[i]!.toLowerCase()}-${p.plotNo}-rev1.pdf`,
            type: 'application/pdf',
            bytes: PDF_BYTES,
          },
        },
        META
      );
    }
    await ctx.drainJobs();

    if (spec.stop === 'SCRUTINY_REUPLOADED') return done();

    await requestScrutiny(ltp, id, META);
    await ctx.drainJobs();
  }

  if (spec.stop === 'SCRUTINY_PASSED') return done();

  // ── Documents ──────────────────────────────────────────────────────────
  const checklist = await getDocuments(ltp, id);
  const mandatory = checklist.entries.filter((e) => e.isRequired && e.isMandatory);
  const optional = checklist.entries.filter((e) => e.isRequired && !e.isMandatory);

  // A partial upload leaves at least one mandatory document genuinely
  // outstanding, so `documents_complete` fails for the real reason.
  const uploadCount =
    spec.stop === 'DOCUMENTS_PARTIAL'
      ? Math.max(1, mandatory.length - rng.int(1, Math.max(1, Math.min(3, mandatory.length - 1))))
      : mandatory.length;

  const expiry = new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10);

  for (const entry of mandatory.slice(0, uploadCount)) {
    await uploadDocument(
      ltp,
      {
        applicationId: id,
        documentTypeId: entry.documentTypeId,
        expiresOn: entry.requiresExpiry ? expiry : null,
        file: {
          name: `${entry.code.toLowerCase()}.pdf`,
          type: 'application/pdf',
          bytes: PDF_BYTES,
        },
      },
      META
    );
  }

  // A few files also carry an optional document, so the checklist is not a
  // wall of identical rows.
  if (spec.stop !== 'DOCUMENTS_PARTIAL' && optional.length && rng.chance(0.4)) {
    const extra = optional[0]!;
    await uploadDocument(
      ltp,
      {
        applicationId: id,
        documentTypeId: extra.documentTypeId,
        expiresOn: extra.requiresExpiry ? expiry : null,
        file: { name: `${extra.code.toLowerCase()}.pdf`, type: 'application/pdf', bytes: PDF_BYTES },
      },
      META
    );
  }
  await ctx.drainJobs();

  if (spec.stop === 'DOCUMENTS_PARTIAL' || spec.stop === 'DOCUMENTS_COMPLETE') return done();

  // ── Fee ────────────────────────────────────────────────────────────────
  const demand = await generateFee(ctx.finance, id, META);
  if (spec.stop === 'FEE_GENERATED') return done();

  // ── Payment ────────────────────────────────────────────────────────────
  const attempt = await initiatePayment(ltp, demand.id, META);
  if (spec.stop === 'PAYMENT_PENDING') return done();

  if (spec.stop === 'PAYMENT_FAILED') {
    await settleMock(attempt.payment.paymentRef, 'FAILED', demand.totalAmount);
    await ctx.drainJobs();
    return done();
  }

  // Some files record a declined attempt before the one that succeeds. That is
  // what a real payments register looks like, and it is the only way the
  // "payment success rate" tile has anything but 100% to report.
  if (rng.chance(0.25)) {
    await settleMock(attempt.payment.paymentRef, 'FAILED', demand.totalAmount);
    await ctx.drainJobs();
    const retry = await initiatePayment(ltp, demand.id, META);
    await settleMock(retry.payment.paymentRef, 'SUCCESS', demand.totalAmount);
  } else {
    await settleMock(attempt.payment.paymentRef, 'SUCCESS', demand.totalAmount);
  }

  // Settlement starts the departmental run — that is the gate, and it is the
  // engine's own doing, not the seed's.
  await ctx.drainJobs();

  return departmental(ctx, spec, id, done);
}

/** Fires a signed mock-gateway callback, exactly as the provider would. */
async function settleMock(
  paymentRef: string,
  state: 'SUCCESS' | 'FAILED',
  amount: { toFixed: (dp: number) => string }
) {
  const value = amount.toFixed(2);

  await handleWebhook(
    'mock',
    buildMockGatewayRequest({
      paymentRef,
      state,
      amount: value,
      eventId: `demo_${state}_${paymentRef}`,
    })
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// The departmental desks
// ═══════════════════════════════════════════════════════════════════════════

async function departmental(
  ctx: JourneyContext,
  spec: JourneySpec,
  id: string,
  done: () => Promise<JourneyResult>
): Promise<JourneyResult> {
  const { rng } = ctx;
  const zoneId = spec.zone.id;

  const tpa = ctx.officerFor(['TPA'], zoneId);
  const zonal = ctx.officerFor(['ZAD', 'ZDD'], zoneId);
  const zjd = ctx.officerFor(['ZJD'], zoneId);
  const director = ctx.officerFor(['DIRECTOR_DP'], zoneId);
  const addl = ctx.officerFor(['ADDL_COMMISSIONER'], zoneId);
  const commissioner = ctx.officerFor(['COMMISSIONER'], zoneId);

  const act = (actor: Actor, action: string, input: Record<string, unknown> = {}) =>
    performAction(actor, id, action, { remarks: rng.pick(FORWARD_REMARKS), ...input }, META);

  /** Puts the open task in an officer's hands, so the queue shows a holder. */
  const claim = async (actor: Actor) => {
    const task = await ctx.prisma.workflowTask.findFirst({
      where: { instance: { applicationId: id }, status: 'PENDING', assignedUserId: null },
      select: { id: true },
    });
    if (task) await claimTask(actor, task.id, META);
  };

  /**
   * A shortfall the engine will accept.
   *
   * `items` is not optional decoration: `raiseShortfall` refuses a document
   * shortfall with no itemised list and a fee shortfall with no amount, on the
   * grounds that an applicant cannot answer "documents are missing". The seed
   * therefore has to say what is actually wanted, which is the point.
   */
  const shortfallInput = (kind: keyof typeof SHORTFALL_TEXT) => {
    const text = rng.pick(SHORTFALL_TEXT[kind]);

    const items =
      kind === 'FEE'
        ? [{ description: text.title, amount: rng.int(4, 60) * 500 }]
        : kind === 'CLARIFICATION'
          ? []
          : [{ description: text.action }];

    return {
      remarks: text.description,
      shortfall: {
        title: text.title,
        description: text.description,
        requiredAction: text.action,
        dueDate: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        items,
      },
    };
  };

  switch (spec.stop) {
    case 'TPA_UNCLAIMED':
      return done();

    case 'TPA_CLAIMED':
      await claim(tpa);
      return done();

    case 'TPA_DOCUMENT_SHORTFALL':
      await claim(tpa);
      await act(tpa, ACTIONS.RAISE_DOCUMENT_SHORTFALL, shortfallInput('DOCUMENT'));
      await ctx.drainJobs();
      return done();

    case 'TPA_FEE_SHORTFALL':
      await claim(tpa);
      await act(tpa, ACTIONS.RAISE_FEE_SHORTFALL, shortfallInput('FEE'));
      await ctx.drainJobs();
      return done();

    case 'TPA_REVIEWING':
      // Raise, answer, accept — and the officer keeps the file. This is the
      // only path to a stage's `workingStatus`, because claiming a task does
      // not change the application's status.
      await claim(tpa);
      await act(tpa, ACTIONS.RAISE_DOCUMENT_SHORTFALL, shortfallInput('DOCUMENT'));
      await ctx.drainJobs();
      await act(spec.ltp, ACTIONS.RESUBMIT, { remarks: rng.pick(RESOLUTION_TEXT) });
      await ctx.drainJobs();
      await act(tpa, ACTIONS.ACCEPT_RESOLUTION, { remarks: rng.pick(ACCEPT_REMARKS) });
      await ctx.drainJobs();
      return done();

    case 'TPA_SHORTFALL_RESPONDED':
      await claim(tpa);
      await act(tpa, ACTIONS.RAISE_DOCUMENT_SHORTFALL, shortfallInput('DOCUMENT'));
      await ctx.drainJobs();
      await act(spec.ltp, ACTIONS.RESUBMIT, { remarks: rng.pick(RESOLUTION_TEXT) });
      await ctx.drainJobs();
      return done();

    default:
      break;
  }

  // Every remaining stop is past the TPA desk. A third of them went through a
  // shortfall cycle on the way, so the history of a file sitting at ZJD is not
  // uniformly six identical "Forwarded" rows.
  if (rng.chance(0.3)) {
    await claim(tpa);
    await act(tpa, ACTIONS.RAISE_DOCUMENT_SHORTFALL, shortfallInput('DOCUMENT'));
    await ctx.drainJobs();
    await act(spec.ltp, ACTIONS.RESUBMIT, { remarks: rng.pick(RESOLUTION_TEXT) });
    await ctx.drainJobs();
    await act(tpa, ACTIONS.ACCEPT_RESOLUTION, { remarks: rng.pick(ACCEPT_REMARKS) });
  } else {
    await claim(tpa);
  }

  await act(tpa, ACTIONS.FORWARD);
  await ctx.drainJobs();

  switch (spec.stop) {
    case 'ZAD_UNCLAIMED':
      return done();
    case 'ZAD_CLAIMED':
      await claim(zonal);
      return done();
    case 'ZAD_SHORTFALL':
      await claim(zonal);
      await act(zonal, ACTIONS.RAISE_DOCUMENT_SHORTFALL, shortfallInput('DOCUMENT'));
      await ctx.drainJobs();
      return done();
    case 'ZAD_REVIEWING':
      await claim(zonal);
      await act(zonal, ACTIONS.RAISE_DOCUMENT_SHORTFALL, shortfallInput('DOCUMENT'));
      await ctx.drainJobs();
      await act(spec.ltp, ACTIONS.RESUBMIT, { remarks: rng.pick(RESOLUTION_TEXT) });
      await ctx.drainJobs();
      await act(zonal, ACTIONS.ACCEPT_RESOLUTION, { remarks: rng.pick(ACCEPT_REMARKS) });
      await ctx.drainJobs();
      return done();
    default:
      break;
  }

  await claim(zonal);
  await act(zonal, ACTIONS.FORWARD);
  await ctx.drainJobs();

  switch (spec.stop) {
    case 'ZJD_UNCLAIMED':
      if (rng.chance(0.5)) await claim(zjd);
      return done();
    case 'ZJD_FEE_SHORTFALL':
      await claim(zjd);
      await act(zjd, ACTIONS.RAISE_FEE_SHORTFALL, shortfallInput('FEE'));
      await ctx.drainJobs();
      return done();
    case 'DIRECTOR_WITH_REPORTED_FEE':
      // Reported, not blocking: the ZJD records the shortage and sends the
      // file on anyway. It travels to the Director's desk still open — and it
      // will block approval there until somebody closes it.
      await claim(zjd);
      await act(zjd, ACTIONS.REPORT_FEE_SHORTFALL_AND_FORWARD, shortfallInput('FEE'));
      await ctx.drainJobs();
      return done();
    default:
      break;
  }

  await claim(zjd);
  await act(zjd, ACTIONS.FORWARD);
  await ctx.drainJobs();

  switch (spec.stop) {
    case 'DIRECTOR_UNCLAIMED':
      if (rng.chance(0.5)) await claim(director);
      return done();
    case 'ADDL_COMMISSIONER_WITH_REPORTED_DOC':
      await claim(director);
      await act(director, ACTIONS.REPORT_SHORTFALL_AND_FORWARD, shortfallInput('DOCUMENT'));
      await ctx.drainJobs();
      return done();
    default:
      break;
  }

  await claim(director);
  await act(director, ACTIONS.FORWARD);
  await ctx.drainJobs();

  if (spec.stop === 'ADDL_COMMISSIONER_UNCLAIMED') {
    if (rng.chance(0.5)) await claim(addl);
    return done();
  }

  await claim(addl);
  await act(addl, ACTIONS.FORWARD);
  await ctx.drainJobs();

  if (spec.stop === 'COMMISSIONER_UNCLAIMED') {
    if (rng.chance(0.4)) await claim(commissioner);
    return done();
  }

  await claim(commissioner);

  if (spec.stop === 'REJECTED') {
    await act(commissioner, ACTIONS.REJECT, { remarks: rng.pick(REJECTION_REMARKS) });
    await ctx.drainJobs();
    return done();
  }

  // APPROVE runs the `no_open_shortfalls` guard with no override. If any of
  // the cycles above left one open, this throws — which is the seed telling
  // the truth rather than papering over it.
  await act(commissioner, ACTIONS.APPROVE, { remarks: rng.pick(APPROVAL_REMARKS) });
  await ctx.drainJobs();
  return done();
}
