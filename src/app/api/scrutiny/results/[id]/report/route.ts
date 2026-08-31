import { NextResponse } from 'next/server';
import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { requireScrutinyResult } from '@/server/services/scrutiny';
import { ensureReport, reportFilename } from '@/server/services/scrutiny-report';
import { storage } from '@/server/storage';
import { audit } from '@/server/services/audit';
import { prisma } from '@/server/db/prisma';

export const dynamic = 'force-dynamic';

/**
 * The scrutiny report.
 *
 * Access is re-checked through the result's APPLICATION — a result id from a
 * client means nothing on its own, and `requireScrutinyResult` merges the
 * caller's row scope into the query, so someone else's report is "not found"
 * rather than 403.
 *
 * The report is generated on first request rather than waited for: the
 * RENDER_SCRUTINY_REPORT job warms it, but an LTP clicking Download the second
 * scrutiny finishes must not be told to come back later because a worker is
 * behind.
 */
export const GET = defineRoute(
  async ({ user, params, ip, userAgent, correlationId }) => {
    const result = await requireScrutinyResult(user, params.id!);
    const report = await ensureReport(result.id);
    const bytes = await storage.get(report.storageKey);

    const version = result.request.drawingVersion;

    // Exporting a report is an authorization-relevant READ (docs Q.1), so it
    // is audited before the bytes leave — same rule as a drawing download.
    await audit(prisma, {
      actor: user,
      action: 'SCRUTINY_REPORT_DOWNLOADED',
      entityType: 'ScrutinyResult',
      entityId: result.id,
      applicationId: version.drawing.applicationId,
      after: {
        outcome: result.outcome,
        versionNo: version.versionNo,
        engineDriver: result.request.engineDriver,
        isDemo: report.isDemo,
      },
      ip,
      userAgent,
      correlationId,
    });

    const filename = reportFilename({
      applicationNumber: version.drawing.application.applicationNumber,
      versionNo: version.versionNo,
    });

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': String(bytes.byteLength),
        // attachment + nosniff: the report is HTML, and it must be saved or
        // opened deliberately rather than rendered as a page of this origin.
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  },
  { capabilities: [CAPABILITIES.SCRUTINY_VIEW] }
);
