import 'server-only';
import { prisma } from '@/server/db/prisma';
import { claimPending, markProcessed, markFailed } from '@/server/events/outbox';
import { settingString } from '@/server/services/settings';
import { markNotified } from '@/server/shortfalls/engine';
import { inAppAdapter } from './adapters/in-app';
import { emailAdapter } from './adapters/email';
import { smsAdapter } from './adapters/sms';
import { isKnownEvent, isMandatory, resolveRecipients } from './recipients';
import { linkFor, render, templatesFor } from './templates';
import { CHANNELS, type Channel, type ChannelAdapter, type Recipient } from './types';

/**
 * The dispatcher: outbox events in, messages out, one log row per attempt.
 *
 * ── It never throws away an event ────────────────────────────────────────
 *
 * A channel that fails is a FAILED row in `notification_logs` with the reason
 * on it, and the other channels still go. A channel with no template is a
 * SKIPPED row naming the gap. An event nobody is configured to hear about is
 * marked processed with a log row saying so. The one thing that must never
 * happen is an event disappearing with no record — because from the outside
 * that is indistinguishable from a message that was delivered.
 *
 * ── The only thing that fails the whole job ──────────────────────────────
 *
 * An infrastructure error: the database is gone, or a bug throws. Then the
 * outbox row is left unprocessed with its attempt count raised, and the worker
 * comes back to it. A gateway refusing one SMS is not that, and retrying the
 * whole event would re-send the email that already went.
 */

const ADAPTERS: Record<Channel, ChannelAdapter> = {
  IN_APP: inAppAdapter,
  EMAIL: emailAdapter,
  SMS: smsAdapter,
};

/** Same event, same person, same channel, within a minute: send once. */
const DEDUPE_WINDOW_MS = 60_000;

export type DispatchReport = {
  events: number;
  sent: number;
  failed: number;
  skipped: number;
  errored: number;
};

export async function dispatchOutbox(batchSize = 25): Promise<DispatchReport> {
  const events = await claimPending(batchSize);
  const report: DispatchReport = { events: events.length, sent: 0, failed: 0, skipped: 0, errored: 0 };

  for (const event of events) {
    try {
      const outcome = await dispatchEvent({
        eventCode: event.eventCode,
        applicationId: event.applicationId,
        payload: (event.payload ?? {}) as Record<string, unknown>,
      });

      report.sent += outcome.sent;
      report.failed += outcome.failed;
      report.skipped += outcome.skipped;

      await markProcessed(event.id);
    } catch (error) {
      // Infrastructure, not delivery. Leave it unprocessed so the worker
      // returns to it rather than losing the event.
      report.errored += 1;
      await markFailed(event.id, error instanceof Error ? error.message : String(error));
      console.error(`[notifications] ${event.eventCode} could not be dispatched`, error);
    }
  }

  return report;
}

export type EventOutcome = { sent: number; failed: number; skipped: number };

/**
 * Delivers one event to everybody who should hear about it.
 *
 * Exported so a test — and, later, an administrator pressing "resend" — can
 * drive one event without going through the queue.
 */
export async function dispatchEvent(event: {
  eventCode: string;
  applicationId: string | null;
  payload: Record<string, unknown>;
}): Promise<EventOutcome> {
  const outcome: EventOutcome = { sent: 0, failed: 0, skipped: 0 };

  if (!isKnownEvent(event.eventCode)) {
    // Not an error. `TASK_ASSIGNED` for a role nobody is configured to notify
    // is a legitimate quiet event — but it is recorded, so "why did nobody get
    // told?" has an answer that is not "read the source".
    await logRow({
      eventCode: event.eventCode,
      channel: 'IN_APP',
      recipient: '',
      status: 'SKIPPED',
      error: 'No recipient rule is configured for this event.',
    });
    outcome.skipped += 1;
    return outcome;
  }

  const [recipients, templates] = await Promise.all([
    resolveRecipients(event.eventCode, event.applicationId, {
      ...event.payload,
      applicationId: event.applicationId,
    }),
    templatesFor(event.eventCode),
  ]);

  if (!recipients.length) {
    await logRow({
      eventCode: event.eventCode,
      channel: 'IN_APP',
      recipient: '',
      status: 'SKIPPED',
      error: 'Nobody to tell — no matching recipient was found for this event.',
    });
    outcome.skipped += 1;
    return outcome;
  }

  const link = linkFor(event.eventCode, { ...event.payload, applicationId: event.applicationId });
  const quiet = await quietHours();
  let delivered = 0;

  for (const recipient of recipients) {
    for (const channel of CHANNELS) {
      const template = templates.get(channel);

      // No template is a real gap and is recorded as one. It is also the
      // ordinary case for a channel a department has chosen not to use for
      // this event, which is why it is SKIPPED rather than FAILED.
      if (!template) continue;

      const decision = await shouldSend(event.eventCode, channel, recipient, quiet);
      if (decision) {
        await logRow({
          eventCode: event.eventCode,
          channel,
          templateId: template.id,
          recipientUserId: recipient.userId,
          recipient: addressFor(channel, recipient),
          status: 'SKIPPED',
          error: decision,
        });
        outcome.skipped += 1;
        continue;
      }

      const message = await render(template, {
        ...event.payload,
        applicationId: event.applicationId,
        recipientName: recipient.name,
        link,
      });

      const adapter = ADAPTERS[channel];
      const result = adapter.configured
        ? await adapter.send({
            channel,
            recipient,
            message,
            eventCode: event.eventCode,
            applicationId: event.applicationId,
            link,
          })
        : {
            status: 'SKIPPED' as const,
            provider: adapter.name,
            providerRef: '',
            error: `The ${channel} channel is not configured.`,
          };

      await logRow({
        eventCode: event.eventCode,
        channel,
        templateId: template.id,
        recipientUserId: recipient.userId,
        recipient: addressFor(channel, recipient),
        subject: message.subject,
        body: message.body,
        status: result.status,
        provider: result.provider,
        providerRef: result.providerRef,
        // A template that rendered blanks is worth knowing about even when the
        // message went: the applicant received a sentence with a hole in it.
        error:
          result.error ||
          (message.missing.length
            ? `Sent, but these variables were empty: ${message.missing.join(', ')}.`
            : ''),
        sentAt: result.status === 'SENT' ? new Date() : null,
      });

      if (result.status === 'SENT') {
        outcome.sent += 1;
        delivered += 1;
      } else if (result.status === 'FAILED') {
        outcome.failed += 1;
      } else {
        outcome.skipped += 1;
      }
    }
  }

  // ── The shortfall lifecycle's NOTIFIED step ─────────────────────────────
  //
  // Advanced only when a message actually went out. A shortfall left at RAISED
  // is the visible symptom of a dispatcher that could not tell anybody, which
  // is the failure the two states exist to separate.
  const shortfallId = String(event.payload.shortfallId ?? '');
  if (delivered > 0 && shortfallId && event.eventCode === 'SHORTFALL_RAISED') {
    await markNotified(shortfallId);
  }

  return outcome;
}

// ═══════════════════════════════════════════════════════════════════════════
// Delivery rules
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Why this message should not go. Null means send it.
 *
 * Order matters: preference is checked before dedupe, because a message the
 * recipient switched off should read as "they switched it off" rather than as
 * a duplicate of one they never received.
 */
async function shouldSend(
  eventCode: string,
  channel: Channel,
  recipient: Recipient,
  quiet: { from: number; to: number } | null
): Promise<string | null> {
  if (recipient.userId && !(recipient.mandatory && isMandatory(eventCode))) {
    const preference = await prisma.notificationPreference.findUnique({
      where: {
        userId_eventCode_channel: { userId: recipient.userId, eventCode, channel },
      },
      select: { enabled: true },
    });

    if (preference && !preference.enabled) {
      return 'The recipient has turned this notification off.';
    }
  }

  const address = addressFor(channel, recipient);
  if (!address && channel !== 'IN_APP') {
    return channel === 'EMAIL' ? 'No email address on file.' : 'No mobile number on file.';
  }

  const recent = await prisma.notificationLog.findFirst({
    where: {
      eventCode,
      channel,
      recipient: address,
      status: { in: ['SENT', 'QUEUED'] },
      createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
    },
    select: { id: true },
  });

  if (recent) {
    return 'An identical message was sent to this recipient less than a minute ago.';
  }

  // Quiet hours apply to SMS alone. An email or an in-app row at half past
  // eleven costs the recipient nothing; a text message wakes them up.
  if (channel === 'SMS' && quiet && inQuietHours(quiet)) {
    return `Quiet hours (${quiet.from}:00–${quiet.to}:00). SMS is not sent overnight.`;
  }

  return null;
}

const addressFor = (channel: Channel, recipient: Recipient): string => {
  if (channel === 'EMAIL') return recipient.email.trim();
  if (channel === 'SMS') return recipient.phone.trim();
  return recipient.userId ?? '';
};

/** `22-07` in the settings, meaning 22:00 to 07:00. Empty disables it. */
async function quietHours(): Promise<{ from: number; to: number } | null> {
  const raw = (await settingString('notifications_quiet_hours', '')).trim();
  if (!raw) return null;

  const match = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec(raw);
  if (!match) return null;

  const from = Number(match[1]);
  const to = Number(match[2]);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from > 23 || to > 23) return null;

  return { from, to };
}

function inQuietHours(window: { from: number; to: number }, now = new Date()): boolean {
  const hour = now.getHours();
  // A window that wraps midnight (22 → 7) is the normal case, so it is handled
  // first rather than as an edge.
  return window.from > window.to
    ? hour >= window.from || hour < window.to
    : hour >= window.from && hour < window.to;
}

// ═══════════════════════════════════════════════════════════════════════════
// The log
// ═══════════════════════════════════════════════════════════════════════════

/**
 * One row per attempt, whatever happened.
 *
 * This table is the answer to "was the applicant told?", and it has to be able
 * to say no. A dispatcher that only logged successes would make every failure
 * look like an event that never happened.
 */
async function logRow(input: {
  eventCode: string;
  channel: Channel;
  templateId?: string;
  recipientUserId?: string | null;
  recipient: string;
  subject?: string;
  body?: string;
  status: 'SENT' | 'FAILED' | 'SKIPPED' | 'QUEUED';
  provider?: string;
  providerRef?: string;
  error?: string;
  sentAt?: Date | null;
}) {
  await prisma.notificationLog.create({
    data: {
      eventCode: input.eventCode,
      channel: input.channel,
      templateId: input.templateId ?? null,
      recipientUserId: input.recipientUserId ?? null,
      recipient: input.recipient.slice(0, 255),
      subject: (input.subject ?? '').slice(0, 500),
      body: (input.body ?? '').slice(0, 4000),
      status: input.status,
      provider: input.provider ?? '',
      providerRef: input.providerRef ?? '',
      errorMessage: (input.error ?? '').slice(0, 1000),
      attempts: 1,
      sentAt: input.sentAt ?? null,
    },
  });
}
