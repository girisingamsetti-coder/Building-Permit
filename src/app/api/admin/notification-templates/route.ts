import { z } from 'zod';
import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { listNotificationTemplates, createNotificationTemplate } from '@/server/services/notification-template-admin';

export const dynamic = 'force-dynamic';
const schema = z.object({
  eventCode: z.string().min(1),
  channel: z.enum(['SMS', 'EMAIL', 'IN_APP']),
  subject: z.string().optional(),
  body: z.string().min(1),
  providerTemplateId: z.string().optional(),
});
export const GET = defineRoute(() => listNotificationTemplates(), { capabilities: [CAPABILITIES.NOTIFICATION_TEMPLATE_MANAGE] });
export const POST = defineRoute(
  async ({ body, user, ip, userAgent, correlationId }) => createNotificationTemplate(body, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.NOTIFICATION_TEMPLATE_MANAGE], schema }
);
