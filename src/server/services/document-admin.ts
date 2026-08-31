import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db/prisma';
import { audit } from './audit';
import { badRequest, businessRule, conflict, notFound } from '@/server/http/errors';
import { describeCondition, validateCondition } from '@/lib/conditions';
import { isUuid } from '@/lib/utils';
import type { AuthUser } from '@/server/auth/context';
import type {
  DocumentRequirementInput,
  DocumentTypeInput,
  UpdateDocumentRequirementInput,
  UpdateDocumentTypeInput,
} from '@/lib/schemas/document-admin';

/**
 * The document catalogue and its requirement rules, administered.
 *
 * ── Why these are ordinary rows and not code ───────────────────────────
 *
 * `resolveRequirements()` reads `document_requirements` and nothing else. No
 * document list is hard-coded anywhere in the system, which is what lets a
 * department change a threshold — four floors to three — without a migration
 * or a deploy. This service is the screen behind that promise; until it
 * existed the only way to exercise it was to edit the database by hand.
 *
 * ── What is refused, and why ───────────────────────────────────────────
 *
 * A malformed condition is refused HERE, at the point somebody writes it.
 * That asymmetry is deliberate: the resolver treats a condition it cannot
 * evaluate as not applying, so one bad rule cannot take the checklist down for
 * every applicant — but the same forgiveness means a broken rule fails
 * silently, and the document is simply never asked for. The save path is where
 * strictness belongs.
 */

type Meta = { ip?: string; userAgent?: string; correlationId?: string };

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

const TYPE_SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  category: true,
  allowedExtensions: true,
  allowedMime: true,
  maxSizeMb: true,
  requiresExpiry: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DocumentTypeSelect;

/**
 * The catalogue, with the two counts that decide what may be done to a row.
 *
 * `requirementCount` says whether a rule points at it; `documentCount` says
 * whether an applicant has ever uploaded one. A type with either cannot be
 * deleted, and the UI needs to know that before offering the button rather
 * than after refusing the request.
 */
export async function listDocumentTypes(options: { includeArchived?: boolean } = {}) {
  const rows = await prisma.documentType.findMany({
    where: options.includeArchived ? {} : { deletedAt: null },
    select: {
      ...TYPE_SELECT,
      deletedAt: true,
      _count: { select: { requirements: true, appDocuments: true } },
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });

  return rows.map(({ _count, ...row }) => ({
    ...row,
    requirementCount: _count.requirements,
    documentCount: _count.appDocuments,
    /** False when something points at it — the UI hides Delete rather than offering a refusal. */
    deletable: _count.requirements === 0 && _count.appDocuments === 0,
  }));
}

export async function createDocumentType(input: DocumentTypeInput, user: AuthUser, meta: Meta) {
  const existing = await prisma.documentType.findUnique({
    where: { code: input.code },
    select: { id: true, deletedAt: true },
  });

  if (existing) {
    throw conflict(
      existing.deletedAt
        ? `${input.code} already exists but is archived. Restore it rather than creating a second one — the archived rows still point at it.`
        : `${input.code} already exists.`
    );
  }

  return prisma.$transaction(async (tx) => {
    const type = await tx.documentType.create({
      data: {
        code: input.code,
        name: input.name,
        description: input.description,
        category: input.category,
        allowedExtensions: input.allowedExtensions,
        // Kept in step with the extensions rather than derived from them: the
        // upload pipeline checks extension and sniffed MIME as two independent
        // gates (docs P.3), and collapsing them would weaken both.
        allowedMime: mimeFor(input.allowedExtensions),
        maxSizeMb: input.maxSizeMb,
        requiresExpiry: input.requiresExpiry,
        isActive: input.isActive,
      },
      select: TYPE_SELECT,
    });

    await audit(tx, {
      actor: user,
      action: 'DOCUMENT_TYPE_CREATED',
      entityType: 'DocumentType',
      entityId: type.id,
      after: type,
      ...meta,
    });

    return type;
  });
}

export async function updateDocumentType(
  id: string,
  input: UpdateDocumentTypeInput,
  user: AuthUser,
  meta: Meta
) {
  const before = await requireType(id);

  const data: Prisma.DocumentTypeUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.category !== undefined) data.category = input.category;
  if (input.maxSizeMb !== undefined) data.maxSizeMb = input.maxSizeMb;
  if (input.requiresExpiry !== undefined) data.requiresExpiry = input.requiresExpiry;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.allowedExtensions !== undefined) {
    data.allowedExtensions = input.allowedExtensions;
    data.allowedMime = mimeFor(input.allowedExtensions);
  }

  if (!Object.keys(data).length) return before;

  return prisma.$transaction(async (tx) => {
    const after = await tx.documentType.update({ where: { id }, data, select: TYPE_SELECT });

    await audit(tx, {
      actor: user,
      action: 'DOCUMENT_TYPE_UPDATED',
      entityType: 'DocumentType',
      entityId: id,
      before,
      after,
      ...meta,
    });

    return after;
  });
}

/**
 * Archives a type, or deletes it outright when nothing has ever pointed at it.
 *
 * The distinction matters. A type an applicant has uploaded against is part of
 * a municipal record; removing it would orphan those documents and make an
 * approved application unexplainable. Archiving takes it out of every future
 * checklist and leaves the history legible, which is what "delete" means here.
 */
export async function archiveDocumentType(
  id: string,
  user: AuthUser,
  meta: Meta
): Promise<{ id: string; outcome: 'DELETED' | 'ARCHIVED' }> {
  const before = await requireType(id);

  const counts = await prisma.documentType.findUniqueOrThrow({
    where: { id },
    select: { _count: { select: { requirements: true, appDocuments: true } } },
  });

  return prisma.$transaction(async (tx) => {
    const hard = counts._count.requirements === 0 && counts._count.appDocuments === 0;

    if (hard) {
      await tx.documentType.delete({ where: { id } });
    } else {
      if (counts._count.requirements > 0) {
        // A rule pointing at an archived type would resolve to nothing on
        // every application, silently. Deactivate them with it, so the effect
        // is visible in the rules list rather than inferred from an empty
        // checklist.
        await tx.documentRequirement.updateMany({
          where: { documentTypeId: id },
          data: { isActive: false },
        });
      }
      await tx.documentType.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      });
    }

    await audit(tx, {
      actor: user,
      action: hard ? 'DOCUMENT_TYPE_DELETED' : 'DOCUMENT_TYPE_ARCHIVED',
      entityType: 'DocumentType',
      entityId: id,
      before,
      after: hard ? null : { deletedAt: new Date(), isActive: false },
      remarks: hard
        ? 'Nothing referenced this type.'
        : `Archived: ${counts._count.requirements} rule(s) and ${counts._count.appDocuments} uploaded document(s) reference it.`,
      ...meta,
    });

    return { id, outcome: hard ? ('DELETED' as const) : ('ARCHIVED' as const) };
  });
}

/** Restores an archived type. Its rules stay off until somebody turns them on. */
export async function restoreDocumentType(id: string, user: AuthUser, meta: Meta) {
  const before = await prisma.documentType.findUnique({ where: { id }, select: TYPE_SELECT });
  if (!before) throw notFound('That document type could not be found.');

  return prisma.$transaction(async (tx) => {
    const after = await tx.documentType.update({
      where: { id },
      data: { deletedAt: null, isActive: true },
      select: TYPE_SELECT,
    });

    await audit(tx, {
      actor: user,
      action: 'DOCUMENT_TYPE_RESTORED',
      entityType: 'DocumentType',
      entityId: id,
      before,
      after,
      ...meta,
    });

    return after;
  });
}

async function requireType(id: string) {
  if (!isUuid(id)) throw notFound('That document type could not be found.');
  const row = await prisma.documentType.findFirst({
    where: { id, deletedAt: null },
    select: TYPE_SELECT,
  });
  if (!row) throw notFound('That document type could not be found.');
  return row;
}

/**
 * The MIME types an extension may legitimately arrive as.
 *
 * Deliberately a lookup and not a guess: a browser sends `application/octet-
 * stream` for a DWG often enough that trusting a derived value would refuse
 * genuine files.
 */
const MIME_BY_EXTENSION: Record<string, string[]> = {
  pdf: ['application/pdf'],
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  dwg: ['image/vnd.dwg', 'application/acad', 'application/octet-stream'],
  dxf: ['image/vnd.dxf', 'application/dxf', 'application/octet-stream'],
};

const mimeFor = (extensions: string[]): string[] => [
  ...new Set(extensions.flatMap((e) => MIME_BY_EXTENSION[e] ?? [])),
];

// ═══════════════════════════════════════════════════════════════════════════
// Requirement rules
// ═══════════════════════════════════════════════════════════════════════════

const RULE_SELECT = {
  id: true,
  applicationTypeId: true,
  documentTypeId: true,
  buildingUse: true,
  landUseZone: true,
  isMandatory: true,
  condition: true,
  displayOrder: true,
  helpText: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  documentType: { select: { id: true, code: true, name: true, category: true, deletedAt: true } },
  applicationType: { select: { id: true, code: true, name: true } },
} satisfies Prisma.DocumentRequirementSelect;

/**
 * Every rule, with the sentence each one produces.
 *
 * The explanation is computed here rather than in the browser so an
 * administrator sees the words an APPLICANT will be shown — "required because
 * the number of floors is at least 4" — instead of the JSON they typed. A rule
 * that reads wrongly is far easier to spot in prose than in braces.
 */
export async function listDocumentRequirements() {
  const rows = await prisma.documentRequirement.findMany({
    select: RULE_SELECT,
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  });

  return rows.map((row) => ({
    ...row,
    explanation: describeCondition(row.condition, ADMIN_CONDITION_LABELS),
    /** Non-null when the stored JSON would not survive a re-save. */
    conditionProblem: validateCondition(row.condition)[0]?.message ?? null,
  }));
}

/**
 * The same labels the applicant-facing checklist uses.
 *
 * Kept identical on purpose: an administrator previewing a rule must read the
 * exact sentence the applicant will, not an approximation of it.
 */
const ADMIN_CONDITION_LABELS: Record<string, string> = {
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

export async function createDocumentRequirement(
  input: DocumentRequirementInput,
  user: AuthUser,
  meta: Meta
) {
  await assertTypeUsable(input.documentTypeId);
  if (input.applicationTypeId) await assertApplicationType(input.applicationTypeId);

  return prisma.$transaction(async (tx) => {
    const rule = await tx.documentRequirement.create({
      data: {
        documentTypeId: input.documentTypeId,
        applicationTypeId: input.applicationTypeId,
        buildingUse: input.buildingUse.toUpperCase(),
        landUseZone: input.landUseZone.toUpperCase(),
        isMandatory: input.isMandatory,
        condition: input.condition as Prisma.InputJsonValue,
        displayOrder: input.displayOrder,
        helpText: input.helpText,
        isActive: input.isActive,
      },
      select: RULE_SELECT,
    });

    await audit(tx, {
      actor: user,
      action: 'DOCUMENT_REQUIREMENT_CREATED',
      entityType: 'DocumentRequirement',
      entityId: rule.id,
      after: rule,
      ...meta,
    });

    return rule;
  });
}

export async function updateDocumentRequirement(
  id: string,
  input: UpdateDocumentRequirementInput,
  user: AuthUser,
  meta: Meta
) {
  const before = await requireRule(id);

  if (input.documentTypeId) await assertTypeUsable(input.documentTypeId);
  if (input.applicationTypeId) await assertApplicationType(input.applicationTypeId);

  const data: Prisma.DocumentRequirementUncheckedUpdateInput = {};
  if (input.documentTypeId !== undefined) data.documentTypeId = input.documentTypeId;
  if (input.applicationTypeId !== undefined) data.applicationTypeId = input.applicationTypeId;
  if (input.buildingUse !== undefined) data.buildingUse = input.buildingUse.toUpperCase();
  if (input.landUseZone !== undefined) data.landUseZone = input.landUseZone.toUpperCase();
  if (input.isMandatory !== undefined) data.isMandatory = input.isMandatory;
  if (input.condition !== undefined) data.condition = input.condition as Prisma.InputJsonValue;
  if (input.displayOrder !== undefined) data.displayOrder = input.displayOrder;
  if (input.helpText !== undefined) data.helpText = input.helpText;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  if (!Object.keys(data).length) return before;

  return prisma.$transaction(async (tx) => {
    const after = await tx.documentRequirement.update({ where: { id }, data, select: RULE_SELECT });

    await audit(tx, {
      actor: user,
      action: 'DOCUMENT_REQUIREMENT_UPDATED',
      entityType: 'DocumentRequirement',
      entityId: id,
      before,
      after,
      ...meta,
    });

    return after;
  });
}

/**
 * Removes a rule.
 *
 * A rule holds no history of its own — nothing points at it, and the documents
 * uploaded because of it are attached to the application, not to the rule. It
 * can therefore be deleted outright, and the audit row carries what it said so
 * "why was this document once demanded?" remains answerable.
 */
export async function deleteDocumentRequirement(id: string, user: AuthUser, meta: Meta) {
  const before = await requireRule(id);

  return prisma.$transaction(async (tx) => {
    await tx.documentRequirement.delete({ where: { id } });

    await audit(tx, {
      actor: user,
      action: 'DOCUMENT_REQUIREMENT_DELETED',
      entityType: 'DocumentRequirement',
      entityId: id,
      before,
      after: null,
      ...meta,
    });

    return { id };
  });
}

async function requireRule(id: string) {
  if (!isUuid(id)) throw notFound('That requirement rule could not be found.');
  const row = await prisma.documentRequirement.findUnique({ where: { id }, select: RULE_SELECT });
  if (!row) throw notFound('That requirement rule could not be found.');
  return row;
}

async function assertTypeUsable(documentTypeId: string) {
  const type = await prisma.documentType.findFirst({
    where: { id: documentTypeId, deletedAt: null },
    select: { id: true, isActive: true, name: true },
  });

  if (!type) throw badRequest('That document type could not be found.');
  if (!type.isActive) {
    throw businessRule(
      `${type.name} is inactive, so a rule pointing at it would never ask for anything. Reactivate the type first.`
    );
  }
}

async function assertApplicationType(id: string) {
  const found = await prisma.applicationType.findUnique({ where: { id }, select: { id: true } });
  if (!found) throw badRequest('That application type could not be found.');
}

// ═══════════════════════════════════════════════════════════════════════════
// Preview
// ═══════════════════════════════════════════════════════════════════════════

/**
 * What a rule WOULD say, without saving it.
 *
 * The editor calls this as the administrator types, so a condition is checked
 * against the language before it can be stored — and the sentence it produces
 * is shown in the same breath. A rule nobody can read is a rule nobody can
 * review.
 */
export function previewCondition(condition: unknown) {
  const problems = validateCondition(condition);

  return {
    valid: problems.length === 0,
    problems,
    explanation: problems.length ? '' : describeCondition(condition, ADMIN_CONDITION_LABELS),
  };
}
