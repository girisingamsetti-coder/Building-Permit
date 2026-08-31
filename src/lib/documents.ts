/**
 * Document vocabulary. Isomorphic — the checklist, the upload form, the
 * validator and the service all read this file, so what the browser refuses
 * and what the server refuses cannot drift apart.
 *
 * As with drawings, the client-side checks here are a COURTESY: they fail fast
 * so nobody waits through a 10 MB upload to be told the type is wrong. They
 * decide nothing. Every rule is enforced again server-side against the file's
 * actual bytes.
 */

// ── File rules ───────────────────────────────────────────────────────────

/**
 * What a document may be, when its type does not say otherwise.
 *
 * Wider than DRAWING_EXTENSIONS and narrower than the platform allow-list: a
 * supporting document is a scan or a photograph, so images belong here, but
 * CAD files do not — a DWG is a drawing and belongs on the Drawings tab where
 * it can be scrutinised.
 *
 * A DocumentType may narrow this further (`allowedExtensions`), never widen
 * it: the platform list in constants.ts is the ceiling.
 */
export const DOCUMENT_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg'] as const;

export const DOCUMENT_ACCEPT = DOCUMENT_EXTENSIONS.map((e) => `.${e}`).join(',');

/** The default per-document cap when a type does not set its own. */
export const DEFAULT_DOCUMENT_MAX_MB = 10;

export const extensionOf = (filename: string): string => {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
};

/**
 * The client-side pre-check, in one place so the dropzone and the file input
 * refuse identically. Returns a sentence to show, or null.
 */
export function describeFileProblem(
  file: { name: string; size: number },
  limits: { maxBytes: number; extensions?: readonly string[] }
): string | null {
  const allowed = limits.extensions?.length ? limits.extensions : DOCUMENT_EXTENSIONS;
  const extension = extensionOf(file.name);

  if (!extension || !allowed.includes(extension)) {
    return `${file.name} is not accepted here. Upload ${humanList(allowed.map((e) => `.${e}`))}.`;
  }
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > limits.maxBytes) {
    return `${file.name} is ${formatBytes(file.size)}. The limit for this document is ${formatBytes(limits.maxBytes)}.`;
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function humanList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

// ── Preview ──────────────────────────────────────────────────────────────

/**
 * Which stored types may be rendered INLINE in the browser.
 *
 * Deliberately a short allow-list rather than "anything the browser can
 * display". Serving a file inline means serving it from THIS origin, so an
 * uploaded HTML or SVG payload would execute as same-origin script. PDFs and
 * raster images cannot, and the preview route additionally sends
 * `X-Content-Type-Options: nosniff` and a sandbox CSP. Everything else is a
 * download.
 */
export const PREVIEWABLE_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
] as const;

export const isPreviewable = (mimeType: string): boolean =>
  (PREVIEWABLE_MIME_TYPES as readonly string[]).includes(mimeType);

// ── Statuses ─────────────────────────────────────────────────────────────

export type DocumentStatusKey =
  | 'NOT_UPLOADED'
  | 'UPLOADED'
  | 'UNDER_VERIFICATION'
  | 'VERIFIED'
  | 'REJECTED'
  | 'SUPERSEDED';

/**
 * Whether a document in this state SATISFIES its requirement.
 *
 * The one subtlety in the whole document subsystem, and the reason it is a
 * function rather than a constant: whether an uploaded-but-unverified document
 * counts is a departmental policy question (open question Q9), so it is the
 * `documents_complete_requires_verification` setting that decides. The default
 * is false — an uploaded document counts, and verification happens at the TPA
 * desk after payment.
 *
 * REJECTED never satisfies, under either policy.
 */
export function satisfiesRequirement(
  status: DocumentStatusKey | string,
  requiresVerification: boolean
): boolean {
  if (status === 'VERIFIED') return true;
  if (requiresVerification) return false;
  return status === 'UPLOADED' || status === 'UNDER_VERIFICATION';
}

/** Why a document does not yet satisfy its requirement, in the user's terms. */
export function whyNotSatisfied(
  status: DocumentStatusKey | string,
  requiresVerification: boolean
): string | null {
  if (satisfiesRequirement(status, requiresVerification)) return null;
  if (status === 'NOT_UPLOADED') return 'Not uploaded yet.';
  if (status === 'REJECTED') return 'Rejected by the department — upload a corrected copy.';
  if (requiresVerification) return 'Uploaded, waiting to be verified by the department.';
  return 'Not uploaded yet.';
}

// ── Gates ────────────────────────────────────────────────────────────────
//
// Which application statuses permit which document action. Named predicates in
// one isomorphic file, so the button's disabled state and the server's refusal
// are the same rule.

/**
 * Uploading or replacing a document.
 *
 * Opens once the drawing is settled — scrutiny passed, or waived for an
 * application type that is not machine-checked — because the required list is
 * derived from particulars that a draft has not finished collecting.
 *
 * Closes at FEE_GENERATED. A demand is calculated against a complete document
 * set; letting that set change underneath an issued demand would mean the
 * demand no longer describes the application it was raised for. Re-opening it
 * is what a Phase 8 shortfall is for.
 */
const UPLOADABLE = new Set<string>([
  'SCRUTINY_PASSED',
  'DOCUMENT_UPLOAD_PENDING',
  'DOCUMENTS_COMPLETED',
]);

export const canUploadDocument = (status: string): boolean => UPLOADABLE.has(status);

/** The statuses whose document state is derived rather than set by hand. */
export const DOCUMENT_PHASE_STATUSES: readonly string[] = [
  'SCRUTINY_PASSED',
  'DOCUMENT_UPLOAD_PENDING',
  'DOCUMENTS_COMPLETED',
];

export function whyCannotUploadDocument(status: string): string | null {
  if (canUploadDocument(status)) return null;

  if (status === 'DRAFT') {
    return 'File the application particulars first — which documents are required depends on them.';
  }
  if (['DRAWING_UPLOADED', 'SCRUTINY_IN_PROGRESS', 'SUBMITTED'].includes(status)) {
    return 'Documents are collected once the drawing has passed scrutiny.';
  }
  if (status === 'SCRUTINY_FAILED') {
    return 'Scrutiny failed. Correct the drawing and pass scrutiny before uploading documents.';
  }
  if (['FEE_GENERATED', 'PAYMENT_PENDING', 'PAYMENT_FAILED', 'PAYMENT_SUCCESSFUL'].includes(status)) {
    return 'The fee has been generated against this document set, so it can no longer be changed. The department can ask for a document through a shortfall.';
  }
  return 'This application is with the department, so its documents can no longer be changed.';
}
