import { z } from 'zod';

/**
 * What a client may send the shortfall engine.
 *
 * Note what is absent: no status, no next state, no mode. The caller says what
 * they DID — answered, accepted, rejected, withdrew — and the engine derives
 * the state from its own machine. A payload that could name its own status
 * would make the state machine advisory.
 */

/**
 * A file already uploaded and scanned, referenced by id.
 *
 * The shortfall never receives bytes. An upload is virus-scanned before it can
 * be read, and letting a response carry a file inline would attach an
 * unscanned document to the record of a decision.
 */
const attachment = z.object({
  fileObjectId: z.string().uuid(),
  name: z.string().trim().min(1).max(255),
  note: z.string().trim().max(500).default(''),
});

export const respondToShortfallSchema = z.object({
  response: z
    .string()
    .trim()
    .min(1, 'Say what you have done about it. This goes to the officer who asked.')
    .max(4000),
  attachments: z.array(attachment).max(20).default([]),
});

export type RespondToShortfallInput = z.infer<typeof respondToShortfallSchema>;

export const reviewShortfallSchema = z.object({
  accept: z.boolean(),
  remarks: z
    .string()
    .trim()
    .min(1, 'Say why, in a sentence. Your decision goes on the record either way.')
    .max(4000),
});

export type ReviewShortfallInput = z.infer<typeof reviewShortfallSchema>;

export const withdrawShortfallSchema = z.object({
  reason: z.string().trim().min(1, 'Say why this shortfall is being withdrawn.').max(1000),
});

export type WithdrawShortfallInput = z.infer<typeof withdrawShortfallSchema>;
