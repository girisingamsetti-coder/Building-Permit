import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePageCapability } from '@/server/auth/page-guard';
import { can, isLtp } from '@/server/auth/context';
import { CAPABILITIES } from '@/lib/constants';
import { getShortfall } from '@/server/shortfalls/queries';
import { isApiError } from '@/server/http/errors';
import { serialize } from '@/server/http/serialize';
import { PageHeader } from '@/components/common/page-header';
import { ShortfallDetailView } from '@/features/shortfalls/shortfall-detail';
import type { ShortfallDetail } from '@/features/shortfalls/types';

export const dynamic = 'force-dynamic';

const load = cache(async (user: Parameters<typeof getShortfall>[0], id: string) => {
  try {
    return await getShortfall(user, id);
  } catch (error) {
    // Out of scope and not there are the same answer, for the same reason as
    // everywhere else: distinguishing them confirms which references exist.
    if (isApiError(error) && (error.status === 404 || error.status === 403)) return null;
    throw error;
  }
});

/**
 * Resolves the title, and decides the 404 HERE rather than in the page body.
 *
 * Next streams the response: once the head has been flushed the status is
 * already on the wire, so a `notFound()` in the body renders the right screen
 * with a 200. See the same note on the application page.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const user = await requirePageCapability(CAPABILITIES.SHORTFALL_VIEW);
  const { id } = await params;
  const shortfall = await load(user, id);

  if (!shortfall) notFound();
  return { title: shortfall.shortfallNumber };
}

export default async function ShortfallPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageCapability(CAPABILITIES.SHORTFALL_VIEW);
  const { id } = await params;

  const shortfall = await load(user, id);
  if (!shortfall) notFound();

  const applicant = isLtp(user);

  return (
    <div className="space-y-5">
      <PageHeader
        title={shortfall.shortfallNumber}
        description={`${shortfall.application.applicationNumber} · ${shortfall.application.type}`}
      />

      <ShortfallDetailView
        initial={serialize(shortfall) as unknown as ShortfallDetail}
        viewerIsApplicant={applicant}
        canRespond={can(user, CAPABILITIES.SHORTFALL_RESPOND)}
        canReview={!applicant && can(user, CAPABILITIES.SHORTFALL_RESOLVE)}
        // Only the officer who raised it, or a supervisor. The server enforces
        // it again; this decides whether the button is worth showing.
        canWithdraw={
          !applicant &&
          (shortfall.raisedByName !== '' || can(user, CAPABILITIES.WORKFLOW_REASSIGN)) &&
          can(user, CAPABILITIES.SHORTFALL_CREATE)
        }
      />
    </div>
  );
}
