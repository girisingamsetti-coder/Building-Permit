/**
 * Ambient declarations for OPTIONAL runtime dependencies.
 *
 * `nodemailer` is deliberately not in `package.json`. The email adapter
 * imports it lazily so that a deployment using the console provider never
 * loads it, and so that a missing package surfaces as a clear delivery-log
 * entry rather than a boot failure that takes the whole application down over
 * an email. See `src/server/notifications/adapters/email.ts`.
 *
 * TypeScript cannot know that. Without this declaration the lazy import is a
 * TS2307 that fails `npm run typecheck` and the production build — so the one
 * design decision that keeps SMTP optional would be the thing that stops the
 * project compiling.
 *
 * The shape is narrowed to exactly what the adapter uses. Declaring the whole
 * API would be a fiction: nothing here has read nodemailer's types, and a
 * generous `any` would let a future call to a method that does not exist pass
 * the compiler. An installation that wants full types adds
 * `@types/nodemailer`, which takes precedence over this file.
 */
declare module 'nodemailer' {
  export function createTransport(options: Record<string, unknown>): {
    sendMail(options: Record<string, unknown>): Promise<{ messageId?: string }>;
  };
}
