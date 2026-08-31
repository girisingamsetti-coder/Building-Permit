/**
 * Shapes the document screens receive.
 *
 * Declared rather than inferred from Prisma because these cross the
 * server/client boundary, where `serialize()` has already turned every Date
 * into an ISO string and every Decimal into a number.
 */

export type DocumentStatusKey =
  | 'NOT_UPLOADED'
  | 'UPLOADED'
  | 'UNDER_VERIFICATION'
  | 'VERIFIED'
  | 'REJECTED'
  | 'SUPERSEDED';

export type DocumentVersionRow = {
  id: string;
  versionNo: number;
  status: DocumentStatusKey;
  remarks: string;
  expiresOn: string | null;
  uploadedById: string;
  uploadedByName: string;
  uploadedAt: string;
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
  /** False for an upload whose requirement no longer applies. */
  isRequired: boolean;
  isMandatory: boolean;
  /** "the building has is at least 4" — why this document is being asked for. */
  whyRequired: string;
  requiresExpiry: boolean;
  maxBytes: number;
  allowedExtensions: string[];
  documentId: string | null;
  status: DocumentStatusKey;
  satisfied: boolean;
  outstandingReason: string | null;
  expired: boolean;
  currentVersionNo: number;
  verifiedByName: string | null;
  verifiedAt: string | null;
  verifyRemarks: string;
  versions: DocumentVersionRow[];
};

export type DocumentSummary = {
  required: number;
  optional: number;
  uploaded: number;
  pending: number;
  rejected: number;
  verified: number;
  complete: boolean;
};

export type DocumentsPayload = {
  application: {
    id: string;
    applicationNumber: string;
    status: string;
    applicationTypeName: string;
  };
  entries: ChecklistEntry[];
  summary: DocumentSummary;
  missing: Array<{ code: string; name: string; reason: string }>;
  requiresVerification: boolean;
  canUpload: boolean;
  uploadBlockedReason: string | null;
  types: Array<{
    id: string;
    code: string;
    name: string;
    description: string;
    category: string;
    allowedExtensions: string[];
    maxSizeMb: number;
    requiresExpiry: boolean;
  }>;
};
