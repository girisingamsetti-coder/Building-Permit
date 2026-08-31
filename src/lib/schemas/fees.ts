import { z } from 'zod';

/**
 * Fee request bodies.
 *
 * Note what is NOT here: nothing a client sends influences an amount. A
 * generate request carries no figures, no overrides and no line items — the
 * server resolves the structure, builds the context from the application's own
 * data and calculates. A body that could name a rate would be a body that
 * could name any rate.
 */

export const cancelDemandSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'Say why the demand is being cancelled')
    .max(500),
});

export type CancelDemandInput = z.infer<typeof cancelDemandSchema>;
