import { defineRoute, created } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { badRequest, tooLarge } from '@/server/http/errors';
import { env } from '@/server/config/env';
import { attachToShortfall } from '@/server/shortfalls/actions';

export const dynamic = 'force-dynamic';

/**
 * A file attached to a shortfall response.
 *
 * MULTIPART, so it declares no `schema` and reads the form itself — everything
 * else the wrapper does (session, capability, read-only refusal, error
 * envelope) still applies.
 *
 * The response references the stored file by id; the bytes never travel with
 * the answer itself. That is what keeps an unscanned upload off the record of
 * a decision.
 */
export const POST = defineRoute(
  async ({ user, params, req }) => {
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
    if (!(file instanceof File)) throw badRequest('Choose a file to attach.');

    const stored = await attachToShortfall(user, params.id!, {
      name: file.name,
      type: file.type,
      bytes: Buffer.from(await file.arrayBuffer()),
    });

    return created(stored);
  },
  { capabilities: [CAPABILITIES.SHORTFALL_RESPOND, CAPABILITIES.SHORTFALL_RESOLVE] }
);
