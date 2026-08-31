import 'server-only';
import { env } from '@/server/config/env';
import { failed, sent, skipped, type ChannelAdapter, type SendInput } from '../types';

/**
 * Email, over SMTP or to the console.
 *
 * ── The console adapter is not a stub ────────────────────────────────────
 *
 * It writes the same delivery-log row the real one does and prints the message
 * where a developer can read it. What it does NOT do is claim delivery it
 * cannot make: the row records `provider = 'console'`, so nobody reading the
 * log six months later can mistake a printed message for a received one.
 */

type Transport = { sendMail(options: Record<string, unknown>): Promise<{ messageId?: string }> };

let cached: Transport | null = null;

/**
 * Built once and reused. `nodemailer` is imported lazily so that a deployment
 * using the console provider never loads it — and so that a missing dependency
 * surfaces as a clear delivery-log entry rather than a boot failure that takes
 * the whole application down over an email.
 */
async function transport(): Promise<Transport> {
  if (cached) return cached;

  const { createTransport } = await import('nodemailer');

  cached = createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    // Port 465 is implicit TLS; everything else upgrades with STARTTLS.
    secure: env.smtp.port === 465,
    ...(env.smtp.user
      ? { auth: { user: env.smtp.user, pass: env.smtp.password ?? '' } }
      : {}),
  }) as unknown as Transport;

  return cached;
}

export const emailAdapter: ChannelAdapter = {
  channel: 'EMAIL',
  name: env.emailProvider,
  configured: env.emailProvider === 'console' || Boolean(env.smtp.host),

  async send(input: SendInput) {
    const to = input.recipient.email.trim();
    if (!to) return skipped(env.emailProvider, 'No email address on file.');

    if (env.emailProvider === 'console') {
      console.log(
        `\n[email · console] to=${to}\n  subject: ${input.message.subject}\n  ${input.message.body.replace(/\n/g, '\n  ')}\n`
      );
      return sent('console');
    }

    if (!env.smtp.host) {
      return skipped('smtp', 'EMAIL_PROVIDER=smtp but SMTP_HOST is not set.');
    }

    try {
      const result = await (await transport()).sendMail({
        from: env.emailFrom,
        to,
        subject: input.message.subject,
        text: input.message.body,
      });

      return sent('smtp', result.messageId ?? '');
    } catch (error) {
      return failed('smtp', error instanceof Error ? error.message : String(error));
    }
  },
};
