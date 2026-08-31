import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import {
  documentRequirementSchema,
  type DocumentRequirementInput,
} from '@/lib/schemas/document-admin';
import {
  createDocumentRequirement,
  listDocumentRequirements,
} from '@/server/services/document-admin';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(async () => listDocumentRequirements(), {
  capabilities: [CAPABILITIES.MASTER_DATA_MANAGE],
});

export const POST = defineRoute<DocumentRequirementInput>(
  async ({ body, user, ip, userAgent, correlationId }) =>
    createDocumentRequirement(body, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.MASTER_DATA_MANAGE], schema: documentRequirementSchema }
);
