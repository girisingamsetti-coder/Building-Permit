import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { verifyDocumentSchema, type VerifyDocumentInput } from '@/lib/schemas/documents';
import { verifyDocument } from '@/server/services/documents';

export const dynamic = 'force-dynamic';

/**
 * An officer's decision on one uploaded document.
 *
 * DOCUMENT_VERIFY is held by every departmental role and by none of the LTP,
 * Finance or Viewer roles — an applicant cannot mark their own document
 * verified, which is the whole point of the capability existing separately
 * from DOCUMENT_UPLOAD.
 */
export const POST = defineRoute<VerifyDocumentInput>(
  async ({ user, params, body, ip, userAgent, correlationId }) =>
    verifyDocument(user, params.id!, body, { ip, userAgent, correlationId }),
  {
    capabilities: [CAPABILITIES.DOCUMENT_VERIFY],
    schema: verifyDocumentSchema,
  }
);
