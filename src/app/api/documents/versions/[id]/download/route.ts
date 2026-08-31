import { NextResponse } from 'next/server';
import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { readDocumentVersion } from '@/server/services/documents';

export const dynamic = 'force-dynamic';

/**
 * Streams one document version back to the caller.
 *
 * The storage key is never exposed and there is no signed public URL — the
 * bytes come through this route, which re-checks capability AND row scope,
 * refuses anything the virus scanner has not cleared, and writes the
 * DOCUMENT_DOWNLOADED audit row BEFORE returning. "Who read which applicant's
 * sale deed, and when" is therefore always answerable.
 *
 * Superseded versions stay downloadable on purpose. An officer's rejection was
 * a decision about specific bytes, and a decision whose subject has been
 * deleted cannot be reviewed.
 */
export const GET = defineRoute(
  async ({ user, params, ip, userAgent, correlationId }) => {
    const { bytes, file, versionNo, documentName } = await readDocumentVersion(
      user,
      params.id!,
      { ip, userAgent, correlationId },
      'attachment'
    );

    const filename = `${slug(documentName)}-V${versionNo}-${file.originalName}`;

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': file.mimeType,
        'Content-Length': String(bytes.byteLength),
        'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
        // Together these stop a stored file being rendered in the browser as
        // though this origin served it — which is what would turn an uploaded
        // payload into same-origin script.
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  },
  { capabilities: [CAPABILITIES.DOCUMENT_DOWNLOAD] }
);

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'document';
