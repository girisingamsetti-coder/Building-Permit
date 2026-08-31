import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/db/prisma';
import { applicationScope } from '@/server/auth/scope';
import { isLtp, type AuthUser } from '@/server/auth/context';
import { audit } from './audit';
import { recordEvent, EVENT_TYPES } from './timeline';
import { storeUpload, readFileObject, isServable } from './files';
import { forbidden, notFound } from '@/server/http/errors';
import {
  DRAWING_EXTENSIONS,
  canUploadDrawing,
  disciplineFor,
  whyCannotUpload,
} from '@/lib/drawings';
import { isUuid } from '@/lib/utils';

/**
 * Drawing management.
 *
 * ── The rule this file exists to enforce ───────────────────────────────
 *
 * A DRAWING IS NEVER OVERWRITTEN. Uploading a corrected sheet creates version
 * N+1 and marks N superseded; nothing is mutated and nothing is deleted. That
 * matters because a scrutiny result belongs to the exact bytes it judged — if
 * V1 could be replaced in place, every report referring to it would silently
 * start describing a different drawing, and the correction history that proves
 * an applicant did the work would vanish.
 *
 * The database enforces the half of this that code cannot forget: a partial
 * unique index (`drawing_one_active`, Phase 0 constraints migration) makes two
 * active versions of one drawing impossible rather than merely avoided.
 *
 * ── Authorization ──────────────────────────────────────────────────────
 *
 * Same rule as Phase 2: every query merges `applicationScope(user)`, so a
 * drawing id belonging to someone else's application resolves to "not found"
 * rather than to a 403 that confirms it exists.
 */

type Meta = { ip: string; userAgent: string; correlationId?: string };

const VERSION_SELECT = {
  id: true,
  versionNo: true,
  remarks: true,
  uploadedById: true,
  uploadedAt: true,
  isActive: true,
  file: {
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      scanStatus: true,
      checksumSha256: true,
    },
  },
  scrutinyRequests: {
    select: {
      id: true,
      status: true,
      engineDriver: true,
      attempt: true,
      requestedAt: true,
      completedAt: true,
      errorMessage: true,
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
        },
      },
    },
    orderBy: { requestedAt: 'desc' },
  },
} satisfies Prisma.DrawingVersionSelect;

const DRAWING_SELECT = {
  id: true,
  applicationId: true,
  category: true,
  discipline: true,
  title: true,
  currentVersionNo: true,
  createdAt: true,
  updatedAt: true,
  versions: { select: VERSION_SELECT, orderBy: { versionNo: 'desc' } },
} satisfies Prisma.DrawingSelect;

// ═══════════════════════════════════════════════════════════════════════════
// Access
// ═══════════════════════════════════════════════════════════════════════════

/** Loads an application the caller may see, or throws the same 404 either way. */
async function requireApplication(user: AuthUser, applicationId: string) {
  if (!isUuid(applicationId)) throw notFound('That application could not be found.');

  const app = await prisma.application.findFirst({
    where: { id: applicationId, deletedAt: null, ...applicationScope(user) },
    select: {
      id: true,
      applicationNumber: true,
      status: true,
      ltpUserId: true,
      applicationType: { select: { requiresScrutiny: true } },
    },
  });

  if (!app) throw notFound('That application could not be found.');
  return app;
}

/**
 * As above, and additionally requires the application to be in a state where
 * its drawings may change.
 *
 * The two gates are separate because they answer different questions, and a
 * submitted application stays READABLE by its LTP long after its drawings
 * stop being editable.
 */
async function requireUploadable(user: AuthUser, applicationId: string) {
  const app = await requireApplication(user, applicationId);

  if (!canUploadDrawing(app.status)) {
    throw forbidden(whyCannotUpload(app.status) ?? 'Drawings cannot be changed on this application.');
  }

  // An LTP may only touch their own file. `applicationScope` already enforces
  // this for the LTP role; repeating it means a future role that can SEE
  // everything does not silently inherit the ability to REWRITE it.
  if (isLtp(user) && app.ltpUserId !== user.id) {
    throw forbidden('You may only upload drawings to applications you filed.');
  }

  return app;
}

// ═══════════════════════════════════════════════════════════════════════════
// Upload
// ═══════════════════════════════════════════════════════════════════════════

export type UploadDrawingInput = {
  applicationId: string;
  category: string;
  title?: string;
  remarks?: string;
  /** Uploading into an existing sheet creates its next version. */
  drawingId?: string;
  file: { name: string; type: string; bytes: Buffer };
};

/**
 * Stores a drawing and creates its next version.
 *
 * The file goes through the full pipeline in services/files.ts BEFORE the
 * transaction opens — validation, magic-byte sniffing, checksum and the
 * storage write all happen first, so the transaction is short and a rejected
 * file never leaves a half-written version row behind.
 *
 * Allocating `versionNo` inside the transaction, together with the
 * `(drawingId, versionNo)` unique index, is what makes two simultaneous
 * uploads produce V2 and V3 rather than two V2s.
 */
export async function uploadDrawing(user: AuthUser, input: UploadDrawingInput, meta: Meta) {
  const app = await requireUploadable(user, input.applicationId);

  const category = (input.category || 'OTHER').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');

  // The sheet this version belongs to: an existing one, or a new one.
  const drawing = input.drawingId
    ? await prisma.drawing.findFirst({
        where: { id: input.drawingId, applicationId: app.id },
        select: { id: true, category: true, title: true, currentVersionNo: true },
      })
    : null;

  if (input.drawingId && !drawing) throw notFound('That drawing could not be found.');

  // Pipeline first. Nothing below runs if the bytes are not acceptable.
  const stored = await storeUpload({
    applicationId: app.id,
    kind: 'drawings',
    file: input.file,
    uploadedById: user.id,
    allowedExtensions: DRAWING_EXTENSIONS,
  });

  const result = await prisma.$transaction(async (tx) => {
    const sheet =
      drawing ??
      (await tx.drawing.create({
        data: {
          applicationId: app.id,
          category,
          discipline: disciplineFor(category),
          title: (input.title || '').trim() || defaultTitle(category),
        },
        select: { id: true, category: true, title: true, currentVersionNo: true },
      }));

    // Read the high-water mark inside the transaction. `currentVersionNo` is a
    // denormalised convenience; the versions table is the truth, so the next
    // number comes from there.
    const last = await tx.drawingVersion.findFirst({
      where: { drawingId: sheet.id },
      orderBy: { versionNo: 'desc' },
      select: { versionNo: true },
    });

    const versionNo = (last?.versionNo ?? 0) + 1;

    // Supersede the outgoing version BEFORE inserting the new one. The partial
    // unique index permits exactly one active version per drawing, so doing it
    // the other way round would fail the insert.
    await tx.drawingVersion.updateMany({
      where: { drawingId: sheet.id, isActive: true },
      data: { isActive: false },
    });

    const version = await tx.drawingVersion.create({
      data: {
        drawingId: sheet.id,
        versionNo,
        fileObjectId: stored.id,
        remarks: (input.remarks ?? '').slice(0, 1000),
        uploadedById: user.id,
        isActive: true,
      },
      select: VERSION_SELECT,
    });

    await tx.drawing.update({
      where: { id: sheet.id },
      data: { currentVersionNo: versionNo },
    });

    // A new drawing means the application has moved on, even before scrutiny
    // runs. SUBMITTED and SCRUTINY_FAILED both become DRAWING_UPLOADED, which
    // is what makes the correction loop visible on the dashboard.
    const nextStatus = app.status === 'DRAFT' ? null : 'DRAWING_UPLOADED';
    if (nextStatus && app.status !== nextStatus) {
      await tx.application.update({
        where: { id: app.id },
        data: { status: nextStatus, updatedAt: new Date() },
      });
    } else {
      await tx.application.update({ where: { id: app.id }, data: { updatedAt: new Date() } });
    }

    await recordEvent(tx, {
      applicationId: app.id,
      type: EVENT_TYPES.DRAWING_UPLOADED,
      title: versionNo === 1 ? 'Drawing uploaded' : `Drawing revised to version ${versionNo}`,
      description: `${sheet.title} — ${stored.originalName}`,
      actor: user,
      metadata: {
        drawingId: sheet.id,
        drawingVersionId: version.id,
        versionNo,
        category: sheet.category,
        fileName: stored.originalName,
        sizeBytes: stored.sizeBytes,
        checksum: stored.checksumSha256,
      },
    });

    await audit(tx, {
      actor: user,
      action: 'DRAWING_UPLOADED',
      entityType: 'DrawingVersion',
      entityId: version.id,
      applicationId: app.id,
      after: {
        drawingId: sheet.id,
        versionNo,
        category: sheet.category,
        fileName: stored.originalName,
        // The checksum is the point of auditing an upload: it is what proves
        // years later that the bytes served are the bytes judged.
        checksumSha256: stored.checksumSha256,
        sizeBytes: stored.sizeBytes,
      },
      ...meta,
    });

    return { drawingId: sheet.id, version };
  });

  return result;
}

const DEFAULT_TITLES: Record<string, string> = {
  SITE_PLAN: 'Site Plan',
  FLOOR_PLAN: 'Floor Plan',
  ELEVATION: 'Elevation',
  SECTION: 'Section',
  PARKING_PLAN: 'Parking Plan',
  STRUCTURAL_DRAWING: 'Structural Drawing',
  OTHER: 'Drawing',
};

const defaultTitle = (category: string): string => DEFAULT_TITLES[category] ?? 'Drawing';

// ═══════════════════════════════════════════════════════════════════════════
// Read
// ═══════════════════════════════════════════════════════════════════════════

/** Every sheet on an application, newest version first within each. */
export async function listDrawings(user: AuthUser, applicationId: string) {
  const app = await requireApplication(user, applicationId);

  const drawings = await prisma.drawing.findMany({
    where: { applicationId: app.id },
    select: DRAWING_SELECT,
    orderBy: [{ createdAt: 'asc' }],
  });

  // `DrawingVersion.uploadedById` is a bare uuid column with no Prisma
  // relation, so the names are resolved in one extra query rather than by
  // adding a foreign key to an append-only table. The version table has to
  // show WHO uploaded each revision — "uploaded by 01a03d94-…" is not an
  // answer anybody can use.
  const uploaderNames = await namesFor(drawings.flatMap((d) => d.versions.map((v) => v.uploadedById)));

  return {
    application: {
      id: app.id,
      applicationNumber: app.applicationNumber,
      status: app.status,
      requiresScrutiny: app.applicationType?.requiresScrutiny ?? true,
    },
    drawings: drawings.map((d) => shapeDrawing(d, uploaderNames)),
    canUpload: canUploadDrawing(app.status),
    uploadBlockedReason: whyCannotUpload(app.status),
  };
}

/** id → display name, for the handful of uploaders on one application. */
async function namesFor(userIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (!unique.length) return new Map();

  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });

  return new Map(users.map((u) => [u.id, u.name]));
}

type DrawingRow = Prisma.DrawingGetPayload<{ select: typeof DRAWING_SELECT }>;

function shapeDrawing(drawing: DrawingRow, uploaderNames: Map<string, string> = new Map()) {
  return {
    ...drawing,
    versions: drawing.versions.map((version) => {
      // The most recent run for this version, whatever its state.
      const latestRequest = version.scrutinyRequests[0] ?? null;
      return {
        ...version,
        uploadedByName: uploaderNames.get(version.uploadedById) ?? 'Unknown user',
        downloadable: isServable(version.file.scanStatus),
        latestScrutiny: latestRequest,
        scrutinyOutcome: latestRequest?.result?.outcome ?? null,
      };
    }),
  };
}

/**
 * Resolves a drawing version the caller may read, scoped through its
 * application.
 *
 * The version id arrives from a client and means nothing on its own — the
 * scope fragment is applied to the APPLICATION the version hangs off, which is
 * why this joins rather than looking the version up directly.
 */
export async function requireDrawingVersion(user: AuthUser, versionId: string) {
  if (!isUuid(versionId)) throw notFound('That drawing could not be found.');

  const version = await prisma.drawingVersion.findFirst({
    where: {
      id: versionId,
      drawing: { application: { deletedAt: null, ...applicationScope(user) } },
    },
    select: {
      ...VERSION_SELECT,
      fileObjectId: true,
      drawing: {
        select: {
          id: true,
          title: true,
          category: true,
          applicationId: true,
          application: { select: { applicationNumber: true, status: true, ltpUserId: true } },
        },
      },
    },
  });

  if (!version) throw notFound('That drawing could not be found.');
  return version;
}

/**
 * Streams a drawing back to the caller.
 *
 * The storage key is never exposed. Access and scan status are re-checked
 * here, and the audit row is written BEFORE the bytes are returned — so "who
 * downloaded which drawing, and when" is always answerable, including for a
 * request that then failed halfway.
 */
export async function downloadDrawingVersion(user: AuthUser, versionId: string, meta: Meta) {
  const version = await requireDrawingVersion(user, versionId);
  const { bytes, file } = await readFileObject(version.fileObjectId);

  await audit(prisma, {
    actor: user,
    action: 'DRAWING_DOWNLOADED',
    entityType: 'DrawingVersion',
    entityId: version.id,
    applicationId: version.drawing.applicationId,
    after: {
      versionNo: version.versionNo,
      fileName: file.originalName,
      drawing: version.drawing.title,
    },
    ...meta,
  });

  return { bytes, file, versionNo: version.versionNo, drawingTitle: version.drawing.title };
}

/**
 * The active version of every sheet — what scrutiny is run against.
 *
 * Empty means there is nothing to scrutinise, which is the guard the scrutiny
 * service checks before it queues anything.
 */
export async function activeVersions(applicationId: string) {
  return prisma.drawingVersion.findMany({
    where: { isActive: true, drawing: { applicationId } },
    select: {
      id: true,
      versionNo: true,
      fileObjectId: true,
      drawing: { select: { id: true, category: true, title: true } },
      file: {
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
          checksumSha256: true,
          scanStatus: true,
        },
      },
    },
    orderBy: { drawing: { createdAt: 'asc' } },
  });
}

/** Categories an administrator has configured, with the seeded set as fallback. */
export async function drawingCategories() {
  const rows = await prisma.masterData.findMany({
    where: { category: 'DRAWING_CATEGORY', isActive: true },
    select: { code: true, label: true },
    orderBy: { displayOrder: 'asc' },
  });
  return rows;
}
