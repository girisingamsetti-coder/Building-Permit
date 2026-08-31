import { z } from 'zod';

/**
 * Editing business configuration.
 *
 * ── Why the value is always a string ─────────────────────────────────────
 *
 * `system_settings.value` is TEXT and `system_settings.type` says how to read
 * it. Accepting a typed union here would mean the API and the column could
 * disagree about what a setting is — a boolean posted against a NUMBER row
 * would be stored as "true" and then coerced to 0 by `settingNumber`, silently
 * turning a service standard off. So the wire format matches the column, and
 * the value is validated AGAINST THE ROW'S OWN TYPE on the server, where the
 * row is known.
 */
export const settingUpdateSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(120)
    // Keys are seeded, never user-invented. Constraining the shape keeps a
    // malformed key out of the audit trail's entityId.
    .regex(/^[a-z0-9_.]+$/, 'A setting key is lower-case letters, digits, dots and underscores.'),
  value: z.string().max(4000),
});

export type SettingUpdateInput = z.infer<typeof settingUpdateSchema>;

/**
 * A batch. The administrator edits a group and saves once, and the whole batch
 * succeeds or none of it does — a half-applied SLA configuration is worse than
 * an unchanged one.
 */
export const settingsBatchSchema = z.object({
  changes: z.array(settingUpdateSchema).min(1).max(60),
});

export type SettingsBatchInput = z.infer<typeof settingsBatchSchema>;
