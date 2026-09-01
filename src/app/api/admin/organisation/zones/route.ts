import { z } from 'zod';
import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { listZones, createZone } from '@/server/services/organisation-admin';

export const dynamic = 'force-dynamic';
const schema = z.object({ code: z.string().min(1).max(20), name: z.string().min(2).max(100) });
export const GET = defineRoute(() => listZones(), { capabilities: [CAPABILITIES.ORG_MANAGE] });
export const POST = defineRoute(
  async ({ body, user, ip, userAgent, correlationId }) => createZone(body, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.ORG_MANAGE], schema }
);
