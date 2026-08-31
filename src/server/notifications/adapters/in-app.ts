import 'server-only';
import { prisma } from '@/server/db/prisma';
import { sent, skipped, type ChannelAdapter, type SendInput } from '../types';

/**
 * The in-app channel: a row in `notifications`, and the bell counts it.
 *
 * Always configured, and never fails for a reason outside this system — which
 * is why it is the channel the product relies on. Email bounces and SMS needs
 * a registered template; the notification centre needs a database that is
 * already required for the request to have happened at all.
 *
 * Somebody with no account gets nothing here, and that is not a failure: an
 * applicant reachable only by SMS has no inbox to put a row in, and inventing
 * a user for them would be worse than the honest SKIPPED this records.
 */
export const inAppAdapter: ChannelAdapter = {
  channel: 'IN_APP',
  name: 'in-app',
  configured: true,

  async send(input: SendInput) {
    if (!input.recipient.userId) {
      return skipped('in-app', 'No account to deliver to.');
    }

    const notification = await prisma.notification.create({
      data: {
        userId: input.recipient.userId,
        applicationId: input.applicationId,
        eventCode: input.eventCode,
        title: input.message.subject || input.eventCode.replace(/_/g, ' ').toLowerCase(),
        message: input.message.body,
        link: input.link,
      },
      select: { id: true },
    });

    return sent('in-app', notification.id);
  },
};
