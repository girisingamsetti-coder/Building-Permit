import { NextResponse } from 'next/server';
import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { downloadDrawingVersion } from '@/server/services/drawings';

export const dynamic = 'force-dynamic';

/**
 * Streams one drawing version back to the caller.
 *
 * The storage key is never exposed and there is no signed public URL — the
 * bytes come through this route, which re-checks capability AND row scope,
 * refuses anything the virus scanner has not cleared, and writes the
 * DRAWING_DOWNLOADED audit row BEFORE returning. "Who read which applicant's
 * drawing, and when" is therefore always answerable.
 *
 * `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`
 * together stop a stored file being rendered in the browser as though this
 * origin served it — which is what would turn an uploaded HTML payload into
 * a same-origin script.
 */
export const GET = defineRoute(
  async ({ user, params, ip, userAgent, correlationId }) => {
    const { bytes, file, versionNo, drawingTitle } = await downloadDrawingVersion(
      user,
      params.id!,
      { ip, userAgent, correlationId }
    );

    const filename = `${slug(drawingTitle)}-V${versionNo}-${file.originalName}`;

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': file.mimeType,
        'Content-Length': String(bytes.byteLength),
        'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
        'X-Content-Type-Options': 'nosniff',
        // A drawing is a private record. No shared cache should hold a copy.
        'Cache-Control': 'private, no-store',
      },
    });
  },
  { capabilities: [CAPABILITIES.DRAWING_DOWNLOAD] }
);

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'drawing';
