import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import {
  updateDocumentRequirementSchema,
  type UpdateDocumentRequirementInput,
} from '@/lib/schemas/document-admin';
import {
  deleteDocumentRequirement,
  updateDocumentRequirement,
} from '@/server/services/document-admin';

export const dynamic = 'force-dynamic';

export const PATCH = defineRoute<UpdateDocumentRequirementInput>(
  async ({ params, body, user, ip, userAgent, correlationId }) =>
    updateDocumentRequirement(params.id!, body, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.MASTER_DATA_MANAGE], schema: updateDocumentRequirementSchema }
);

export const DELETE = defineRoute(
  async ({ params, user, ip, userAgent, correlationId }) =>
    deleteDocumentRequirement(params.id!, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.MASTER_DATA_MANAGE] }
);
