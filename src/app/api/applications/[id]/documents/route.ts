import { defineRoute, created } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { badRequest, tooLarge } from '@/server/http/errors';
import { env } from '@/server/config/env';
import { getDocuments, uploadDocument, documentTypes } from '@/server/services/documents';

export const dynamic = 'force-dynamic';

/**
 * Documents on one application.
 *
 * The GET returns the whole checklist — the DERIVED requirement list merged
 * with what has been uploaded — not a list of rows in a table. That is the
 * point of the endpoint: "which documents does this application need, and
 * where does each one stand" is one question, and answering it in one place is
 * what stops the tab, the dashboard tile and the fee guard disagreeing.
 *
 * The POST takes MULTIPART, so it declares no `schema` and reads the form
 * itself. Everything the wrapper would normally do — session, capability,
 * read-only refusal, rate limit, error envelope — still applies.
 */

export const GET = defineRoute(
  async ({ user, params }) => {
    const [checklist, types] = await Promise.all([
      getDocuments(user, params.id!),
      documentTypes(),
    ]);
    return { ...checklist, types };
  },
  { capabilities: [CAPABILITIES.DOCUMENT_VIEW] }
);

export const POST = defineRoute(
  async ({ user, params, req, ip, userAgent, correlationId }) => {
    // Reject on the declared length before reading the body into memory. The
    // per-document-type cap is applied later, against the real bytes; this is
    // only the platform ceiling, so a 500 MB upload costs us a header.
    const declaredLength = Number(req.headers.get('content-length') ?? 0);
    if (declaredLength && declaredLength > env.maxUploadBytes * 1.05) {
      throw tooLarge(
        `That upload is larger than the ${Math.round(env.maxUploadBytes / (1024 * 1024))} MB limit.`
      );
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw badRequest('That upload could not be read. Try again.');
    }

    const file = form.get('file');
    if (!(file instanceof File)) throw badRequest('Choose a document to upload.');

    const bytes = Buffer.from(await file.arrayBuffer());
    const documentTypeId = form.get('documentTypeId');
    const documentTypeCode = form.get('documentTypeCode');
    const expiresOn = form.get('expiresOn');

    return created(
      await uploadDocument(
        user,
        {
          applicationId: params.id!,
          documentTypeId: documentTypeId ? String(documentTypeId) : undefined,
          documentTypeCode: documentTypeCode ? String(documentTypeCode) : undefined,
          remarks: String(form.get('remarks') ?? ''),
          expiresOn: expiresOn ? String(expiresOn) : null,
          file: { name: file.name, type: file.type, bytes },
        },
        { ip, userAgent, correlationId }
      )
    );
  },
  {
    capabilities: [CAPABILITIES.DOCUMENT_UPLOAD],
    // Same ceiling as drawings: generous for a genuine correction cycle, and a
    // firm limit on using the endpoint as free file storage.
    rateLimit: 'upload',
  }
);
