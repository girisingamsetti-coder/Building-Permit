import type { Metadata } from 'next';
import { requirePageCapability } from '@/server/auth/page-guard';
import { CAPABILITIES } from '@/lib/constants';
import { can, isLtp } from '@/server/auth/context';
import { prisma } from '@/server/db/prisma';
import { parseDocumentListQuery } from '@/lib/schemas/documents';
import { documentRegisterStats, listDocumentRegister } from '@/server/services/documents';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard } from '@/components/common/kpi-card';
import {
  DocumentRegister,
  type RegisterMeta,
  type RegisterRow,
} from '@/features/documents/document-register';

export const metadata: Metadata = { title: 'Documents' };
export const dynamic = 'force-dynamic';

/**
 * The document register.
 *
 * The Documents TAB answers "what does this application still need". This page
 * answers the officer's question instead — "what is waiting for me across
 * every file I am responsible for" — which is why a verification desk is a
 * queue rather than a tour of applications one at a time.
 *
 * Rendered on the server from the query string, so search, filters, sorting
 * and pagination all happen in the database. `listDocumentRegister` merges the
 * caller's row scope into the query: an LTP sees their own documents, a zonal
 * officer sees their jurisdiction, and no query parameter widens either.
 */
export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageCapability(CAPABILITIES.DOCUMENT_VIEW);

  // Rebuilt into URLSearchParams so a repeated key (?status=A&status=B) keeps
  // every value — Object.fromEntries would silently keep only the last.
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else if (value !== undefined) params.set(key, value);
  }

  const query = parseDocumentListQuery(params);

  const [result, stats, documentTypes, applicationTypes, zones] = await Promise.all([
    listDocumentRegister(user, query),
    documentRegisterStats(user),
    prisma.documentType.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.applicationType.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.zone.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    }),
  ]);

  // An LTP's register is all their own work, so a zone column is noise.
  const showZone = !isLtp(user);
  const canVerify = can(user, CAPABILITIES.DOCUMENT_VERIFY);

  const meta: RegisterMeta = { documentTypes, applicationTypes, zones, showZone };

  return (
    <>
      <PageHeader title="Documents" />

      <div className="mb-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Documents" value={stats.total} href="/documents" />
        <KpiCard
          label={canVerify ? 'Awaiting your decision' : 'Awaiting a decision'}
          value={stats.pending}
          href="/documents?bucket=pending"
          tone={stats.pending > 0 ? 'warning' : 'neutral'}
        />
        <KpiCard
          label="Rejected"
          value={stats.rejected}
          href="/documents?bucket=rejected"
          tone={stats.rejected > 0 ? 'danger' : 'neutral'}
        />
        <KpiCard
          label={`Expiring in ${stats.expiringWithinDays} days`}
          value={stats.expiring}
          href="/documents?bucket=expiring"
          tone={stats.expiring > 0 ? 'warning' : 'neutral'}
        />
      </div>

      <DocumentRegister
        rows={result.data as unknown as RegisterRow[]}
        meta={meta}
        total={result.total}
        page={result.page}
        totalPages={result.totalPages}
      />
    </>
  );
}
