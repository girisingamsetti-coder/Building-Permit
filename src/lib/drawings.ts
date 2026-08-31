/**
 * Drawing vocabulary. Isomorphic — the upload form, the validator and the
 * service all read this file, so what the browser refuses and what the server
 * refuses cannot drift apart.
 *
 * The client-side checks here are a COURTESY: they fail fast so a user does
 * not wait through a 20 MB upload to be told the type is wrong. They decide
 * nothing. Every rule is enforced again server-side against the file's actual
 * bytes, where it counts.
 */

// ── Categories ───────────────────────────────────────────────────────────

/**
 * The sheet types shipped in the seed.
 *
 * These are the DEFAULTS, not the definition. Categories live in `master_data`
 * under `DRAWING_CATEGORY`, so a department can add "Landscape Plan" from the
 * admin UI without a migration or a deploy. This array is the seed's source
 * and the fallback the UI uses if the master list is ever empty — never a
 * hard-coded gate.
 */
export const DRAWING_CATEGORIES = [
  { code: 'SITE_PLAN', label: 'Site Plan', order: 1 },
  { code: 'FLOOR_PLAN', label: 'Floor Plan', order: 2 },
  { code: 'ELEVATION', label: 'Elevation', order: 3 },
  { code: 'SECTION', label: 'Section', order: 4 },
  { code: 'PARKING_PLAN', label: 'Parking Plan', order: 5 },
  { code: 'STRUCTURAL_DRAWING', label: 'Structural Drawing', order: 6 },
  { code: 'OTHER', label: 'Other', order: 99 },
] as const;

export type DrawingCategoryCode = (typeof DRAWING_CATEGORIES)[number]['code'];

const CATEGORY_LABELS = new Map(DRAWING_CATEGORIES.map((c) => [c.code as string, c.label as string]));

/** An unknown code renders as itself rather than blank — silence hides bugs. */
export function categoryLabel(code: string, master?: Array<{ code: string; label: string }>): string {
  const fromMaster = master?.find((m) => m.code === code)?.label;
  return fromMaster ?? CATEGORY_LABELS.get(code) ?? titleise(code);
}

/**
 * Which engineering discipline a sheet belongs to.
 *
 * Derived, never asked for. A scrutiny engine routes on discipline while an
 * LTP thinks in sheet types, and making someone answer the same question twice
 * is how the two end up disagreeing.
 */
export function disciplineFor(category: string): 'ARCHITECTURAL' | 'STRUCTURAL' {
  return category === 'STRUCTURAL_DRAWING' ? 'STRUCTURAL' : 'ARCHITECTURAL';
}

// ── File rules ───────────────────────────────────────────────────────────

/**
 * What a drawing may be.
 *
 * Narrower than the platform-wide ALLOWED_UPLOAD_EXTENSIONS in constants.ts:
 * that list also covers photographs and evidence for documents in Phase 4. A
 * building drawing is a PDF or a CAD file, and accepting a JPEG here would
 * mean accepting something no scrutiny engine can read.
 */
export const DRAWING_EXTENSIONS = ['pdf', 'dwg', 'dxf'] as const;

export const DRAWING_MIME_TYPES = [
  'application/pdf',
  // CAD types are reported inconsistently across browsers and operating
  // systems, so several spellings are accepted here. The magic-byte sniff on
  // the server is what actually decides.
  'image/vnd.dwg',
  'image/x-dwg',
  'application/acad',
  'application/x-acad',
  'application/autocad_dwg',
  'application/dwg',
  'application/x-dwg',
  'application/dxf',
  'application/x-dxf',
  'image/vnd.dxf',
  'drawing/x-dwg',
  'application/octet-stream',
] as const;

/** For the file picker's `accept` attribute. */
export const DRAWING_ACCEPT = DRAWING_EXTENSIONS.map((e) => `.${e}`).join(',');

export const extensionOf = (filename: string): string => {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
};

export const isAllowedDrawingExtension = (filename: string): boolean =>
  (DRAWING_EXTENSIONS as readonly string[]).includes(extensionOf(filename));

/**
 * The client-side pre-check, in one place so the dropzone and the file input
 * refuse identically. Returns a sentence to show, or null when the file looks
 * acceptable.
 */
export function describeFileProblem(
  file: { name: string; size: number },
  maxBytes: number
): string | null {
  if (!isAllowedDrawingExtension(file.name)) {
    return `${file.name} is not a drawing. Upload a PDF, DWG or DXF file.`;
  }
  if (file.size === 0) {
    return `${file.name} is empty.`;
  }
  if (file.size > maxBytes) {
    return `${file.name} is ${formatBytes(file.size)}. The limit is ${formatBytes(maxBytes)}.`;
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Gates ────────────────────────────────────────────────────────────────
//
// Which statuses permit which drawing action. Kept as named predicates in one
// isomorphic file so the button's disabled state and the server's refusal are
// the same rule, and so Phase 7 has one place to reconcile them against the
// workflow transition table.

/**
 * Uploading a new sheet or a new version.
 *
 * Open from DRAFT so an LTP can attach drawings while still filling in the
 * particulars, and open again after a failure — which is the correction loop.
 * Closed while a run is in flight (the version under test must not move) and
 * once scrutiny has passed (the approved drawing is the record).
 */
const UPLOADABLE = new Set<string>([
  'DRAFT',
  'SUBMITTED',
  'DRAWING_UPLOADED',
  'SCRUTINY_FAILED',
]);

/**
 * Sending the current drawing set to the engine.
 *
 * Deliberately NOT open in DRAFT: scrutiny checks a drawing against the
 * particulars — plot area, setbacks, FAR — so running it before those are
 * filed would check the drawing against nothing.
 */
const SCRUTINISABLE = new Set<string>(['SUBMITTED', 'DRAWING_UPLOADED', 'SCRUTINY_FAILED']);

export const canUploadDrawing = (status: string): boolean => UPLOADABLE.has(status);
export const canRequestScrutiny = (status: string): boolean => SCRUTINISABLE.has(status);
export const isScrutinyRunning = (status: string): boolean => status === 'SCRUTINY_IN_PROGRESS';
export const hasScrutinyPassed = (status: string): boolean =>
  status === 'SCRUTINY_PASSED' || status === 'DOCUMENT_UPLOAD_PENDING';

/**
 * Why an action is unavailable, in the user's terms.
 *
 * A disabled button with no explanation reads as a broken product. Every
 * refusal the server can give has a sentence here, and the UI shows it.
 */
export function whyCannotUpload(status: string): string | null {
  if (canUploadDrawing(status)) return null;
  if (isScrutinyRunning(status)) {
    return 'Scrutiny is running on the current drawing. Wait for the result before uploading another version.';
  }
  if (hasScrutinyPassed(status)) {
    return 'Scrutiny has passed. The approved drawing is now part of the record and cannot be replaced.';
  }
  return 'This application is with the department, so its drawings can no longer be changed.';
}

export function whyCannotRequestScrutiny(status: string): string | null {
  if (canRequestScrutiny(status)) return null;
  if (status === 'DRAFT') {
    return 'File the application particulars first — scrutiny checks the drawing against them.';
  }
  if (isScrutinyRunning(status)) return 'Scrutiny is already running on this drawing.';
  if (hasScrutinyPassed(status)) return 'Scrutiny has already passed for this application.';
  return 'This application is not at the scrutiny stage.';
}

// ── Severity ─────────────────────────────────────────────────────────────

/** Worst first. The order every issue list is sorted by. */
export const SEVERITY_ORDER = ['CRITICAL', 'MAJOR', 'MINOR', 'INFO'] as const;
export type Severity = (typeof SEVERITY_ORDER)[number];

export const severityRank = (severity: string): number => {
  const index = (SEVERITY_ORDER as readonly string[]).indexOf(severity);
  return index === -1 ? SEVERITY_ORDER.length : index;
};

/**
 * Which severities block a PASS.
 *
 * CRITICAL and MAJOR do; MINOR and INFO are reported but do not fail the run.
 * The threshold is stated once here because the provider, the summary line and
 * the UI all need to agree on what "failed" means.
 */
export const BLOCKING_SEVERITIES: readonly string[] = ['CRITICAL', 'MAJOR'];

export const isBlocking = (severity: string): boolean => BLOCKING_SEVERITIES.includes(severity);

function titleise(value: string): string {
  const lower = value.toLowerCase().replace(/_/g, ' ');
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
