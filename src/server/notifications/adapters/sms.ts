import 'server-only';
import { env } from '@/server/config/env';
import { failed, sent, skipped, type ChannelAdapter, type SendInput } from '../types';

/**
 * SMS.
 *
 * ── DLT registration is not optional in India ────────────────────────────
 *
 * Every transactional SMS to an Indian number must quote a template id
 * registered on the operator's DLT platform, and one sent without it is
 * dropped by the carrier — silently, from the sender's point of view. So this
 * adapter REFUSES to send without a `providerTemplateId` rather than making a
 * call that will look successful and deliver nothing. A missing registration
 * shows up as a SKIPPED row naming the template, which is a problem somebody
 * can fix, instead of a message the applicant never receives.
 *
 * See docs/10-open-questions.md Q13 — whose DLT account registers the
 * templates is still open, and this is what the answer plugs into.
 */

const normalise = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  // A ten-digit Indian mobile, as stored. The country code is added because
  // most gateways require E.164 and most departments store the bare number.
  if (digits.length === 10) return `91${digits}`;
  return digits;
};

export const smsAdapter: ChannelAdapter = {
  channel: 'SMS',
  name: env.smsProvider,
  configured: env.smsProvider === 'mock' || Boolean(env.smsApiKey),

  async send(input: SendInput) {
    const phone = normalise(input.recipient.phone ?? '');
    if (!phone) return skipped(env.smsProvider, 'No mobile number on file.');

    if (!input.message.providerTemplateId) {
      return skipped(
        env.smsProvider,
        'No DLT template id registered for this event. An unregistered SMS is dropped by the carrier, so it was not sent.'
      );
    }

    if (env.smsProvider === 'mock') {
      console.log(`[sms · mock] to=${phone} dlt=${input.message.providerTemplateId}: ${input.message.body}`);
      return sent('mock');
    }

    if (!env.smsApiKey) return skipped('msg91', 'SMS_API_KEY is not set.');

    try {
      // MSG91's transactional endpoint. Kept to `fetch` on purpose: an HTTP
      // API needs no dependency, and a gateway swap is this one function.
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
        return failed('msg91', `Gateway answered ${response.status}.`);
      }

      const body = (await response.json().catch(() => ({}))) as { requestId?: string };
      return sent('msg91', body.requestId ?? '');
    } catch (error) {
      return failed('msg91', error instanceof Error ? error.message : String(error));
    }
  },
};
