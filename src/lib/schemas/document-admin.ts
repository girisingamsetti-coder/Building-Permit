import { z } from 'zod';
import { DOCUMENT_EXTENSIONS } from '@/lib/documents';
import { ALLOWED_UPLOAD_EXTENSIONS } from '@/lib/constants';
import { validateCondition } from '@/lib/conditions';

/**
 * The document catalogue and its requirement rules, as an administrator edits
 * them.
 *
 * Shared contracts, not server code: the admin forms parse with exactly these
 * schemas, so what the browser marks in red and what the API refuses are the
 * same rule. See docs/06-frontend.md J.
 */

const trimmed = (max: number) => z.string().trim().max(max);

/** `SALE_DEED`, not `Sale Deed` — the code is an identifier, and integrations use it. */
const CODE = z
  .string()
  .trim()
  .min(2, 'A code is required')
  .max(60)
  .regex(
    /^[A-Z][A-Z0-9_]*$/,
    'Use upper-case letters, digits and underscores — e.g. STRUCTURAL_STABILITY_CERTIFICATE'
  );

/**
 * A type may NARROW the platform allow-list, never widen it.
 *
 * The list in constants.ts is the ceiling for every upload in the system, and
 * an administrator who could add `exe` here would be editing the security
 * boundary from a form.
 */
const EXTENSIONS = z
  .array(z.string().trim().toLowerCase().max(10))
  .min(1, 'Choose at least one file type')
  .max(12)
  .refine(
    (list) => list.every((e) => (ALLOWED_UPLOAD_EXTENSIONS as readonly string[]).includes(e)),
    {
      message: `Only these are accepted anywhere in the system: ${ALLOWED_UPLOAD_EXTENSIONS.join(', ')}`,
    }
  );

export const documentTypeSchema = z.object({
  code: CODE,
  name: trimmed(120).min(2, 'A name is required'),
  description: trimmed(500).optional().default(''),
  category: trimmed(80).optional().default(''),
  allowedExtensions: EXTENSIONS.default([...DOCUMENT_EXTENSIONS]),
  maxSizeMb: z.coerce
    .number()
    .int()
    .min(1, 'At least 1 MB')
    // The platform cap still applies on top of this; a type cannot raise it.
    .max(100, 'Above the platform ceiling'),
  requiresExpiry: z.coerce.boolean().default(false),
  isActive: z.coerce.boolean().default(true),
});
export type DocumentTypeInput = z.infer<typeof documentTypeSchema>;

/** The code is an identifier other rows point at, so it does not change. */
export const updateDocumentTypeSchema = documentTypeSchema.omit({ code: true }).partial();
export type UpdateDocumentTypeInput = z.infer<typeof updateDocumentTypeSchema>;

/**
 * A condition arrives from the form as TEXT, because that is what an
 * administrator types. It is parsed and shape-checked here, so a rule that
 * could never fire is refused at the point somebody writes it rather than
 * silently never asking for a document.
 */
export const conditionJson = z
  .string()
  .trim()
  .optional()
  .default('')
  .transform((raw, ctx) => {
    if (!raw || raw === '{}') return {};

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'That is not valid JSON. A rule that always applies is written as {}.',
      });
      return z.NEVER;
    }

    const problems = validateCondition(parsed);
    if (problems.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: problems[0]!.message });
      return z.NEVER;
    }

    return parsed as Record<string, unknown>;
  });

export const documentRequirementSchema = z.object({
  documentTypeId: z.string().uuid('Choose a document'),
  /** Empty string from a select means "every application type". */
  applicationTypeId: z
    .union([z.string().uuid(), z.literal('')])
    .optional()
    .transform((v) => (v ? v : null)),
  buildingUse: trimmed(60).optional().default(''),
  landUseZone: trimmed(60).optional().default(''),
  isMandatory: z.coerce.boolean().default(true),
  condition: conditionJson,
  displayOrder: z.coerce.number().int().min(0).max(9999).default(0),
  helpText: trimmed(500).optional().default(''),
  isActive: z.coerce.boolean().default(true),
});
export type DocumentRequirementInput = z.infer<typeof documentRequirementSchema>;

export const updateDocumentRequirementSchema = documentRequirementSchema.partial();
export type UpdateDocumentRequirementInput = z.infer<typeof updateDocumentRequirementSchema>;
