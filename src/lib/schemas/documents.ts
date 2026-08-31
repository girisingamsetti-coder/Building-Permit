import { z } from 'zod';

/**
 * Document request bodies.
 *
 * The upload itself is multipart and is validated in the route and then in the
 * upload pipeline — a Zod schema cannot check magic bytes. What is here is the
 * JSON surface: the verification decision.
 */

export const verifyDocumentSchema = z
  .object({
    decision: z.enum(['VERIFY', 'REJECT'], {
      errorMap: () => ({ message: 'Choose whether the document is accepted or rejected' }),
    }),
    remarks: z.string().trim().max(1000).optional().default(''),
  })
  // A rejection without a reason sends the applicant to the telephone to find
  // out what to change. Required here as well as in the service, so the form
  // can show the error against the field rather than as a toast.
  .refine((value) => value.decision !== 'REJECT' || value.remarks.length > 0, {
    message: 'Say what is wrong with the document, so it can be corrected',
    path: ['remarks'],
  });

export type VerifyDocumentInput = z.infer<typeof verifyDocumentSchema>;

// ── The register list query ──────────────────────────────────────────────

/**
 * Sortable columns, as an allow-list.
 *
 * A security boundary, not a convenience: the value reaches `orderBy`, and
 * accepting an arbitrary column name from a query string is how a list
 * endpoint starts leaking the shape of its table.
 */
export const DOCUMENT_SORT_FIELDS = [
  'updatedAt',
  'createdAt',
  'status',
  'applicationNumber',
  'documentType',
] as const;
export type DocumentSortField = (typeof DOCUMENT_SORT_FIELDS)[number];

const toArray = (value: string | string[] | undefined): string[] | undefined => {
  if (value === undefined) return undefined;
  const list = (Array.isArray(value) ? value : value.split(','))
    .map((v) => v.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
};

export const documentListQuerySchema = z.object({
  /** Free text over application number, applicant name and document name. */
  q: z.string().trim().max(120).optional(),
  /** Repeatable: ?status=UPLOADED&status=REJECTED. */
  status: z.union([z.string(), z.array(z.string())]).optional().transform(toArray),
  documentTypeId: z.string().uuid().optional(),
  applicationTypeId: z.string().uuid().optional(),
  zoneId: z.string().uuid().optional(),
  /** `pending` — awaiting a decision. `expiring` — valid, but not for long. */
  bucket: z.enum(['all', 'pending', 'verified', 'rejected', 'expiring']).default('all'),
  mandatoryOnly: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
  from: z.string().optional(),
  to: z.string().optional(),
  sort: z.enum(DOCUMENT_SORT_FIELDS).default('updatedAt'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type DocumentListQuery = z.infer<typeof documentListQuerySchema>;

/**
 * Parses a URLSearchParams into the list query, preserving repeated keys.
 *
 * `Object.fromEntries` keeps only the LAST value of a repeated key, which
 * would silently drop every status filter but one — the Phase 2 bug, in a new
 * place.
 */
export function parseDocumentListQuery(searchParams: URLSearchParams): DocumentListQuery {
  const raw: Record<string, string | string[]> = {};
  for (const key of new Set(searchParams.keys())) {
    const all = searchParams.getAll(key);
    raw[key] = all.length > 1 ? all : all[0]!;
  }
  return documentListQuerySchema.parse(raw);
}
