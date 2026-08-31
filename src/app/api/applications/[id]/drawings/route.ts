import { defineRoute, created } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { badRequest, tooLarge } from '@/server/http/errors';
import { env } from '@/server/config/env';
import { listDrawings, uploadDrawing, drawingCategories } from '@/server/services/drawings';

export const dynamic = 'force-dynamic';

/**
 * Drawings on one application.
 *
 * The POST takes MULTIPART rather than JSON, so it declares no `schema` on the
 * route wrapper and reads the form itself. Everything the wrapper would
 * normally do — session, capability, read-only refusal, rate limit, error
 * envelope — still applies; only body parsing is different, and the file goes
 * through the full validation pipeline in services/files.ts either way.
 */

export const GET = defineRoute(
  async ({ user, params }) => {
    const [drawings, categories] = await Promise.all([
      listDrawings(user, params.id!),
      drawingCategories(),
    ]);
    return { ...drawings, categories, maxUploadBytes: env.maxUploadBytes };
  },
  { capabilities: [CAPABILITIES.DRAWING_VIEW] }
);

export const POST = defineRoute(
  async ({ user, params, req, ip, userAgent, correlationId }) => {
    // Reject on the declared length before reading the body into memory. A
    // 500 MB upload should cost us a header, not 500 MB of buffer.
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
    if (!(file instanceof File)) throw badRequest('Choose a drawing file to upload.');

    const bytes = Buffer.from(await file.arrayBuffer());

    return created(
      await uploadDrawing(
        user,
        {
          applicationId: params.id!,
          category: String(form.get('category') ?? 'OTHER'),
          title: String(form.get('title') ?? ''),
          remarks: String(form.get('remarks') ?? ''),
          // Present when adding a version to an existing sheet; absent when
          // starting a new one.
          drawingId: form.get('drawingId') ? String(form.get('drawingId')) : undefined,
          file: { name: file.name, type: file.type, bytes },
        },
        { ip, userAgent, correlationId }
      )
    );
  },
  {
    capabilities: [CAPABILITIES.DRAWING_UPLOAD],
    // Twenty uploads an hour per user. Generous for genuine correction cycles,
    // and a firm ceiling on using the endpoint as free file storage.
    rateLimit: 'upload',
  }
);
