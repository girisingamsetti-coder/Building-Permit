import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import {
  respondToShortfallSchema,
  type RespondToShortfallInput,
} from '@/lib/schemas/shortfalls';
import { respondToShortfall } from '@/server/shortfalls/actions';

export const dynamic = 'force-dynamic';

/**
 * The applicant's answer.
 *
 * When this shortfall is the one parking the file, the response also carries
 * the application back to the desk that raised it — through the workflow
 * engine's own transition, not through a second code path. See
 * `src/server/shortfalls/actions.ts`.
 */
export const POST = defineRoute<RespondToShortfallInput>(
  async ({ user, params, body, ip, userAgent, correlationId }) =>
    respondToShortfall(user, params.id!, body, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.SHORTFALL_RESPOND], schema: respondToShortfallSchema }
);
