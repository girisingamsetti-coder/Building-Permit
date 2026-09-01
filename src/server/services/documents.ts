import 'server-only';
import type { DocumentStatus, ScanStatus, Prisma } from '@prisma/client';
import { prisma, type Db, type Tx } from '@/server/db/prisma';
import { applicationScope } from '@/server/auth/scope';
import { isLtp, type AuthUser } from '@/server/auth/context';
import { audit } from './audit';
import { emit, EVENTS } from '@/server/events/outbox';
import { recordEvent, EVENT_TYPES } from './timeline';
import { storeUpload, readFileObject, isServable } from './files';
import { settingBool } from './settings';
import { badRequest, businessRule, forbidden, notFound } from '@/server/http/errors';
import { evaluateCondition, describeCondition, isAlways } from '@/lib/conditions';
import type { DocumentListQuery } from '@/lib/schemas/documents';
import { ALLOWED_UPLOAD_EXTENSIONS } from '@/lib/constants';
import {
  DEFAULT_DOCUMENT_MAX_MB,
  DOCUMENT_EXTENSIONS,
  DOCUMENT_PHASE_STATUSES,
  canUploadDocument,
  isPreviewable,
  satisfiesRequirement,
  whyCannotUploadDocument,
  whyNotSatisfied,
} from '@/lib/documents';
import { isUuid } from '@/lib/utils';

/**
 * Document management.
 *
 * ── The two rules this file exists to enforce ──────────────────────────
 *
 * 1. A DOCUMENT IS NEVER OVERWRITTEN. Replacing a rejected sale deed creates
 *    version N+1 and supersedes N; nothing is mutated and nothing is deleted.
 *    The rejected version stays, with the remark that rejected it — because
 *    "the department asked for this twice" is a fact an applicant may need to
 *    prove, and an officer's decision must remain attached to the exact bytes
 *    it was made about. The partial unique index `document_one_active` (Phase 0
 *    constraints migration) makes two current versions impossible rather than
 *    merely avoided.
 *
 * 2. THE REQUIRED LIST IS DERIVED, NEVER STORED. `resolveRequirements()`
 *    evaluates `document_requirements` against the application every time it is
 *    asked. A building that grows from three floors to five starts requiring a
 *    structural certificate immediately, with no migration, no re-computation
 *    step and no stale checklist row to reconcile. `application_documents` rows
 *    exist only where something has actually been uploaded.
 *
 * That second rule is what makes the completeness gate honest: there is ONE
 * implementation of "which documents does this application need", and the
 * checklist, the LTP dashboard and the fee guard all call it.
 */

type Meta = { ip: string; userAgent: string; correlationId?: string };

// ═══════════════════════════════════════════════════════════════════════════
// Access
// ═══════════════════════════════════════════════════════════════════════════

const APPLICATION_SELECT = {
  id: true,
  applicationNumber: true,
  status: true,
  ltpUserId: true,
  applicationTypeId: true,
  purpose: true,
  applicationType: { select: { id: true, code: true, name: true } },
  zone: { select: { code: true, name: true } },
  applicant: { select: { ownerSameAsApplicant: true } },
  property: true,
  building: true,
} satisfies Prisma.ApplicationSelect;

type ApplicationRow = Prisma.ApplicationGetPayload<{ select: typeof APPLICATION_SELECT }>;

/** Loads an application the caller may see, or throws the same 404 either way. */
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

/** As above, and additionally requires documents to be changeable right now. */
async function requireUploadable(user: AuthUser, applicationId: string) {
  const app = await requireApplication(user, applicationId);

  if (!canUploadDocument(app.status)) {
    throw forbidden(
      whyCannotUploadDocument(app.status) ?? 'Documents cannot be changed on this application.'
    );
  }

  // `applicationScope` already confines an LTP to their own files. Repeating it
  // means a future role that can SEE everything does not silently inherit the
  // ability to REWRITE it.
  if (isLtp(user) && app.ltpUserId !== user.id) {
    throw forbidden('You may only upload documents to applications you filed.');
  }

  return app;
}

// ═══════════════════════════════════════════════════════════════════════════
// Requirements — the derived list
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The context a requirement condition is evaluated against.
 *
 * Nested, unlike the flat fee context, because a document rule is written by
 * hand in JSON and `building.numFloors` reads better there than `numFloors`
 * with no clue where it came from. Both shapes go through the same evaluator.
 */
export function buildDocumentContext(app: ApplicationRow): Record<string, unknown> {
  const property = app.property;
  const building = app.building;

  return {
    application: {
      typeCode: app.applicationType?.code ?? '',
      purpose: app.purpose,
      status: app.status,
    },
    zone: { code: app.zone?.code ?? '' },
    applicant: {
      // Drives the commonest conditional document in the set: a no-objection
      // certificate is only demanded when the applicant is not the owner.
      ownerSameAsApplicant: app.applicant?.ownerSameAsApplicant ?? true,
    },
    property: {
      district: property?.district ?? '',
      mandal: property?.mandal ?? '',
      landUseZone: property?.landUseZone ?? '',
      tenureType: property?.tenureType ?? '',
      plotAreaSqm: property?.plotAreaSqm ?? 0,
      roadWidthM: property?.roadWidthM ?? 0,
      layoutName: property?.layoutName ?? '',
      lpNumber: property?.lpNumber ?? '',
    },
    building: {
      buildingUse: building?.buildingUse ?? '',
      buildingSubUse: building?.buildingSubUse ?? '',
      occupancyType: building?.occupancyType ?? '',
      structureType: building?.structureType ?? '',
      numFloors: building?.numFloors ?? 0,
      numBasements: building?.numBasements ?? 0,
      numDwellingUnits: building?.numDwellingUnits ?? 0,
      buildingHeightM: building?.buildingHeightM ?? 0,
      builtUpAreaSqm: building?.builtUpAreaSqm ?? 0,
      floorAreaSqm: building?.floorAreaSqm ?? 0,
      parkingAreaSqm: building?.parkingAreaSqm ?? 0,
      achievedFar: building?.achievedFar ?? 0,
      achievedCoverage: building?.achievedCoverage ?? 0,
    },
  };
}

const REQUIREMENT_SELECT = {
  id: true,
  documentTypeId: true,
  buildingUse: true,
  landUseZone: true,
  isMandatory: true,
  condition: true,
  displayOrder: true,
  helpText: true,
  documentType: {
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      category: true,
      allowedMime: true,
      allowedExtensions: true,
      maxSizeMb: true,
      requiresExpiry: true,
      isActive: true,
    },
  },
} satisfies Prisma.DocumentRequirementSelect;

type RequirementRow = Prisma.DocumentRequirementGetPayload<{ select: typeof REQUIREMENT_SELECT }>;

export type ResolvedRequirement = {
  requirementId: string;
  documentTypeId: string;
  code: string;
  name: string;
  description: string;
  category: string;
  helpText: string;
  isMandatory: boolean;
  displayOrder: number;
  requiresExpiry: boolean;
  maxBytes: number;
  allowedExtensions: string[];
  /** Empty when the requirement is unconditional. */
  whyRequired: string;
};

/**
 * Which documents THIS application needs, right now.
 *
 * Four axes, evaluated in the order an administrator configured them:
 * application type, building type, property type, then the JSON condition for
 * everything else. An empty scalar means "any", which is what lets a single
 * row demand a sale deed of every application ever filed.
 *
 * A requirement whose condition is malformed is treated as NOT APPLYING, and
 * the fault is logged rather than raised: one bad JSON blob in the
 * configuration must not take the checklist down for every applicant. The
 * consequence — a document quietly not being asked for — is why conditions are
 * validated when a requirement is saved.
 */
export async function resolveRequirements(
  app: ApplicationRow,
  db: Db = prisma
): Promise<ResolvedRequirement[]> {
  const rows = await db.documentRequirement.findMany({
    where: {
      isActive: true,
      // Null applicationTypeId = every type.
      OR: [{ applicationTypeId: app.applicationTypeId }, { applicationTypeId: null }],
      documentType: { isActive: true, deletedAt: null },
    },
    select: REQUIREMENT_SELECT,
    orderBy: [{ displayOrder: 'asc' }],
  });

  const context = buildDocumentContext(app);
  const buildingUse = (app.building?.buildingUse ?? '').toUpperCase();
  const landUseZone = (app.property?.landUseZone ?? '').toUpperCase();

  const resolved: ResolvedRequirement[] = [];

  for (const row of rows) {
    if (row.buildingUse && row.buildingUse.toUpperCase() !== buildingUse) continue;
    if (row.landUseZone && row.landUseZone.toUpperCase() !== landUseZone) continue;

    if (!isAlways(row.condition)) {
      try {
        if (!evaluateCondition(row.condition, context)) continue;
      } catch (err) {
        console.error(
          `[documents] requirement ${row.id} has an invalid condition and was skipped:`,
          err instanceof Error ? err.message : err
        );
        continue;
      }
    }

    resolved.push(shapeRequirement(row));
  }

  // Two active rows may name the same document type — one unconditional and
  // one conditional, or one per application type and one global. The applicant
  // is asked for the document ONCE, and the strictest reading wins: if any
  // matching rule says mandatory, it is mandatory.
  const byType = new Map<string, ResolvedRequirement>();
  for (const requirement of resolved) {
    const existing = byType.get(requirement.documentTypeId);
    if (!existing) {
      byType.set(requirement.documentTypeId, requirement);
      continue;
    }
    if (requirement.isMandatory && !existing.isMandatory) {
      byType.set(requirement.documentTypeId, requirement);
    }
  }

  return [...byType.values()].sort(
    (a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)
  );
}

function shapeRequirement(row: RequirementRow): ResolvedRequirement {
  const type = row.documentType;

  // The platform allow-list is the ceiling. A document type may narrow it;
  // nothing may widen it, so a mis-typed extension in the configuration cannot
  // open the upload pipeline to a file class it was never meant to accept.
  const rawExts = Array.isArray(type.allowedExtensions) ? (type.allowedExtensions as string[]) : [];
  const configured = rawExts.length ? rawExts : [...DOCUMENT_EXTENSIONS];
  const allowedExtensions = configured
    .map((e) => e.toLowerCase().replace(/^\./, ''))
    .filter((e) => (ALLOWED_UPLOAD_EXTENSIONS as readonly string[]).includes(e));

  return {
    requirementId: row.id,
    documentTypeId: row.documentTypeId,
    code: type.code,
    name: type.name,
    description: type.description,
    category: type.category,
    helpText: row.helpText,
    isMandatory: row.isMandatory,
    displayOrder: row.displayOrder,
    requiresExpiry: type.requiresExpiry,
    maxBytes: (type.maxSizeMb || DEFAULT_DOCUMENT_MAX_MB) * 1024 * 1024,
    allowedExtensions: allowedExtensions.length ? allowedExtensions : [...DOCUMENT_EXTENSIONS],
    whyRequired: describeCondition(row.condition, CONDITION_LABELS),
  };
}

/**
 * Path → the words a person uses, for the "why is this required" sentence.
 *
 * Every label must be a NOUN PHRASE that reads as the subject of the sentence
 * the describer builds: it is rendered as "Required because <label> <is at
 * least> <4>.". A label written as a verb phrase — "the building has" —
 * produces "Required because the building has is at least 4", which is what an
 * applicant would be shown as the reason a structural certificate is being
 * demanded of them.
 */
const CONDITION_LABELS: Record<string, string> = {
  'building.numFloors': 'the number of floors',
  'building.numBasements': 'the number of basements',
  'building.buildingHeightM': 'the building height in metres',
  'building.builtUpAreaSqm': 'the built-up area in m²',
  'building.numDwellingUnits': 'the number of dwelling units',
  'building.buildingUse': 'the building use',
  'building.occupancyType': 'the occupancy',
  'building.structureType': 'the structure',
  'property.plotAreaSqm': 'the plot area in m²',
  'property.roadWidthM': 'the abutting road width in metres',
  'property.landUseZone': 'the land use',
  'property.tenureType': 'the tenure',
  'property.lpNumber': 'an approved layout number',
  'application.typeCode': 'the application type',
};

// ═══════════════════════════════════════════════════════════════════════════
// The checklist
// ═══════════════════════════════════════════════════════════════════════════

const VERSION_SELECT = {
  id: true,
  versionNo: true,
  status: true,
  remarks: true,
  expiresOn: true,
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
} satisfies Prisma.DocumentVersionSelect;

const DOCUMENT_SELECT = {
  id: true,
  documentTypeId: true,
  status: true,
  isMandatory: true,
  currentVersionNo: true,
  verifiedById: true,
  verifiedAt: true,
  verifyRemarks: true,
  createdAt: true,
  updatedAt: true,
  documentType: {
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      category: true,
      allowedExtensions: true,
      maxSizeMb: true,
      requiresExpiry: true,
    },
  },
  versions: { select: VERSION_SELECT, orderBy: { versionNo: 'desc' } },
} satisfies Prisma.ApplicationDocumentSelect;

type DocumentRow = Prisma.ApplicationDocumentGetPayload<{ select: typeof DOCUMENT_SELECT }>;

export type ChecklistVersion = {
  id: string;
  versionNo: number;
  status: DocumentStatus;
  remarks: string;
  expiresOn: Date | null;
  uploadedById: string;
  uploadedByName: string;
  uploadedAt: Date;
  isActive: boolean;
  downloadable: boolean;
  previewable: boolean;
  file: {
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    scanStatus: string;
    checksumSha256: string;
  };
};

export type ChecklistEntry = {
  documentTypeId: string;
  code: string;
  name: string;
  description: string;
  category: string;
  helpText: string;
  /** False for an upload whose requirement no longer applies. Never removed. */
  isRequired: boolean;
  isMandatory: boolean;
  whyRequired: string;
  requiresExpiry: boolean;
  maxBytes: number;
  allowedExtensions: string[];
  documentId: string | null;
  status: DocumentStatus;
  satisfied: boolean;
  /** Why it does not yet count. Null when it does. */
  outstandingReason: string | null;
  expired: boolean;
  currentVersionNo: number;
  verifiedByName: string | null;
  verifiedAt: Date | null;
  verifyRemarks: string;
  versions: ChecklistVersion[];
};

export type DocumentChecklist = {
  application: {
    id: string;
    applicationNumber: string;
    status: string;
    applicationTypeName: string;
  };
  entries: ChecklistEntry[];
  summary: {
    /** Mandatory requirements that apply to this application. */
    required: number;
    optional: number;
    uploaded: number;
    /** Mandatory and still outstanding. */
    pending: number;
    rejected: number;
    verified: number;
    complete: boolean;
  };
  /** Exactly what is missing — the sentence the fee gate shows. */
  missing: Array<{ code: string; name: string; reason: string }>;
  requiresVerification: boolean;
  canUpload: boolean;
  uploadBlockedReason: string | null;
};

/**
 * Builds the checklist by merging the DERIVED requirement list with whatever
 * has actually been uploaded.
 *
 * An uploaded document whose requirement no longer applies — the building lost
 * a floor, so the structural certificate is no longer demanded — stays on the
 * list marked "no longer required" rather than vanishing. Silently hiding a
 * file somebody uploaded is how a system loses a document and an applicant
 * loses an afternoon.
 */
export async function buildChecklist(
  app: ApplicationRow,
  db: Db = prisma
): Promise<DocumentChecklist> {
  const [requirements, documents, requiresVerification] = await Promise.all([
    resolveRequirements(app, db),
    db.applicationDocument.findMany({
      where: { applicationId: app.id },
      select: DOCUMENT_SELECT,
    }),
    settingBool('documents_complete_requires_verification', false),
  ]);

  const uploaderNames = await namesFor(
    db,
    documents.flatMap((d) => [
      ...d.versions.map((v) => v.uploadedById),
      ...(d.verifiedById ? [d.verifiedById] : []),
    ])
  );

  const byType = new Map(documents.map((d) => [d.documentTypeId, d]));
  const entries: ChecklistEntry[] = [];

  for (const requirement of requirements) {
    entries.push(
      entryFor(requirement, byType.get(requirement.documentTypeId) ?? null, requiresVerification, uploaderNames)
    );
    byType.delete(requirement.documentTypeId);
  }

  // Whatever is left was uploaded but is not currently required.
  for (const document of byType.values()) {
    entries.push(entryForExtra(document, requiresVerification, uploaderNames));
  }

  const missing = entries
    .filter((entry) => entry.isRequired && entry.isMandatory && !entry.satisfied)
    .map((entry) => ({
      code: entry.code,
      name: entry.name,
      reason: entry.outstandingReason ?? 'Not uploaded yet.',
    }));

  const required = entries.filter((e) => e.isRequired && e.isMandatory);
  const optional = entries.filter((e) => e.isRequired && !e.isMandatory);

  return {
    application: {
      id: app.id,
      applicationNumber: app.applicationNumber,
      status: app.status,
      applicationTypeName: app.applicationType?.name ?? 'Application',
    },
    entries,
    summary: {
      required: required.length,
      optional: optional.length,
      uploaded: entries.filter((e) => e.documentId !== null && e.status !== 'REJECTED').length,
      pending: missing.length,
      rejected: entries.filter((e) => e.status === 'REJECTED').length,
      verified: entries.filter((e) => e.status === 'VERIFIED').length,
      complete: missing.length === 0,
    },
    missing,
    requiresVerification,
    canUpload: canUploadDocument(app.status),
    uploadBlockedReason: whyCannotUploadDocument(app.status),
  };
}

function entryFor(
  requirement: ResolvedRequirement,
  document: DocumentRow | null,
  requiresVerification: boolean,
  names: Map<string, string>
): ChecklistEntry {
  const status = (document?.status ?? 'NOT_UPLOADED') as DocumentStatus;
  const active = document?.versions.find((v) => v.isActive) ?? null;
  const expired = isExpired(active?.expiresOn ?? null);

  const satisfied = satisfiesRequirement(status, requiresVerification) && !expired;

  return {
    documentTypeId: requirement.documentTypeId,
    code: requirement.code,
    name: requirement.name,
    description: requirement.description,
    category: requirement.category,
    helpText: requirement.helpText,
    isRequired: true,
    isMandatory: requirement.isMandatory,
    whyRequired: requirement.whyRequired,
    requiresExpiry: requirement.requiresExpiry,
    maxBytes: requirement.maxBytes,
    allowedExtensions: requirement.allowedExtensions,
    documentId: document?.id ?? null,
    status,
    satisfied,
    outstandingReason: satisfied
      ? null
      : expired
        ? 'This document has expired. Upload a current one.'
        : whyNotSatisfied(status, requiresVerification),
    expired,
    currentVersionNo: document?.currentVersionNo ?? 0,
    verifiedByName: document?.verifiedById ? (names.get(document.verifiedById) ?? null) : null,
    verifiedAt: document?.verifiedAt ?? null,
    verifyRemarks: document?.verifyRemarks ?? '',
    versions: (document?.versions ?? []).map((v) => shapeVersion(v, names)),
  };
}

function entryForExtra(
  document: DocumentRow,
  requiresVerification: boolean,
  names: Map<string, string>
): ChecklistEntry {
  const type = document.documentType;
  const active = document.versions.find((v) => v.isActive) ?? null;
  const expired = isExpired(active?.expiresOn ?? null);

  return {
    documentTypeId: document.documentTypeId,
    code: type.code,
    name: type.name,
    description: type.description,
    category: type.category,
    helpText: '',
    isRequired: false,
    isMandatory: false,
    whyRequired: '',
    requiresExpiry: type.requiresExpiry,
    maxBytes: (type.maxSizeMb || DEFAULT_DOCUMENT_MAX_MB) * 1024 * 1024,
    allowedExtensions: Array.isArray(type.allowedExtensions) && type.allowedExtensions.length
      ? (type.allowedExtensions as string[])
      : [...DOCUMENT_EXTENSIONS],
    documentId: document.id,
    status: document.status as DocumentStatus,
    satisfied: satisfiesRequirement(document.status as DocumentStatus, requiresVerification) && !expired,
    outstandingReason: null,
    expired,
    currentVersionNo: document.currentVersionNo,
    verifiedByName: document.verifiedById ? (names.get(document.verifiedById) ?? null) : null,
    verifiedAt: document.verifiedAt,
    verifyRemarks: document.verifyRemarks,
    versions: document.versions.map((v) => shapeVersion(v, names)),
  };
}

function shapeVersion(
  version: Prisma.DocumentVersionGetPayload<{ select: typeof VERSION_SELECT }>,
  names: Map<string, string>
): ChecklistVersion {
  return {
    ...version,
    status: version.status as DocumentStatus,
    uploadedByName: names.get(version.uploadedById) ?? 'Unknown user',
    downloadable: isServable(version.file.scanStatus as ScanStatus),
    // Preview needs BOTH a cleared file and a type that is safe to render
    // inline from this origin. See lib/documents.ts.
    previewable: isServable(version.file.scanStatus as ScanStatus) && isPreviewable(version.file.mimeType),
  };
}

const isExpired = (expiresOn: Date | null): boolean =>
  expiresOn !== null && expiresOn.getTime() < Date.now();

/** id → display name, for the handful of people involved in one application. */
async function namesFor(db: Db, userIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (!unique.length) return new Map();

  const users = await db.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });

  return new Map(users.map((u) => [u.id, u.name]));
}

// ═══════════════════════════════════════════════════════════════════════════
// Reading
// ═══════════════════════════════════════════════════════════════════════════

/** Everything the Documents tab renders, for one application. */
export async function getDocuments(user: AuthUser, applicationId: string) {
  const app = await requireApplication(user, applicationId);
  return buildChecklist(app);
}

/**
 * The completeness gate — §5, and the guard the fee engine calls.
 *
 * ONE implementation, so the checklist an applicant reads and the rule that
 * blocks their demand cannot disagree. It re-derives from the requirement
 * rules rather than trusting `applications.status`, because a status is a
 * cache and this is the moment where being wrong costs money.
 */
export async function documentsComplete(
  applicationId: string,
  db: Db = prisma
): Promise<{ complete: boolean; missing: Array<{ code: string; name: string; reason: string }>; required: number }> {
  const app = await db.application.findFirst({
    where: { id: applicationId, deletedAt: null },
    select: APPLICATION_SELECT,
  });

  if (!app) throw notFound('That application could not be found.');

  const checklist = await buildChecklist(app, db);
  return {
    complete: checklist.summary.complete,
    missing: checklist.missing,
    required: checklist.summary.required,
  };
}

/** Resolves a version the caller may read, scoped through its application. */
export async function requireDocumentVersion(user: AuthUser, versionId: string) {
  if (!isUuid(versionId)) throw notFound('That document could not be found.');

  const version = await prisma.documentVersion.findFirst({
    where: {
      id: versionId,
      document: { application: { deletedAt: null, ...applicationScope(user) } },
    },
    select: {
      ...VERSION_SELECT,
      fileObjectId: true,
      document: {
        select: {
          id: true,
          applicationId: true,
          documentType: { select: { code: true, name: true } },
          application: { select: { applicationNumber: true } },
        },
      },
    },
  });

  if (!version) throw notFound('That document could not be found.');
  return version;
}

/**
 * Streams a document back to the caller.
 *
 * The storage key is never exposed. Access and scan status are re-checked
 * here, and the audit row is written BEFORE the bytes are returned — so "who
 * read which applicant's sale deed, and when" is always answerable, including
 * for a request that then failed halfway.
 *
 * `disposition` distinguishes a download from an inline preview. The route is
 * what enforces that only a safe type is ever served inline.
 */
export async function readDocumentVersion(
  user: AuthUser,
  versionId: string,
  meta: Meta,
  disposition: 'attachment' | 'inline' = 'attachment'
) {
  const version = await requireDocumentVersion(user, versionId);
  const { bytes, file } = await readFileObject(version.fileObjectId);

  if (disposition === 'inline' && !isPreviewable(file.mimeType)) {
    throw badRequest('That file type cannot be previewed. Download it instead.');
  }

  await audit(prisma, {
    actor: user,
    action: disposition === 'inline' ? 'DOCUMENT_PREVIEWED' : 'DOCUMENT_DOWNLOADED',
    entityType: 'DocumentVersion',
    entityId: version.id,
    applicationId: version.document.applicationId,
    after: {
      versionNo: version.versionNo,
      fileName: file.originalName,
      documentType: version.document.documentType.code,
    },
    ...meta,
  });

  return {
    bytes,
    file,
    versionNo: version.versionNo,
    documentName: version.document.documentType.name,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Upload
// ═══════════════════════════════════════════════════════════════════════════

export type UploadDocumentInput = {
  applicationId: string;
  /** Either is accepted; the code is what an integration will have. */
  documentTypeId?: string;
  documentTypeCode?: string;
  remarks?: string;
  /** Required when the document type demands one. */
  expiresOn?: string | null;
  file: { name: string; type: string; bytes: Buffer };
};

/**
 * Stores a document and creates its next version.
 *
 * As with drawings, the file goes through the full pipeline in
 * services/files.ts BEFORE the transaction opens — validation, magic-byte
 * sniffing, checksum and the storage write all happen first, so the
 * transaction is short and a rejected file never leaves a half-written version
 * row behind.
 *
 * Allocating `versionNo` inside the transaction, together with the
 * `(applicationDocumentId, versionNo)` unique index, is what makes two
 * simultaneous uploads produce V2 and V3 rather than two V2s.
 */
export async function uploadDocument(user: AuthUser, input: UploadDocumentInput, meta: Meta) {
  const app = await requireUploadable(user, input.applicationId);

  const type = await resolveType(input);
  const requirements = await resolveRequirements(app);
  const requirement = requirements.find((r) => r.documentTypeId === type.id) ?? null;

  // An unrequired document is still accepted — an applicant may have a reason
  // to attach something nobody asked for, and refusing it would send them to
  // the counter with a printout. It simply does not count towards completeness.
  const limits = requirement ?? {
    maxBytes: (type.maxSizeMb || DEFAULT_DOCUMENT_MAX_MB) * 1024 * 1024,
    allowedExtensions: (
      Array.isArray(type.allowedExtensions) && type.allowedExtensions.length
        ? (type.allowedExtensions as string[])
        : [...DOCUMENT_EXTENSIONS]
    ).filter((e) => (ALLOWED_UPLOAD_EXTENSIONS as readonly string[]).includes(e)),
    isMandatory: false,
  };

  const expiresOn = parseExpiry(input.expiresOn, type.requiresExpiry, type.name);

  // Pipeline first. Nothing below runs if the bytes are not acceptable.
  const stored = await storeUpload({
    applicationId: app.id,
    kind: 'documents',
    file: input.file,
    uploadedById: user.id,
    allowedExtensions: limits.allowedExtensions.length
      ? limits.allowedExtensions
      : [...DOCUMENT_EXTENSIONS],
    maxBytes: limits.maxBytes,
  });

  const result = await prisma.$transaction(async (tx) => {
    // One row per (application, document type) — the unique index guarantees
    // it, and `upsert` is what makes a re-upload find the existing row rather
    // than colliding with it.
    const document = await tx.applicationDocument.upsert({
      where: {
        applicationId_documentTypeId: { applicationId: app.id, documentTypeId: type.id },
      },
      create: {
        applicationId: app.id,
        documentTypeId: type.id,
        status: 'UPLOADED',
        isMandatory: requirement?.isMandatory ?? false,
      },
      update: {
        // A replacement clears the previous DECISION. The rejected version
        // keeps its own REJECTED status and the remark that rejected it — the
        // history is the point — but the document as a whole is now awaiting a
        // fresh look, and leaving it REJECTED would tell the applicant their
        // corrected upload had already been refused.
        status: 'UPLOADED',
        isMandatory: requirement?.isMandatory ?? false,
        verifiedById: null,
        verifiedAt: null,
        verifyRemarks: '',
      },
      select: { id: true, currentVersionNo: true },
    });

    // Read the high-water mark inside the transaction. `currentVersionNo` is a
    // denormalised convenience; the versions table is the truth.
    const last = await tx.documentVersion.findFirst({
      where: { applicationDocumentId: document.id },
      orderBy: { versionNo: 'desc' },
      select: { versionNo: true },
    });

    const versionNo = (last?.versionNo ?? 0) + 1;

    // Supersede the outgoing version BEFORE inserting the new one: the partial
    // unique index permits exactly one active version, so the other order
    // would fail the insert.
    //
    // Its STATUS is only rewritten when it never carried a verdict. A version
    // an officer REJECTED still says so afterwards, and one they VERIFIED still
    // says so too — that is what makes the history readable ("V1 rejected —
    // unsigned; V2 verified") rather than a column of indistinguishable
    // SUPERSEDED rows that lose the reason the applicant was asked to upload
    // again. `isActive` is what decides which version counts; `status` is what
    // records what was decided about it.
    await tx.documentVersion.updateMany({
      where: {
        applicationDocumentId: document.id,
        isActive: true,
        status: { notIn: ['VERIFIED', 'REJECTED'] },
      },
      data: { isActive: false, status: 'SUPERSEDED' },
    });

    // Whatever is still active carries a verdict: retire it without touching it.
    await tx.documentVersion.updateMany({
      where: { applicationDocumentId: document.id, isActive: true },
      data: { isActive: false },
    });

    const version = await tx.documentVersion.create({
      data: {
        applicationDocumentId: document.id,
        versionNo,
        fileObjectId: stored.id,
        status: 'UPLOADED',
        remarks: (input.remarks ?? '').slice(0, 1000),
        expiresOn,
        uploadedById: user.id,
        isActive: true,
      },
      select: VERSION_SELECT,
    });

    await tx.applicationDocument.update({
      where: { id: document.id },
      data: { currentVersionNo: versionNo },
    });

    await recordEvent(tx, {
      applicationId: app.id,
      type: versionNo === 1 ? EVENT_TYPES.DOCUMENT_UPLOADED : EVENT_TYPES.DOCUMENT_REPLACED,
      title:
        versionNo === 1
          ? `${type.name} uploaded`
          : `${type.name} replaced — version ${versionNo}`,
      description: stored.originalName,
      actor: user,
      metadata: {
        documentId: document.id,
        documentVersionId: version.id,
        documentTypeCode: type.code,
        versionNo,
        fileName: stored.originalName,
        sizeBytes: stored.sizeBytes,
        checksum: stored.checksumSha256,
      },
    });

    await audit(tx, {
      actor: user,
      action: versionNo === 1 ? 'DOCUMENT_UPLOADED' : 'DOCUMENT_REPLACED',
      entityType: 'DocumentVersion',
      entityId: version.id,
      applicationId: app.id,
      after: {
        documentId: document.id,
        documentTypeCode: type.code,
        versionNo,
        fileName: stored.originalName,
        // The checksum is the point of auditing an upload: it is what proves
        // years later that the bytes served are the bytes that were accepted.
        checksumSha256: stored.checksumSha256,
        sizeBytes: stored.sizeBytes,
        expiresOn,
      },
      ...meta,
    });

    const reconciled = await reconcileDocumentStatus(tx, app.id, user);

    return { documentId: document.id, version, versionNo, status: reconciled };
  });

  return result;
}

async function resolveType(input: UploadDocumentInput) {
  const where = input.documentTypeId
    ? { id: input.documentTypeId }
    : { code: (input.documentTypeCode ?? '').trim().toUpperCase() };

  if (input.documentTypeId && !isUuid(input.documentTypeId)) {
    throw badRequest('That document type could not be found.');
  }
  if (!input.documentTypeId && !input.documentTypeCode) {
    throw badRequest('Choose which document you are uploading.');
  }

  const type = await prisma.documentType.findFirst({
    where: { ...where, isActive: true, deletedAt: null },
    select: {
      id: true,
      code: true,
      name: true,
      maxSizeMb: true,
      allowedExtensions: true,
      requiresExpiry: true,
    },
  });

  if (!type) throw badRequest('That document type could not be found.');
  return type;
}

function parseExpiry(value: string | null | undefined, required: boolean, typeName: string): Date | null {
  if (!value) {
    if (required) {
      throw badRequest(`${typeName} has an expiry date. Enter the date it is valid until.`);
    }
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest('That expiry date could not be read.');

  // An already-expired document would satisfy nothing the moment it landed;
  // saying so now is better than an unexplained red cross on the checklist.
  if (date.getTime() < Date.now()) {
    throw badRequest('That document has already expired. Upload a current one.');
  }
  return date;
}

// ═══════════════════════════════════════════════════════════════════════════
// Verification
// ═══════════════════════════════════════════════════════════════════════════

export type VerifyDocumentInput = {
  decision: 'VERIFY' | 'REJECT';
  remarks?: string;
};

/**
 * An officer's decision on one document.
 *
 * The decision is written to the ACTIVE VERSION as well as to the document, so
 * a version that was rejected still says so after it has been superseded. That
 * is what makes the history readable: "V1 rejected — not signed by an
 * engineer; V2 verified" rather than two indistinguishable rows.
 *
 * Rejecting requires a remark. An applicant told only "rejected" has to
 * telephone the office to find out what to change, which is a cost paid by
 * both sides for a sentence nobody wrote.
 */
export async function verifyDocument(
  user: AuthUser,
  documentId: string,
  input: VerifyDocumentInput,
  meta: Meta
) {
  if (!isUuid(documentId)) throw notFound('That document could not be found.');

  const remarks = (input.remarks ?? '').trim().slice(0, 1000);
  if (input.decision === 'REJECT' && !remarks) {
    throw badRequest('Say what is wrong with the document, so it can be corrected.');
  }

  const document = await prisma.applicationDocument.findFirst({
    where: { id: documentId, application: { deletedAt: null, ...applicationScope(user) } },
    select: {
      id: true,
      applicationId: true,
      status: true,
      currentVersionNo: true,
      documentType: { select: { code: true, name: true } },
      versions: { where: { isActive: true }, select: { id: true, versionNo: true } },
    },
  });

  if (!document) throw notFound('That document could not be found.');

  const active = document.versions[0];
  if (!active) {
    throw businessRule('Nothing has been uploaded against this document yet, so there is nothing to check.');
  }

  const verified = input.decision === 'VERIFY';
  const nextStatus: DocumentStatus = verified ? 'VERIFIED' : 'REJECTED';

  return prisma.$transaction(async (tx) => {
    const before = { status: document.status, versionNo: active.versionNo };

    await tx.applicationDocument.update({
      where: { id: document.id },
      data: {
        status: nextStatus,
        verifiedById: user.id,
        verifiedAt: new Date(),
        verifyRemarks: remarks,
      },
    });

    await tx.documentVersion.update({
      where: { id: active.id },
      data: { status: nextStatus },
    });

    await recordEvent(tx, {
      applicationId: document.applicationId,
      type: verified ? EVENT_TYPES.DOCUMENT_VERIFIED : EVENT_TYPES.DOCUMENT_REJECTED,
      title: verified
        ? `${document.documentType.name} verified`
        : `${document.documentType.name} rejected`,
      description: remarks,
      actor: user,
      metadata: {
        documentId: document.id,
        documentTypeCode: document.documentType.code,
        versionNo: active.versionNo,
        decision: input.decision,
      },
    });

    await audit(tx, {
      actor: user,
      action: verified ? 'DOCUMENT_VERIFIED' : 'DOCUMENT_REJECTED',
      entityType: 'ApplicationDocument',
      entityId: document.id,
      applicationId: document.applicationId,
      before,
      after: { status: nextStatus, versionNo: active.versionNo },
      remarks,
      ...meta,
    });

    const status = await reconcileDocumentStatus(tx, document.applicationId, user);

    return { documentId: document.id, status: nextStatus, applicationStatus: status };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Status reconciliation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Derives the application's status from its document set.
 *
 * Derived rather than accumulated, exactly as scrutiny's `reconcileStatus` is,
 * and for the same reason: whatever order uploads and verifications arrive in,
 * the status is a pure function of what the documents currently say. An
 * officer rejecting a document takes an application back from
 * DOCUMENTS_COMPLETED to DOCUMENT_UPLOAD_PENDING without any code having to
 * remember to.
 *
 * It only ever moves the application WITHIN the document phase. Once a fee has
 * been generated, or the file is with the department, a late document event
 * must not drag it backwards — reopening a settled file is what a Phase 8
 * shortfall does, deliberately and with a record of who did it.
 */
export async function reconcileDocumentStatus(
  tx: Tx,
  applicationId: string,
  actor?: AuthUser
): Promise<string | null> {
  const app = await tx.application.findUnique({
    where: { id: applicationId },
    select: APPLICATION_SELECT,
  });

  if (!app) return null;
  if (!DOCUMENT_PHASE_STATUSES.includes(app.status)) return null;

  const checklist = await buildChecklist(app, tx);
  const anyUploaded = checklist.entries.some((e) => e.documentId !== null);

  let next: string;
  if (checklist.summary.complete && (anyUploaded || checklist.summary.required === 0)) {
    next = 'DOCUMENTS_COMPLETED';
  } else {
    next = 'DOCUMENT_UPLOAD_PENDING';
  }

  if (next === app.status) return app.status;

  await tx.application.update({
    where: { id: applicationId },
    data: { status: next as never, updatedAt: new Date() },
  });

  if (next === 'DOCUMENTS_COMPLETED') {
    await recordEvent(tx, {
      applicationId,
      type: EVENT_TYPES.DOCUMENTS_COMPLETED,
      title: 'All required documents are in',
      description:
        checklist.summary.required === 0
          ? 'This application type requires no supporting documents.'
          : `${checklist.summary.required} required document${checklist.summary.required === 1 ? '' : 's'} accounted for. The fee can now be generated.`,
      actor,
      metadata: { required: checklist.summary.required },
    });

    await emit(tx, {
      eventCode: EVENTS.DOCUMENTS_COMPLETED,
      applicationId,
      payload: {
        applicationNumber: app.applicationNumber,
        required: checklist.summary.required,
      },
    });
  } else if (app.status === 'DOCUMENTS_COMPLETED') {
    // Going backwards is the interesting direction: something that was
    // complete no longer is, and the applicant needs to be told why.
    await recordEvent(tx, {
      applicationId,
      type: EVENT_TYPES.DOCUMENTS_INCOMPLETE,
      title: 'A required document is outstanding again',
      description: checklist.missing.map((m) => m.name).join(', '),
      actor,
      metadata: { missing: checklist.missing },
    });
  }

  return next;
}

// ═══════════════════════════════════════════════════════════════════════════
// Catalogue
// ═══════════════════════════════════════════════════════════════════════════

/** Every active document type — the admin catalogue and the upload picker. */
export async function documentTypes() {
  return prisma.documentType.findMany({
    where: { isActive: true, deletedAt: null },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      category: true,
      allowedExtensions: true,
      maxSizeMb: true,
      requiresExpiry: true,
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// The register — documents across applications
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The cross-application document list.
 *
 * The Documents TAB answers "what does this application still need". This
 * answers the officer's question instead: "what is waiting for me, across
 * every file I am responsible for" — which is a different query over the same
 * rows, and the reason a verification desk is a queue rather than a tour of
 * applications one at a time.
 *
 * Filtering, sorting and pagination all happen in the database, and the row
 * scope is MERGED INTO the query rather than applied after the fetch: an LTP's
 * register contains their own documents and nothing else, no query parameter
 * can widen it, and the pagination count stays truthful.
 */
export async function listDocumentRegister(user: AuthUser, query: DocumentListQuery) {
  const where = registerWhere(user, query);

  const [rows, total] = await Promise.all([
    prisma.applicationDocument.findMany({
      where,
      select: REGISTER_SELECT,
      orderBy: registerOrderBy(query),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.applicationDocument.count({ where }),
  ]);

  const requiresVerification = await settingBool('documents_complete_requires_verification', false);

  return {
    data: rows.map((row) => shapeRegisterRow(row, requiresVerification)),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

/** A certificate inside this window is still valid, but not for much longer. */
const EXPIRING_WITHIN_DAYS = 30;

const REGISTER_SELECT = {
  id: true,
  applicationId: true,
  status: true,
  isMandatory: true,
  currentVersionNo: true,
  verifiedAt: true,
  verifyRemarks: true,
  createdAt: true,
  updatedAt: true,
  documentType: { select: { id: true, code: true, name: true, category: true } },
  application: {
    select: {
      id: true,
      applicationNumber: true,
      status: true,
      applicationType: { select: { code: true, name: true } },
      zone: { select: { id: true, code: true, name: true } },
      applicant: { select: { name: true } },
    },
  },
  versions: {
    where: { isActive: true },
    select: {
      id: true,
      versionNo: true,
      expiresOn: true,
      uploadedAt: true,
      file: { select: { originalName: true, sizeBytes: true, mimeType: true, scanStatus: true } },
    },
  },
} satisfies Prisma.ApplicationDocumentSelect;

type RegisterRow = Prisma.ApplicationDocumentGetPayload<{ select: typeof REGISTER_SELECT }>;

function registerWhere(
  user: AuthUser,
  query: DocumentListQuery
): Prisma.ApplicationDocumentWhereInput {
  const and: Prisma.ApplicationDocumentWhereInput[] = [
    // The line that makes the list safe.
    { application: { deletedAt: null, ...applicationScope(user) } },
    // A row with no version is a placeholder for something never uploaded; it
    // belongs on the application's checklist, not in a register of documents.
    { currentVersionNo: { gt: 0 } },
  ];

  if (query.q) {
    const q = query.q;
    and.push({
      OR: [
        { application: { applicationNumber: { contains: q } } },
        { application: { applicant: { name: { contains: q } } } },
        { documentType: { name: { contains: q } } },
        { documentType: { code: { contains: q } } },
      ],
    });
  }

  // Bucket and explicit statuses are ANDed, so ?bucket=verified&status=REJECTED
  // returns nothing rather than quietly honouring one of the two.
  const bucket = registerBucket(query.bucket);
  if (bucket) and.push(bucket);

  if (query.status?.length) {
    const statuses = query.status.filter(isDocumentStatus);
    // A value outside the enum is dropped rather than handed to Postgres,
    // where it would fail the cast and surface as a 500. If that leaves
    // nothing, the filter matches nothing — which is what was asked for.
    and.push({ status: { in: statuses as DocumentStatus[] } });
  }

  if (query.documentTypeId) and.push({ documentTypeId: query.documentTypeId });
  if (query.mandatoryOnly) and.push({ isMandatory: true });
  if (query.applicationTypeId) {
    and.push({ application: { applicationTypeId: query.applicationTypeId } });
  }
  if (query.zoneId) and.push({ application: { zoneId: query.zoneId } });

  const from = parseLocalDate(query.from);
  const to = parseLocalDate(query.to);
  if (from || to) {
    and.push({
      updatedAt: {
        ...(from ? { gte: from } : {}),
        // The whole of the end day, not midnight at its start.
        ...(to ? { lte: endOfLocalDay(to) } : {}),
      },
    });
  }

  return { AND: and };
}

function registerBucket(bucket: DocumentListQuery['bucket']): Prisma.ApplicationDocumentWhereInput | null {
  if (bucket === 'pending') return { status: { in: ['UPLOADED', 'UNDER_VERIFICATION'] } };
  if (bucket === 'verified') return { status: 'VERIFIED' };
  if (bucket === 'rejected') return { status: 'REJECTED' };

  if (bucket === 'expiring') {
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + EXPIRING_WITHIN_DAYS);
    return {
      versions: {
        some: {
          isActive: true,
          // Not yet expired, but inside the window. An already-expired
          // certificate is a different problem and shows as unsatisfied on the
          // application itself.
          expiresOn: { gte: new Date(), lte: horizon },
        },
      },
    };
  }

  return null;
}

function registerOrderBy(
  query: DocumentListQuery
): Prisma.ApplicationDocumentOrderByWithRelationInput {
  const dir = query.dir;

  switch (query.sort) {
    case 'status':
      return { status: dir };
    case 'createdAt':
      return { createdAt: dir };
    case 'applicationNumber':
      return { application: { applicationNumber: dir } };
    case 'documentType':
      return { documentType: { name: dir } };
    default:
      return { updatedAt: dir };
  }
}

function shapeRegisterRow(row: RegisterRow, requiresVerification: boolean) {
  const active = row.versions[0] ?? null;
  const expired = isExpired(active?.expiresOn ?? null);

  return {
    id: row.id,
    applicationId: row.applicationId,
    applicationNumber: row.application.applicationNumber,
    applicationStatus: row.application.status,
    applicationTypeName: row.application.applicationType?.name ?? '',
    applicantName: row.application.applicant?.name ?? '',
    zone: row.application.zone,
    code: row.documentType.code,
    name: row.documentType.name,
    category: row.documentType.category,
    status: row.status,
    isMandatory: row.isMandatory,
    versionNo: row.currentVersionNo,
    versionId: active?.id ?? null,
    fileName: active?.file.originalName ?? '',
    sizeBytes: active?.file.sizeBytes ?? 0,
    scanStatus: active?.file.scanStatus ?? 'PENDING',
    uploadedAt: active?.uploadedAt ?? row.createdAt,
    expiresOn: active?.expiresOn ?? null,
    expired,
    satisfied: satisfiesRequirement(row.status, requiresVerification) && !expired,
    verifiedAt: row.verifiedAt,
    verifyRemarks: row.verifyRemarks,
    updatedAt: row.updatedAt,
  };
}

const DOCUMENT_STATUSES: readonly string[] = [
  'NOT_UPLOADED',
  'UPLOADED',
  'UNDER_VERIFICATION',
  'VERIFIED',
  'REJECTED',
  'SUPERSEDED',
];

const isDocumentStatus = (value: string): boolean => DOCUMENT_STATUSES.includes(value);

/**
 * Both ends of a date filter are LOCAL, never UTC.
 *
 * Parsing the start as UTC midnight while computing the end locally is the
 * Phase 3 bug: in UTC+5:30 a filter for "26 August" ran from 05:30 to 18:29,
 * and a document touched that evening was missing from a filter for its own
 * date.
 */
function parseLocalDate(value: string | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function endOfLocalDay(date: Date): Date {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

/** The counts the register header shows, over the same scope as the list. */
export async function documentRegisterStats(user: AuthUser) {
  const base: Prisma.ApplicationDocumentWhereInput = {
    application: { deletedAt: null, ...applicationScope(user) },
    currentVersionNo: { gt: 0 },
  };

  const horizon = new Date();
  horizon.setDate(horizon.getDate() + EXPIRING_WITHIN_DAYS);

  const [total, pending, rejected, expiring] = await Promise.all([
    prisma.applicationDocument.count({ where: base }),
    prisma.applicationDocument.count({
      where: { ...base, status: { in: ['UPLOADED', 'UNDER_VERIFICATION'] } },
    }),
    prisma.applicationDocument.count({ where: { ...base, status: 'REJECTED' } }),
    prisma.applicationDocument.count({
      where: {
        ...base,
        versions: { some: { isActive: true, expiresOn: { gte: new Date(), lte: horizon } } },
      },
    }),
  ]);

  return { total, pending, rejected, expiring, expiringWithinDays: EXPIRING_WITHIN_DAYS };
}
