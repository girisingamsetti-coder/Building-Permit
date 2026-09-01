import type { Metadata } from 'next';
import Link from 'next/link';
import { FilePlus2 } from 'lucide-react';
import { requirePageCapability } from '@/server/auth/page-guard';
import { CAPABILITIES } from '@/lib/constants';
import { can } from '@/server/auth/context';
import { getApplicationMeta, listApplications } from '@/server/services/applications';
import { parseListQuery } from '@/lib/schemas/applications';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { ApplicationFilters } from '@/features/applications/application-filters';
import { ApplicationsTable } from '@/features/applications/applications-table';
import type { ApplicationMeta, ListResult } from '@/features/applications/types';

export const metadata: Metadata = { title: 'Applications' };
export const dynamic = 'force-dynamic';

/**
 * The application register.
 *
 * Rendered on the server from the query string, so search, filters, sorting
 * and pagination all happen in the database rather than over an already-
 * fetched page. A filtered view is therefore a URL: shareable, bookmarkable,
 * and correct on a Back navigation.
 *
 * `listApplications` merges the caller's row scope into the query — an LTP's
 * register contains their files and nothing else, and no query parameter can
 * widen that.
 */
export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageCapability(CAPABILITIES.APPLICATION_VIEW);

  // Rebuilt into URLSearchParams so a repeated key (?status=A&status=B) keeps
  // every value — Object.fromEntries would silently keep only the last.
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else if (value !== undefined) params.set(key, value);
  }

  const query = parseListQuery(params);
  const [result, meta] = await Promise.all([listApplications(user, query), getApplicationMeta()]);

  const canCreate = can(user, CAPABILITIES.APPLICATION_CREATE);
  // An LTP's list is all their own work, so naming them in a column is noise.
  const showLtp = can(user, CAPABILITIES.APPLICATION_VIEW_ALL);

  return (
    <>
      <PageHeader
        title="Applications"
        actions={
          canCreate && (
            <Button asChild variant="primary">
              <Link href="/applications/new">
                <FilePlus2 className="size-4" />
                New application
              </Link>
            </Button>
          )
        }
      />

      <div className="space-y-3">
        <ApplicationFilters meta={meta as ApplicationMeta} total={result.total} />
        <ApplicationsTable result={result as unknown as ListResult} showLtp={showLtp} />
      </div>
    </>
  );
}
