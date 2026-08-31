import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { documentTypeSchema, type DocumentTypeInput } from '@/lib/schemas/document-admin';
import { createDocumentType, listDocumentTypes } from '@/server/services/document-admin';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  async ({ searchParams }) =>
    listDocumentTypes({ includeArchived: searchParams.get('includeArchived') === 'true' }),
  { capabilities: [CAPABILITIES.MASTER_DATA_MANAGE] }
);

export const POST = defineRoute<DocumentTypeInput>(
  async ({ body, user, ip, userAgent, correlationId }) =>
    createDocumentType(body, user, { ip, userAgent, correlationId }),
  { capabilities: [CAPABILITIES.MASTER_DATA_MANAGE], schema: documentTypeSchema }
);
