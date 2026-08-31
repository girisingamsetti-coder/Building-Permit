import { NextResponse } from 'next/server';
import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { readDocumentVersion } from '@/server/services/documents';

export const dynamic = 'force-dynamic';

/**
 * The same bytes, served INLINE so they can be read without downloading.
 *
 * ── Why this is a separate route rather than a query parameter ─────────
 *
 * Serving a file inline means serving it from THIS origin, and an uploaded
 * file is attacker-controlled content. The difference between a download and a
 * preview is therefore a security boundary, not a display preference, and it
 * gets its own route with its own headers so that neither can be turned into
 * the other by a stray parameter.
 *
 * Three things make it safe, and all three are needed:
 *
 *   · the type allow-list — PDF and raster images only, checked against the
 *     SNIFFED MIME recorded at upload, never the declared one. Neither can
 *     carry script the way an HTML or SVG upload could.
 *   · `X-Content-Type-Options: nosniff` — the browser must not second-guess
 *     the type and decide to render something else.
 *   · `Content-Security-Policy: sandbox` — even if a PDF viewer were coaxed
 *     into running something, it does so with no origin of its own: no
 *     same-origin storage, no cookies, no scripts.
 *
 * The preview is audited exactly as a download is. Reading an applicant's
 * document is reading it, whether or not a file landed on the officer's disk.
 */
export const GET = defineRoute(
  async ({ user, params, ip, userAgent, correlationId }) => {
    const { bytes, file, versionNo, documentName } = await readDocumentVersion(
      user,
      params.id!,
      { ip, userAgent, correlationId },
      'inline'
    );

    const filename = `${slug(documentName)}-V${versionNo}`;

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': file.mimeType,
        'Content-Length': String(bytes.byteLength),
        'Content-Disposition': `inline; filename="${filename.replace(/"/g, '')}"`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "sandbox; default-src 'none'; object-src 'self'; img-src 'self'",
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
