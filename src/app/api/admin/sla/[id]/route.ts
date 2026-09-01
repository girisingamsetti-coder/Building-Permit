import { z } from 'zod';
import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { updateSlaRule, deleteSlaRule } from '@/server/services/sla-admin';

export const dynamic = 'force-dynamic';
const schema = z.object({
  days: z.number().int().min(1).optional(),
  calendar: z.string().optional(),
  warnAtPercent: z.number().int().min(1).max(100).optional(),
  escalateToRoleKey: z.string().nullable().optional(),
  pauseOnShortfall: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
export const PATCH = defineRoute(
  async ({ params, body, user, ip, userAgent, correlationId }) => updateSlaRule(params.id, body, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.SETTINGS_MANAGE], schema }
);
export const DELETE = defineRoute(
  async ({ params, user, ip, userAgent, correlationId }) => deleteSlaRule(params.id, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.SETTINGS_MANAGE] }
);
