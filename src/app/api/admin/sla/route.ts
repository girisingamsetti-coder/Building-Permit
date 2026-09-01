import { z } from 'zod';
import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { listSlaRules, createSlaRule } from '@/server/services/sla-admin';

export const dynamic = 'force-dynamic';
const schema = z.object({
  workflowStageId: z.string(),
  applicationTypeId: z.string().nullable().optional(),
  days: z.number().int().min(1),
  calendar: z.string().default('WORKING_DAYS'),
  warnAtPercent: z.number().int().min(1).max(100).default(70),
  escalateToRoleKey: z.string().nullable().optional(),
  pauseOnShortfall: z.boolean().default(true),
});
export const GET = defineRoute(() => listSlaRules(), { capabilities: [CAPABILITIES.SETTINGS_MANAGE] });
export const POST = defineRoute(
  async ({ body, user, ip, userAgent, correlationId }) => createSlaRule(body, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.SETTINGS_MANAGE], schema }
);
