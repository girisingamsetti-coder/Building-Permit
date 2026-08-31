import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { submitApplicationSchema, type SubmitApplicationInput } from '@/lib/schemas/applications';
import { submitApplication } from '@/server/services/applications';

export const dynamic = 'force-dynamic';

/**
 * Files the application.
 *
 * Completeness is re-derived from the persisted rows inside the service — the
 * client's idea of which steps it finished is not consulted. An incomplete
 * file comes back as a 422 listing every offending field, which the review
 * screen renders next to the step it belongs to.
 */
export const POST = defineRoute<SubmitApplicationInput>(
  async ({ user, params, ip, userAgent, correlationId }) =>
    submitApplication(user, params.id!, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.APPLICATION_EDIT], schema: submitApplicationSchema }
);
