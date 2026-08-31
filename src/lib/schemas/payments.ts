import { z } from 'zod';

/**
 * Payment request bodies.
 *
 * Note what is NOT here, and could not be added: nothing a client sends
 * influences an amount, a status or an outcome. An initiate request names a
 * demand and nothing else — the server reads that demand's own balance. A
 * verify request carries no body at all, because the only thing that could
 * usefully be in one is the gateway's verdict, and the gateway's verdict is
 * asked for server-to-server rather than accepted from a browser.
 *
 * A body that could name an amount would be a body that could name any amount.
 */

export const initiatePaymentSchema = z.object({
  applicationFeeId: z.string().uuid('Name the demand to be paid'),
});

export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>;

/**
 * The demo gateway's own form.
 *
 * This is the PAYER acting at a simulated gateway, not a client telling the
 * application what happened — the distinction matters, because the outcome
 * chosen here is delivered back through the ordinary signed-webhook path and
 * is then verified server-to-server like any other. Choosing SUCCESS here does
 * not mark anything paid; it makes the demo gateway say it was paid, which the
 * settlement then checks.
 */
export const mockGatewayActionSchema = z.object({
  outcome: z.enum(['SUCCESS', 'FAILED', 'CANCELLED', 'PENDING']),
  /**
   * Lets a demonstration or a test drive the amount-mismatch refusal without
   * touching settings. Ignored unless it parses as a positive amount.
   */
  amountOverride: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a number with up to two decimals')
    .optional(),
  /**
   * Deliver the same event id twice. There to make "a duplicate callback
   * credits once" demonstrable from the UI rather than only from a test.
   */
  deliverTwice: z.boolean().optional().default(false),
});

export type MockGatewayActionInput = z.infer<typeof mockGatewayActionSchema>;
