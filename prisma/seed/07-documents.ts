import type { PrismaClient } from '@prisma/client';

/**
 * The document catalogue and the requirement rules.
 *
 * ── READ THIS BEFORE ADDING A DOCUMENT ─────────────────────────────────
 *
 * No statutory checklist has been supplied for this jurisdiction. What is
 * seeded here is the set that appears in essentially every Indian building
 * permission application — title, tax, survey, identity — plus the four
 * conditional certificates the requirement itself names. Every threshold in a
 * condition (four floors, fifteen metres, one basement) is a PLACEHOLDER: they
 * are the values a department is most likely to recognise, not values anybody
 * has told us are the law.
 *
 * That distinction is kept visible rather than papered over. The requirement
 * rows are ordinary configuration: a department changes a threshold, adds a
 * document or removes one from the admin UI, and neither a migration nor a
 * deploy is involved. Nothing in the codebase hard-codes a document list —
 * `resolveRequirements()` reads these rows and nothing else.
 *
 * ── Why conditions rather than one list per application type ───────────
 *
 * "Residential needs these nine, commercial needs these eleven" produces a
 * combinatorial mess the first time somebody asks for a structural certificate
 * on tall residential buildings only. A condition says the thing that is
 * actually true — a structural stability certificate is required because the
 * building is tall, whatever kind of permission is being sought.
 */

type DocumentTypeSeed = {
  code: string;
  name: string;
  description: string;
  category: string;
  allowedExtensions?: string[];
  maxSizeMb?: number;
  requiresExpiry?: boolean;
};

/** Grouping for the checklist. Presentation only — nothing branches on it. */
const CATEGORIES = {
  TITLE: 'Title and ownership',
  STATUTORY: 'Statutory and revenue',
  TECHNICAL: 'Technical certificates',
  IDENTITY: 'Identity and authorisation',
} as const;

export const DOCUMENT_TYPES: DocumentTypeSeed[] = [
  // ── Title and ownership ───────────────────────────────────────────────
  {
    code: 'OWNERSHIP_DOCUMENT',
    name: 'Ownership Document',
    description: 'Proof that the applicant or the owner holds title to the land.',
    category: CATEGORIES.TITLE,
  },
  {
    code: 'SALE_DEED',
    name: 'Sale Deed',
    description: 'The registered deed by which the present owner acquired the property.',
    category: CATEGORIES.TITLE,
  },
  {
    code: 'ENCUMBRANCE_CERTIFICATE',
    name: 'Encumbrance Certificate (EC)',
    description: 'Certificate showing the charges registered against the property.',
    category: CATEGORIES.TITLE,
    // An EC is issued for a stated period and stops being evidence after it.
    requiresExpiry: true,
  },
  {
    code: 'LINK_DOCUMENTS',
    name: 'Link Documents',
    description: 'The chain of earlier deeds connecting the present title to its origin.',
    category: CATEGORIES.TITLE,
    maxSizeMb: 20,
  },

  // ── Statutory and revenue ─────────────────────────────────────────────
  {
    code: 'PROPERTY_TAX_RECEIPT',
    name: 'Property Tax Receipt',
    description: 'The most recent municipal property tax receipt for the property.',
    category: CATEGORIES.STATUTORY,
  },
  {
    code: 'SURVEY_SKETCH',
    name: 'Survey Sketch / Tippan',
    description: 'The revenue survey sketch showing the plot and its measurements.',
    category: CATEGORIES.STATUTORY,
  },
  {
    code: 'LAYOUT_APPROVAL_COPY',
    name: 'Approved Layout Copy',
    description: 'The sanctioned layout plan under which the plot was carved out.',
    category: CATEGORIES.STATUTORY,
  },

  // ── Technical certificates ────────────────────────────────────────────
  {
    code: 'STRUCTURAL_STABILITY_CERTIFICATE',
    name: 'Structural Stability Certificate',
    description: 'Certificate from a qualified structural engineer for the proposed structure.',
    category: CATEGORIES.TECHNICAL,
  },
  {
    code: 'FIRE_NOC',
    name: 'Fire NOC',
    description: 'No-objection certificate from the fire service.',
    category: CATEGORIES.TECHNICAL,
    requiresExpiry: true,
  },
  {
    code: 'SOIL_TEST_REPORT',
    name: 'Soil Test Report',
    description: 'Geotechnical investigation report for the site.',
    category: CATEGORIES.TECHNICAL,
    maxSizeMb: 20,
  },
  {
    code: 'BIM_MODEL',
    name: 'BIM Model',
    description: 'Building Information Model for 3D review and structural analysis.',
    category: CATEGORIES.TECHNICAL,
    maxSizeMb: 100,
  },

  // ── Identity and authorisation ────────────────────────────────────────
  {
    code: 'APPLICANT_PHOTO_ID',
    name: 'Applicant Photo Identification',
    description: 'A government-issued photo identity document for the applicant.',
    category: CATEGORIES.IDENTITY,
    allowedExtensions: ['pdf', 'png', 'jpg', 'jpeg'],
    maxSizeMb: 5,
  },
  {
    code: 'LTP_LICENCE_COPY',
    name: 'Licensed Technical Person Licence',
    description: 'The current licence of the technical person who prepared the drawings.',
    category: CATEGORIES.IDENTITY,
    requiresExpiry: true,
    maxSizeMb: 5,
  },
  {
    code: 'OWNER_NOC',
    name: 'No-Objection Certificate from the Owner',
    description: 'The owner’s consent, when the applicant is not the owner of the land.',
    category: CATEGORIES.IDENTITY,
  },
  {
    code: 'POWER_OF_ATTORNEY',
    name: 'Power of Attorney',
    description: 'Where the application is made by an attorney holder.',
    category: CATEGORIES.IDENTITY,
  },
];

type RequirementSeed = {
  documentTypeCode: string;
  /** Null = every application type. */
  applicationTypeCode: string | null;
  /** Empty = any building type. */
  buildingUse?: string;
  /** Empty = any property type. */
  landUseZone?: string;
  isMandatory: boolean;
  condition?: unknown;
  displayOrder: number;
  helpText?: string;
};

export const DOCUMENT_REQUIREMENTS: RequirementSeed[] = [
  // ── Always, for every application ─────────────────────────────────────
  {
    documentTypeCode: 'OWNERSHIP_DOCUMENT',
    applicationTypeCode: null,
    isMandatory: true,
    displayOrder: 10,
    helpText: 'A patta, khata or registered document showing who holds the land.',
  },
  {
    documentTypeCode: 'SALE_DEED',
    applicationTypeCode: null,
    isMandatory: true,
    displayOrder: 20,
    helpText: 'The registered deed under which the present owner acquired the property.',
  },
  {
    documentTypeCode: 'ENCUMBRANCE_CERTIFICATE',
    applicationTypeCode: null,
    isMandatory: true,
    displayOrder: 30,
    helpText: 'Enter the date up to which the certificate covers the property.',
  },
  {
    documentTypeCode: 'PROPERTY_TAX_RECEIPT',
    applicationTypeCode: null,
    isMandatory: true,
    displayOrder: 40,
  },
  {
    documentTypeCode: 'SURVEY_SKETCH',
    applicationTypeCode: null,
    isMandatory: true,
    displayOrder: 50,
  },
  {
    documentTypeCode: 'APPLICANT_PHOTO_ID',
    applicationTypeCode: null,
    isMandatory: true,
    displayOrder: 60,
  },
  {
    documentTypeCode: 'LTP_LICENCE_COPY',
    applicationTypeCode: null,
    isMandatory: true,
    displayOrder: 70,
    helpText: 'Enter the date the licence is valid until.',
  },

  // ── Conditional ───────────────────────────────────────────────────────
  {
    documentTypeCode: 'OWNER_NOC',
    applicationTypeCode: null,
    isMandatory: true,
    // The only requirement here driven by the applicant rather than the
    // building: consent is needed exactly when the applicant is not the owner.
    condition: { eq: ['applicant.ownerSameAsApplicant', false] },
    displayOrder: 80,
    helpText: 'Required because the application records an owner other than the applicant.',
  },
  {
    documentTypeCode: 'STRUCTURAL_STABILITY_CERTIFICATE',
    applicationTypeCode: null,
    isMandatory: true,
    // Placeholder thresholds. See the note at the top of this file.
    condition: {
      or: [{ gte: ['building.numFloors', 4] }, { gt: ['building.buildingHeightM', 15] }],
    },
    displayOrder: 90,
    helpText: 'Signed and sealed by a structural engineer registered with the corporation.',
  },
  {
    documentTypeCode: 'FIRE_NOC',
    applicationTypeCode: null,
    isMandatory: true,
    condition: {
      or: [
        { gt: ['building.buildingHeightM', 15] },
        { in: ['building.occupancyType', ['D_ASSEMBLY', 'C_INSTITUTIONAL', 'F_MERCANTILE']] },
      ],
    },
    displayOrder: 100,
    helpText: 'Enter the date the certificate is valid until.',
  },
  {
    documentTypeCode: 'SOIL_TEST_REPORT',
    applicationTypeCode: null,
    isMandatory: true,
    condition: { gte: ['building.numBasements', 1] },
    displayOrder: 110,
    helpText: 'Required because the proposal includes a basement.',
  },
  {
    documentTypeCode: 'LAYOUT_APPROVAL_COPY',
    applicationTypeCode: null,
    isMandatory: true,
    condition: { exists: 'property.lpNumber' },
    displayOrder: 120,
    helpText: 'Required because the application records an approved layout number.',
  },
  {
    documentTypeCode: 'BIM_MODEL',
    applicationTypeCode: null,
    isMandatory: true,
    displayOrder: 130,
    helpText: 'Required Building Information Model files for technical scrutiny.',
  },

  // ── Optional, on every application ────────────────────────────────────
  // Not mandatory, so they never block a fee. They are on the checklist
  // because an applicant who has one should be able to attach it without
  // telephoning to ask whether they may.
  {
    documentTypeCode: 'LINK_DOCUMENTS',
    applicationTypeCode: null,
    isMandatory: false,
    displayOrder: 200,
  },
  {
    documentTypeCode: 'POWER_OF_ATTORNEY',
    applicationTypeCode: null,
    isMandatory: false,
    displayOrder: 210,
  },
];

export async function seedDocuments(prisma: PrismaClient) {
  const typeIds = new Map<string, string>();

  for (const type of DOCUMENT_TYPES) {
    const data = {
      name: type.name,
      description: type.description,
      category: type.category,
      allowedExtensions: type.allowedExtensions ?? ['pdf'],
      allowedMime: (type.allowedExtensions ?? ['pdf']).map(mimeFor),
      maxSizeMb: type.maxSizeMb ?? 10,
      requiresExpiry: type.requiresExpiry ?? false,
      isActive: true,
    };

    const row = await prisma.documentType.upsert({
      where: { code: type.code },
      create: { code: type.code, ...data },
      update: data,
      select: { id: true },
    });

    typeIds.set(type.code, row.id);
  }

  const applicationTypes = await prisma.applicationType.findMany({
    select: { id: true, code: true },
  });
  const applicationTypeIds = new Map(applicationTypes.map((t) => [t.code, t.id]));

  let requirements = 0;

  for (const requirement of DOCUMENT_REQUIREMENTS) {
    const documentTypeId = typeIds.get(requirement.documentTypeCode);
    if (!documentTypeId) continue;

    const applicationTypeId = requirement.applicationTypeCode
      ? (applicationTypeIds.get(requirement.applicationTypeCode) ?? null)
      : null;

    // There is no natural key on document_requirements — a department may
    // legitimately have two rules for the same document type with different
    // conditions. The seed therefore matches on the tuple it OWNS, and leaves
    // anything an administrator added through the admin UI alone.
    const existing = await prisma.documentRequirement.findFirst({
      where: {
        documentTypeId,
        applicationTypeId,
        buildingUse: requirement.buildingUse ?? '',
        landUseZone: requirement.landUseZone ?? '',
      },
      select: { id: true },
    });

    const data = {
      isMandatory: requirement.isMandatory,
      condition: (requirement.condition ?? {}) as never,
      displayOrder: requirement.displayOrder,
      helpText: requirement.helpText ?? '',
      isActive: true,
    };

    if (existing) {
      await prisma.documentRequirement.update({ where: { id: existing.id }, data });
    } else {
      await prisma.documentRequirement.create({
        data: {
          documentTypeId,
          applicationTypeId,
          buildingUse: requirement.buildingUse ?? '',
          landUseZone: requirement.landUseZone ?? '',
          ...data,
        },
      });
    }

    requirements += 1;
  }

  return { documentTypes: DOCUMENT_TYPES.length, requirements };
}

/**
 * The MIME an extension corresponds to.
 *
 * Only used to keep `allowedMime` in step with `allowedExtensions` in the
 * seed. It is not what validates an upload — that is the magic-byte sniff in
 * server/storage/sniff.ts, which reads the file rather than believing a label.
 */
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

const mimeFor = (extension: string): string =>
  MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
