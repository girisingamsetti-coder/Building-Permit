import { z } from 'zod';
import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { updateNotificationTemplate, deleteNotificationTemplate } from '@/server/services/notification-template-admin';

export const dynamic = 'force-dynamic';
const schema = z.object({
  subject: z.string().optional(),
  body: z.string().min(1).optional(),
  providerTemplateId: z.string().optional(),
  isActive: z.boolean().optional(),
});
export const PATCH = defineRoute(
  async ({ params, body, user, ip, userAgent, correlationId }) => updateNotificationTemplate(params.id, body, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.NOTIFICATION_TEMPLATE_MANAGE], schema }
);
export const DELETE = defineRoute(
  async ({ params, user, ip, userAgent, correlationId }) => deleteNotificationTemplate(params.id, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.NOTIFICATION_TEMPLATE_MANAGE] }
);
