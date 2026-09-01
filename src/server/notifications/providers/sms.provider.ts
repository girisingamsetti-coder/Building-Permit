import 'server-only';
import { env } from '@/server/config/env';
import type { ProviderSendInput, ProviderSendOutcome, SmsProvider } from './types';

const normalisePhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits;
};

/**
 * Mock SMS Provider for local development and demonstration.
 * Logs the outbound SMS and returns successful dispatch without carrier charges.
 */
export class MockSmsProvider implements SmsProvider {
  readonly name = 'MockSmsProvider';
  readonly configured = true;

  async sendSms(input: ProviderSendInput): Promise<ProviderSendOutcome> {
    const phone = normalisePhone(input.recipient.phone ?? '');
    if (!phone) {
      return {
        status: 'SKIPPED',
        provider: this.name,
        providerRef: '',
        error: 'No mobile number on file for recipient.',
      };
    }

    const dlt = input.message.providerTemplateId || 'DLT_MOCK_TXN';
    console.log(`[SMS-MOCK] To: +${phone} | Template: ${dlt} | Message: ${input.message.body}`);

    return {
      status: 'SENT',
      provider: this.name,
      providerRef: `mock-sms-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      error: '',
    };
  }
}

/**
 * Production Indian Transactional SMS provider via MSG91 / DLT.
 */
export class Msg91SmsProvider implements SmsProvider {
  readonly name = 'Msg91SmsProvider';
  readonly configured = Boolean(env.smsApiKey);

  async sendSms(input: ProviderSendInput): Promise<ProviderSendOutcome> {
    const phone = normalisePhone(input.recipient.phone ?? '');
    if (!phone) {
      return {
        status: 'SKIPPED',
        provider: this.name,
        providerRef: '',
        error: 'No mobile number on file.',
      };
    }

    if (!input.message.providerTemplateId) {
      return {
        status: 'SKIPPED',
        provider: this.name,
        providerRef: '',
        error: 'Missing DLT template ID. Carrier dropped unregistered template.',
      };
    }

    if (!env.smsApiKey) {
      return {
        status: 'SKIPPED',
        provider: this.name,
        providerRef: '',
        error: 'SMS_API_KEY is not configured.',
      };
    }

    try {
      const response = await fetch('https://control.msg91.com/api/v5/flow/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authkey: env.smsApiKey },
        body: JSON.stringify({
          template_id: input.message.providerTemplateId,
          sender: env.smsSenderId ?? '',
          short_url: '0',
          recipients: [{ mobiles: phone, body: input.message.body }],
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        return {
          status: 'FAILED',
          provider: this.name,
          providerRef: '',
          error: `Gateway answered HTTP ${response.status}`,
        };
      }

      const body = (await response.json().catch(() => ({}))) as { requestId?: string };
      return {
        status: 'SENT',
        provider: this.name,
        providerRef: body.requestId ?? '',
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
