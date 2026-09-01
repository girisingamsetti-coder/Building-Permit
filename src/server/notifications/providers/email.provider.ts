import 'server-only';
import { env } from '@/server/config/env';
import type { EmailProvider, ProviderSendInput, ProviderSendOutcome } from './types';

/**
 * Mock Email Provider for local development and demonstration.
 * Logs the outbound email and returns a clean delivery record.
 */
export class MockEmailProvider implements EmailProvider {
  readonly name = 'MockEmailProvider';
  readonly configured = true;

  async sendEmail(input: ProviderSendInput): Promise<ProviderSendOutcome> {
    const to = input.recipient.email.trim();
    if (!to) {
      return {
        status: 'SKIPPED',
        provider: this.name,
        providerRef: '',
        error: 'No email address on file for recipient.',
      };
    }

    console.log(
      `\n[EMAIL-MOCK] To: ${to} | Subject: ${input.message.subject}\n  Body: ${input.message.body.replace(/\n/g, '\n  ')}\n`
    );

    return {
      status: 'SENT',
      provider: this.name,
      providerRef: `mock-email-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      error: '',
    };
  }
}

type SmtpTransport = { sendMail(options: Record<string, unknown>): Promise<{ messageId?: string }> };
let cachedTransport: SmtpTransport | null = null;

async function getSmtpTransport(): Promise<SmtpTransport> {
  if (cachedTransport) return cachedTransport;
  const { createTransport } = await import('nodemailer');
  cachedTransport = createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    ...(env.smtp.user ? { auth: { user: env.smtp.user, pass: env.smtp.password ?? '' } } : {}),
  }) as unknown as SmtpTransport;
  return cachedTransport;
}

/**
 * Production SMTP Email provider.
 */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = 'SmtpEmailProvider';
  readonly configured = Boolean(env.smtp.host);

  async sendEmail(input: ProviderSendInput): Promise<ProviderSendOutcome> {
    const to = input.recipient.email.trim();
    if (!to) {
      return {
        status: 'SKIPPED',
        provider: this.name,
        providerRef: '',
        error: 'No email address on file.',
      };
    }

    if (!env.smtp.host) {
      return {
        status: 'SKIPPED',
        provider: this.name,
        providerRef: '',
        error: 'SMTP_HOST is not configured.',
      };
    }

    try {
      const transport = await getSmtpTransport();
      const result = await transport.sendMail({
        from: env.emailFrom,
        to,
        subject: input.message.subject,
        text: input.message.body,
      });

      return {
        status: 'SENT',
        provider: this.name,
        providerRef: result.messageId ?? '',
        error: '',
      };
    } catch (error) {
      return {
        status: 'FAILED',
        provider: this.name,
        providerRef: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
