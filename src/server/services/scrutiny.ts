import 'server-only';
import type { ApplicationStatus, Prisma } from '@prisma/client';
import { prisma, type Tx } from '@/server/db/prisma';
import { applicationScope } from '@/server/auth/scope';
import { isLtp, type AuthUser } from '@/server/auth/context';
import { audit } from './audit';
import { emit, EVENTS } from '@/server/events/outbox';
import { recordEvent, EVENT_TYPES } from './timeline';
import { activeVersions } from './drawings';
import { enqueue, JOB_TYPES } from '@/server/jobs/queue';
import { currentProvider } from '@/server/scrutiny';
import type { ScrutinyOutcome, ScrutinySubmission } from '@/server/scrutiny/types';
import { badRequest, forbidden, notFound, serviceUnavailable } from '@/server/http/errors';
import { canRequestScrutiny, isBlocking, severityRank, whyCannotRequestScrutiny } from '@/lib/drawings';
import { isUuid } from '@/lib/utils';

/**
 * Scrutiny orchestration.
 *
 * ── The one rule that shapes this file ─────────────────────────────────
 *
 * `applyOutcome()` is the SINGLE place a provider's verdict becomes
 * application state. Synchronous providers, polled providers and callback
 * providers all funnel through it, so the three delivery styles cannot drift
 * into three subtly different behaviours. Nothing else in the codebase writes
 * a ScrutinyResult.
 *
 * ── An engine error is not a verdict ───────────────────────────────────
 *
 * A run that ERRORs has not judged the drawing. It must never leave the
 * application in SCRUTINY_FAILED, which means "your drawing does not comply" —
 * it returns the application to DRAWING_UPLOADED so the LTP can try again, and
 * surfaces the engine error rather than implying fault in the applicant.
 */

type Meta = { ip: string; userAgent: string; correlationId?: string };

// ═══════════════════════════════════════════════════════════════════════════
// Requesting a run
// ═══════════════════════════════════════════════════════════════════════════

async function requireScrutinisable(user: AuthUser, applicationId: string) {
  if (!isUuid(applicationId)) throw notFound('That application could not be found.');

  const app = await prisma.application.findFirst({
    where: { id: applicationId, deletedAt: null, ...applicationScope(user) },
    include: {
      applicationType: { select: { requiresScrutiny: true, name: true } },
      property: true,
      building: true,
    },
  });

  if (!app) throw notFound('That application could not be found.');

  if (!canRequestScrutiny(app.status)) {
    throw forbidden(whyCannotRequestScrutiny(app.status) ?? 'Scrutiny cannot be run right now.');
  }

  if (isLtp(user) && app.ltpUserId !== user.id) {
    throw forbidden('You may only run scrutiny on applications you filed.');
  }

  return app;
}

/**
 * Sends the current drawing set to the engine.
 *
 * One request per ACTIVE drawing version, because each sheet is checked
 * separately and the version table shows a result against each. The
 * application's status is the aggregate — see `reconcileStatus`.
 *
 * The gate in F.8: an application type with `requiresScrutiny = false` skips
 * the engine entirely and moves straight to documents. That is configuration,
 * not a code path, so the rest of the pipeline is identical either way.
 */
export async function requestScrutiny(user: AuthUser, applicationId: string, meta: Meta) {
  const app = await requireScrutinisable(user, applicationId);
  const versions = await activeVersions(app.id);

  if (versions.length === 0) {
    throw badRequest('Upload a drawing before running scrutiny.');
  }

  // A file still being virus-checked has not been cleared to leave the system,
  // and sending it to a third-party engine is exactly that.
  const unscanned = versions.filter((v) => v.file.scanStatus === 'PENDING');
  if (unscanned.length) {
    throw badRequest('Your drawings are still being checked for viruses. Try again in a moment.');
  }
  const infected = versions.filter((v) => v.file.scanStatus === 'INFECTED');
  if (infected.length) {
    throw badRequest('One of your drawings was quarantined. Upload a clean copy before running scrutiny.');
  }

  // ── The gate is off for this application type ─────────────────────────
  if (!app.applicationType?.requiresScrutiny) {
    return skipScrutinyGate(user, app.id, app.applicationNumber, meta);
  }

  const provider = currentProvider();
  if (!provider.configured) {
    throw serviceUnavailable(
      'Automated scrutiny is not available on this deployment. Contact the department.'
    );
  }

  const requests = await prisma.$transaction(async (tx) => {
    // Re-assert the status inside the transaction. Two tabs pressing "Run
    // scrutiny" together would otherwise both pass the check above and queue
    // two sets of runs.
    const claimed = await tx.application.updateMany({
      where: {
        id: app.id,
        deletedAt: null,
        status: { in: ['SUBMITTED', 'DRAWING_UPLOADED', 'SCRUTINY_FAILED'] },
      },
      data: { status: 'SCRUTINY_IN_PROGRESS', updatedAt: new Date() },
    });

    if (claimed.count === 0) throw forbidden('Scrutiny is already running on this application.');

    const created = [];
    for (const version of versions) {
      // `attempt` counts how many times THIS version has been sent, which is
      // what tells an officer that a drawing was re-checked without being
      // changed.
      const priorAttempts = await tx.scrutinyRequest.count({
        where: { drawingVersionId: version.id },
      });

      const request = await tx.scrutinyRequest.create({
        data: {
          drawingVersionId: version.id,
          engineDriver: provider.name,
          status: 'QUEUED',
          attempt: priorAttempts + 1,
          requestedById: user.id,
        },
        select: { id: true, attempt: true, drawingVersionId: true },
      });

      await enqueue(tx, {
        type: JOB_TYPES.RUN_SCRUTINY,
        payload: { scrutinyRequestId: request.id },
        dedupeKey: `scrutiny:run:${request.id}`,
      });

      created.push(request);
    }

    await recordEvent(tx, {
      applicationId: app.id,
      type: EVENT_TYPES.SCRUTINY_STARTED,
      title: 'Scrutiny started',
      description: `${versions.length} drawing${versions.length === 1 ? '' : 's'} sent to the ${provider.name} engine.`,
      actor: user,
      metadata: { engineDriver: provider.name, versionCount: versions.length },
    });

    await audit(tx, {
      actor: user,
      action: 'SCRUTINY_REQUESTED',
      entityType: 'Application',
      entityId: app.id,
      applicationId: app.id,
      after: {
        engineDriver: provider.name,
        // Provenance, recorded forever: an officer opening this file in two
        // years can tell whether it was really machine-checked.
        isDemo: provider.isDemo,
        versions: versions.map((v) => ({ id: v.id, versionNo: v.versionNo })),
      },
      ...meta,
    });

    return created;
  });

  return {
    requested: requests.length,
    engineDriver: provider.name,
    isDemo: provider.isDemo,
    skipped: false,
  };
}

/**
 * The F.8 path: this application type is not machine-checked.
 *
 * The drawing is still versioned, stored and visible to officers — it simply
 * is not sent to an engine, and the file moves straight to documents.
 */
async function skipScrutinyGate(
  user: AuthUser,
  applicationId: string,
  applicationNumber: string,
  meta: Meta
) {
  await prisma.$transaction(async (tx) => {
    await tx.application.update({
      where: { id: applicationId },
      data: { status: 'DOCUMENT_UPLOAD_PENDING', updatedAt: new Date() },
    });

    await recordEvent(tx, {
      applicationId,
      type: EVENT_TYPES.SCRUTINY_PASSED,
      title: 'Drawing accepted without automated scrutiny',
      description:
        'This application type is not machine-checked. The drawing will be reviewed by an officer instead.',
      actor: user,
      metadata: { gate: 'disabled' },
    });

    await audit(tx, {
      actor: user,
      action: 'SCRUTINY_SKIPPED',
      entityType: 'Application',
      entityId: applicationId,
      applicationId,
      after: { reason: 'applicationType.requiresScrutiny = false', applicationNumber },
      ...meta,
    });

    await emit(tx, {
      eventCode: EVENTS.DOCUMENTS_PENDING,
      applicationId,
      payload: { applicationNumber, scrutinySkipped: true },
    });
  });

  return { requested: 0, engineDriver: 'none', isDemo: false, skipped: true };
}

/**
 * Both branches of requestScrutiny return the same shape.
 *
 * A union where only one arm carries `skipped` forces every caller — the API
 * route, the drawings tab, the scrutiny tab — to narrow before it can read the
 * field it cares about, which is friction with no safety benefit here.
 */
export type ScrutinyRequestResult = {
  requested: number;
  engineDriver: string;
  isDemo: boolean;
  skipped: boolean;
};

// ═══════════════════════════════════════════════════════════════════════════
// Running (worker side)
// ═══════════════════════════════════════════════════════════════════════════

/** Rebuilds what the engine needs, from the version's own application. */
async function buildSubmission(scrutinyRequestId: string): Promise<{
  submission: ScrutinySubmission;
  applicationId: string;
} | null> {
  const request = await prisma.scrutinyRequest.findUnique({
    where: { id: scrutinyRequestId },
    select: {
      id: true,
      status: true,
      drawingVersion: {
        select: {
          id: true,
          versionNo: true,
          file: {
            select: {
              id: true,
              originalName: true,
              mimeType: true,
              sizeBytes: true,
              checksumSha256: true,
            },
          },
          drawing: {
            select: {
              category: true,
              applicationId: true,
              application: {
                select: {
                  id: true,
                  applicationNumber: true,
                  property: true,
                  building: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!request) return null;

  const version = request.drawingVersion;
  const app = version.drawing.application;
  const property = app.property;
  const building = app.building;

  return {
    applicationId: app.id,
    submission: {
      requestId: request.id,
      applicationId: app.id,
      applicationNumber: app.applicationNumber,
      drawingVersionId: version.id,
      versionNo: version.versionNo,
      drawingCategory: version.drawing.category,
      file: version.file,
      context: {
        plotAreaSqm: property?.plotAreaSqm ?? null,
        roadWidthM: property?.roadWidthM ?? 0,
        builtUpAreaSqm: building?.builtUpAreaSqm ?? null,
        floorAreaSqm: building?.floorAreaSqm ?? 0,
        coverageAreaSqm: building?.coverageAreaSqm ?? 0,
        parkingAreaSqm: building?.parkingAreaSqm ?? 0,
        achievedFar: building?.achievedFar ?? 0,
        achievedCoverage: building?.achievedCoverage ?? 0,
        numFloors: building?.numFloors ?? 0,
        numBasements: building?.numBasements ?? 0,
        numDwellingUnits: building?.numDwellingUnits ?? 0,
        buildingHeightM: building?.buildingHeightM ?? 0,
        setbackFrontM: building?.setbackFrontM ?? 0,
        setbackRearM: building?.setbackRearM ?? 0,
        setbackLeftM: building?.setbackLeftM ?? 0,
        setbackRightM: building?.setbackRightM ?? 0,
        buildingUse: building?.buildingUse ?? '',
        occupancyType: building?.occupancyType ?? '',
      },
    },
  };
}

/**
 * Submits one queued request to the engine. Called by the RUN_SCRUTINY job.
 *
 * Throwing is meaningful here: the job queue retries with backoff, and after
 * `maxAttempts` the request is marked ERRORED by `failScrutiny`. A transport
 * problem therefore looks like a transport problem all the way through, and
 * never like a failed drawing.
 */
export async function runScrutiny(scrutinyRequestId: string): Promise<void> {
  const built = await buildSubmission(scrutinyRequestId);
  if (!built) return; // Request vanished — nothing to do.

  await prisma.scrutinyRequest.updateMany({
    where: { id: scrutinyRequestId, status: 'QUEUED' },
    data: { status: 'RUNNING', startedAt: new Date() },
  });

  const provider = currentProvider();
  const ack = await provider.submit(built.submission);

  if (ack.kind === 'terminal') {
    await applyOutcome(scrutinyRequestId, ack.outcome);
    return;
  }

  // Pending: remember the handle and come back for it.
  await prisma.scrutinyRequest.update({
    where: { id: scrutinyRequestId },
    data: { externalRef: ack.externalRef },
  });

  await enqueue(prisma, {
    type: JOB_TYPES.POLL_SCRUTINY,
    payload: { scrutinyRequestId },
    delayMs: ack.retryAfterMs ?? 5000,
    dedupeKey: `scrutiny:poll:${scrutinyRequestId}:${Date.now()}`,
  });
}

/**
 * Asks a pending request for its result. Called by the POLL_SCRUTINY job.
 *
 * A null answer means "still working": the job reschedules rather than
 * treating silence as a verdict.
 */
export async function pollScrutiny(scrutinyRequestId: string): Promise<void> {
  const request = await prisma.scrutinyRequest.findUnique({
    where: { id: scrutinyRequestId },
    select: { id: true, status: true, externalRef: true },
  });

  if (!request || request.status === 'COMPLETED' || request.status === 'CANCELLED') return;
  if (!request.externalRef) return;

  const provider = currentProvider();
  if (!provider.poll) throw new Error(`Provider ${provider.name} cannot poll.`);

  const built = await buildSubmission(scrutinyRequestId);
  if (!built) return;

  const outcome = await provider.poll(request.externalRef, built.submission);

  if (!outcome) {
    await enqueue(prisma, {
      type: JOB_TYPES.POLL_SCRUTINY,
      payload: { scrutinyRequestId },
      delayMs: 5000,
      dedupeKey: `scrutiny:poll:${scrutinyRequestId}:${Date.now()}`,
    });
    return;
  }

  await applyOutcome(scrutinyRequestId, outcome);
}

/**
 * Marks a request as having errored, after its retries are exhausted.
 *
 * Deliberately does NOT set SCRUTINY_FAILED on the application. The engine
 * broke; the drawing was never judged. Saying otherwise would tell an
 * applicant to correct a drawing that may be perfectly correct.
 */
export async function failScrutiny(scrutinyRequestId: string, message: string): Promise<void> {
  const request = await prisma.scrutinyRequest.findUnique({
    where: { id: scrutinyRequestId },
    select: { id: true, drawingVersion: { select: { drawing: { select: { applicationId: true } } } } },
  });
  if (!request) return;

  const applicationId = request.drawingVersion.drawing.applicationId;

  await prisma.$transaction(async (tx) => {
    await tx.scrutinyRequest.update({
      where: { id: scrutinyRequestId },
      data: { status: 'ERRORED', completedAt: new Date(), errorMessage: message.slice(0, 1000) },
    });

    await recordEvent(tx, {
      applicationId,
      type: EVENT_TYPES.SCRUTINY_FAILED,
      title: 'Scrutiny could not be completed',
      description:
        'The scrutiny engine could not be reached. Your drawing has NOT been rejected — run scrutiny again.',
      metadata: { scrutinyRequestId, error: message.slice(0, 300) },
    });
  });

  await reconcileStatus(applicationId);
}

// ═══════════════════════════════════════════════════════════════════════════
// Applying an outcome — the single convergence point
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Writes a provider's verdict and reconciles the application.
 *
 * Idempotent: a duplicate callback, a retried job and a poll that races a
 * callback all land here, and the `scrutinyRequestId` unique constraint on
 * ScrutinyResult means the second one is a no-op rather than a second result.
 */
export async function applyOutcome(
  scrutinyRequestId: string,
  outcome: ScrutinyOutcome
): Promise<{ applied: boolean; applicationId: string | null }> {
  const request = await prisma.scrutinyRequest.findUnique({
    where: { id: scrutinyRequestId },
    select: {
      id: true,
      status: true,
      engineDriver: true,
      result: { select: { id: true } },
      drawingVersion: {
        select: {
          id: true,
          versionNo: true,
          drawing: { select: { applicationId: true, title: true } },
        },
      },
    },
  });

  if (!request) return { applied: false, applicationId: null };

  const applicationId = request.drawingVersion.drawing.applicationId;

  // Already settled. Arriving twice is normal for callbacks, not an error.
  if (request.result) return { applied: false, applicationId };

  const counts = tally(outcome.issues);

  await prisma.$transaction(async (tx) => {
    // Rules are resolved by code so an issue links to its catalogue entry —
    // which is where the severity, category and remedy come from. An unknown
    // code still records the issue rather than dropping it.
    const rules = await tx.scrutinyRule.findMany({
      where: { code: { in: outcome.issues.map((i) => i.ruleCode) } },
      select: { id: true, code: true },
    });
    const ruleIdByCode = new Map(rules.map((r) => [r.code, r.id]));

    const result = await tx.scrutinyResult.create({
      data: {
        scrutinyRequestId,
        outcome: outcome.outcome,
        criticalCount: counts.CRITICAL,
        majorCount: counts.MAJOR,
        minorCount: counts.MINOR,
        infoCount: counts.INFO,
        checksRun: outcome.checksRun,
        checksPassed: Math.min(outcome.checksPassed, outcome.checksRun),
        summary: outcome.summary,
        rawPayload: (outcome.raw ?? {}) as never,
        issues: {
          create: outcome.issues.map((issue) => ({
            ruleId: ruleIdByCode.get(issue.ruleCode) ?? null,
            ruleCode: issue.ruleCode,
            severity: issue.severity,
            title: issue.title,
            description: issue.description,
            expectedValue: issue.expectedValue ?? '',
            actualValue: issue.actualValue ?? '',
            layer: issue.layer ?? '',
            locationHint: (issue.locationHint ?? {}) as never,
          })),
        },
      },
      select: { id: true },
    });

    await tx.scrutinyRequest.update({
      where: { id: scrutinyRequestId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        externalRef: outcome.externalRef || undefined,
        errorMessage: '',
      },
    });

    const passed = outcome.outcome === 'PASS';

    await recordEvent(tx, {
      applicationId,
      type: passed ? EVENT_TYPES.SCRUTINY_PASSED : EVENT_TYPES.SCRUTINY_FAILED,
      title: passed
        ? `Scrutiny passed — ${request.drawingVersion.drawing.title} V${request.drawingVersion.versionNo}`
        : `Scrutiny failed — ${request.drawingVersion.drawing.title} V${request.drawingVersion.versionNo}`,
      description: outcome.summary,
      metadata: {
        scrutinyRequestId,
        scrutinyResultId: result.id,
        versionNo: request.drawingVersion.versionNo,
        engineDriver: request.engineDriver,
        checksRun: outcome.checksRun,
        checksPassed: outcome.checksPassed,
        ...counts,
      },
    });

    await audit(tx, {
      action: passed ? 'SCRUTINY_PASSED' : 'SCRUTINY_FAILED',
      entityType: 'ScrutinyResult',
      entityId: result.id,
      applicationId,
      after: {
        outcome: outcome.outcome,
        engineDriver: request.engineDriver,
        versionNo: request.drawingVersion.versionNo,
        checksRun: outcome.checksRun,
        checksPassed: outcome.checksPassed,
        ...counts,
      },
      remarks: outcome.summary.slice(0, 500),
    });

    await emit(tx, {
      eventCode: passed ? EVENTS.SCRUTINY_PASSED : EVENTS.SCRUTINY_FAILED,
      applicationId,
      payload: {
        scrutinyResultId: result.id,
        outcome: outcome.outcome,
        versionNo: request.drawingVersion.versionNo,
        summary: outcome.summary,
      },
    });

    // The report is rendered out of band — it is a file write, which has no
    // business inside a database transaction.
    await enqueue(tx, {
      type: JOB_TYPES.RENDER_SCRUTINY_REPORT,
      payload: { scrutinyResultId: result.id },
      dedupeKey: `scrutiny:report:${result.id}`,
    });
  });

  await reconcileStatus(applicationId);
  return { applied: true, applicationId };
}

const tally = (issues: ScrutinyOutcome['issues']) => ({
  CRITICAL: issues.filter((i) => i.severity === 'CRITICAL').length,
  MAJOR: issues.filter((i) => i.severity === 'MAJOR').length,
  MINOR: issues.filter((i) => i.severity === 'MINOR').length,
  INFO: issues.filter((i) => i.severity === 'INFO').length,
});

/**
 * Derives the application's status from the latest run of every active sheet.
 *
 * Derived rather than accumulated, so it is self-correcting: whatever order
 * results arrive in, and however many times a job retries, the status is a
 * pure function of what the drawings currently say.
 *
 *   any still queued or running  → SCRUTINY_IN_PROGRESS
 *   any errored                  → DRAWING_UPLOADED   (not judged; retryable)
 *   any failed                   → SCRUTINY_FAILED
 *   all passed                   → SCRUTINY_PASSED    (documents unlock)
 */
export async function reconcileStatus(applicationId: string): Promise<ApplicationStatus | null> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true, status: true, applicationNumber: true },
  });
  if (!app) return null;

  // Only reconcile while the application is in the scrutiny phase. Once it has
  // moved on to documents or the department, a late-arriving result must not
  // drag it backwards.
  const RECONCILABLE: string[] = [
    'DRAWING_UPLOADED',
    'SCRUTINY_IN_PROGRESS',
    'SCRUTINY_FAILED',
    'SCRUTINY_PASSED',
  ];
  if (!RECONCILABLE.includes(app.status)) return null;

  const versions = await prisma.drawingVersion.findMany({
    where: { isActive: true, drawing: { applicationId } },
    select: {
      id: true,
      scrutinyRequests: {
        select: { status: true, result: { select: { outcome: true } } },
        orderBy: { requestedAt: 'desc' },
        take: 1,
      },
    },
  });

  if (versions.length === 0) return null;

  const latest = versions.map((v) => v.scrutinyRequests[0] ?? null);

  // A sheet that has never been scrutinised means the set is not decided.
  if (latest.some((r) => r === null)) return null;

  let next: ApplicationStatus;
  if (latest.some((r) => r!.status === 'QUEUED' || r!.status === 'RUNNING')) {
    next = 'SCRUTINY_IN_PROGRESS';
  } else if (latest.some((r) => r!.status === 'ERRORED')) {
    next = 'DRAWING_UPLOADED';
  } else if (latest.some((r) => r!.result?.outcome === 'FAIL')) {
    next = 'SCRUTINY_FAILED';
  } else if (latest.every((r) => r!.result?.outcome === 'PASS')) {
    next = 'SCRUTINY_PASSED';
  } else {
    return null;
  }

  if (next === app.status) return next;

  await prisma.application.update({
    where: { id: applicationId },
    data: { status: next, updatedAt: new Date() },
  });

  return next;
}

// ═══════════════════════════════════════════════════════════════════════════
// Reading
// ═══════════════════════════════════════════════════════════════════════════

/** Everything the Scrutiny tab renders, for one application. */
export async function getScrutiny(user: AuthUser, applicationId: string) {
  if (!isUuid(applicationId)) throw notFound('That application could not be found.');

  const app = await prisma.application.findFirst({
    where: { id: applicationId, deletedAt: null, ...applicationScope(user) },
    select: {
      id: true,
      applicationNumber: true,
      status: true,
      applicationType: { select: { requiresScrutiny: true } },
    },
  });

  if (!app) throw notFound('That application could not be found.');

  const requests = await prisma.scrutinyRequest.findMany({
    where: { drawingVersion: { drawing: { applicationId: app.id } } },
    select: {
      id: true,
      status: true,
      engineDriver: true,
      attempt: true,
      requestedAt: true,
      startedAt: true,
      completedAt: true,
      errorMessage: true,
      drawingVersion: {
        select: {
          id: true,
          versionNo: true,
          isActive: true,
          drawing: { select: { id: true, title: true, category: true } },
        },
      },
      result: {
        select: {
          id: true,
          outcome: true,
          summary: true,
          criticalCount: true,
          majorCount: true,
          minorCount: true,
          infoCount: true,
          checksRun: true,
          checksPassed: true,
          evaluatedAt: true,
          report: { select: { id: true, isDemo: true, generatedAt: true } },
          issues: {
            select: {
              id: true,
              ruleCode: true,
              severity: true,
              title: true,
              description: true,
              expectedValue: true,
              actualValue: true,
              layer: true,
              rule: { select: { category: true, remedy: true, reference: true } },
            },
          },
        },
      },
    },
    orderBy: { requestedAt: 'desc' },
  });

  // Issues sorted worst-first, so the thing to fix is at the top.
  for (const request of requests) {
    request.result?.issues.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  }

  const latestByVersion = new Map<string, (typeof requests)[number]>();
  for (const request of requests) {
    if (!latestByVersion.has(request.drawingVersion.id)) {
      latestByVersion.set(request.drawingVersion.id, request);
    }
  }

  const current = [...latestByVersion.values()].filter((r) => r.drawingVersion.isActive);

  return {
    application: {
      id: app.id,
      applicationNumber: app.applicationNumber,
      status: app.status,
      requiresScrutiny: app.applicationType?.requiresScrutiny ?? true,
    },
    canRequest: canRequestScrutiny(app.status),
    requestBlockedReason: whyCannotRequestScrutiny(app.status),
    /** The runs that decide the current status. */
    current,
    /** Every run ever, newest first — the correction history. */
    history: requests,
    totals: aggregateTotals(current),
  };
}

function aggregateTotals(requests: Array<{ result: { checksRun: number; checksPassed: number; criticalCount: number; majorCount: number; minorCount: number; infoCount: number } | null }>) {
  return requests.reduce(
    (acc, r) => {
      if (!r.result) return acc;
      return {
        checksRun: acc.checksRun + r.result.checksRun,
        checksPassed: acc.checksPassed + r.result.checksPassed,
        critical: acc.critical + r.result.criticalCount,
        major: acc.major + r.result.majorCount,
        minor: acc.minor + r.result.minorCount,
        info: acc.info + r.result.infoCount,
      };
    },
    { checksRun: 0, checksPassed: 0, critical: 0, major: 0, minor: 0, info: 0 }
  );
}

/** Blocking issues across the current run — what must be fixed to pass. */
export function blockingIssuesOf(
  requests: Array<{ result: { issues: Array<{ severity: string }> } | null }>
): number {
  return requests.reduce(
    (n, r) => n + (r.result?.issues.filter((i) => isBlocking(i.severity)).length ?? 0),
    0
  );
}

/** Resolves a result the caller may read, scoped through its application. */
export async function requireScrutinyResult(user: AuthUser, resultId: string) {
  if (!isUuid(resultId)) throw notFound('That scrutiny result could not be found.');

  const result = await prisma.scrutinyResult.findFirst({
    where: {
      id: resultId,
      request: {
        drawingVersion: { drawing: { application: { deletedAt: null, ...applicationScope(user) } } },
      },
    },
    select: {
      id: true,
      outcome: true,
      summary: true,
      criticalCount: true,
      majorCount: true,
      minorCount: true,
      infoCount: true,
      checksRun: true,
      checksPassed: true,
      evaluatedAt: true,
      report: true,
      issues: {
        select: {
          id: true,
          ruleCode: true,
          severity: true,
          title: true,
          description: true,
          expectedValue: true,
          actualValue: true,
          layer: true,
          rule: { select: { category: true, remedy: true, reference: true, name: true } },
        },
      },
      request: {
        select: {
          id: true,
          engineDriver: true,
          requestedAt: true,
          completedAt: true,
          attempt: true,
          drawingVersion: {
            select: {
              id: true,
              versionNo: true,
              uploadedAt: true,
              file: { select: { originalName: true, checksumSha256: true } },
              drawing: {
                select: {
                  title: true,
                  category: true,
                  applicationId: true,
                  application: { select: { applicationNumber: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!result) throw notFound('That scrutiny result could not be found.');

  result.issues.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  return result;
}

export type ScrutinyResultDetail = NonNullable<Awaited<ReturnType<typeof requireScrutinyResult>>>;

/** Narrow type used by the report renderer. */
export type ScrutinyResultForReport = Prisma.ScrutinyResultGetPayload<Record<string, never>>;

export { type Tx };
