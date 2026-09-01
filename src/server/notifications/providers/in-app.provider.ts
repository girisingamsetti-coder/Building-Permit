import 'server-only';
import { prisma } from '@/server/db/prisma';
import type { InAppProvider, ProviderSendInput, ProviderSendOutcome } from './types';

/**
 * In-App Provider.
 * Writes directly to the `notifications` table for the user's notification center and bell badge.
 */
export class DbInAppProvider implements InAppProvider {
  readonly name = 'DbInAppProvider';
  readonly configured = true;

  async sendInApp(input: ProviderSendInput): Promise<ProviderSendOutcome> {
    if (!input.recipient.userId) {
      return {
        status: 'SKIPPED',
        provider: this.name,
        providerRef: '',
        error: 'Recipient has no user account for in-app delivery.',
      };
    }

    try {
      const created = await prisma.notification.create({
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

      return {
        status: 'SENT',
        provider: this.name,
        providerRef: created.id,
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
