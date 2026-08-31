import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import {
  updateDocumentTypeSchema,
  type UpdateDocumentTypeInput,
} from '@/lib/schemas/document-admin';
import {
  archiveDocumentType,
  restoreDocumentType,
  updateDocumentType,
} from '@/server/services/document-admin';

export const dynamic = 'force-dynamic';

export const PATCH = defineRoute<UpdateDocumentTypeInput>(
  async ({ params, body, user, ip, userAgent, correlationId, searchParams }) => {
    const meta = { ip, userAgent, correlationId };
    // Restoring is a state change with no payload, so it rides on the same
    // verb rather than inventing a route for one boolean.
    if (searchParams.get('restore') === 'true') {
      return restoreDocumentType(params.id!, user, meta);
    }
    return updateDocumentType(params.id!, body, user, meta);
  },
  { capabilities: [CAPABILITIES.MASTER_DATA_MANAGE], schema: updateDocumentTypeSchema }
);

/**
 * Removes a type — outright when nothing has ever referenced it, otherwise by
 * archiving. The service decides which, and says which it did.
 */
export const DELETE = defineRoute(
  async ({ params, user, ip, userAgent, correlationId }) =>
    archiveDocumentType(params.id!, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.MASTER_DATA_MANAGE] }
);
