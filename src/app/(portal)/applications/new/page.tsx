import type { Metadata } from 'next';
import { requirePageCapability } from '@/server/auth/page-guard';
import { CAPABILITIES } from '@/lib/constants';
import { getApplicationMeta } from '@/server/services/applications';
import { PageHeader } from '@/components/common/page-header';
import { NewApplicationForm } from '@/features/applications/new-application-form';
import type { ApplicationMeta } from '@/features/applications/types';

export const metadata: Metadata = { title: 'New application' };
export const dynamic = 'force-dynamic';

/**
 * Step zero: which permission is being applied for.
 *
 * Creating the application is a POST, not a page load, so a refresh cannot
 * issue a second number from the register.
 */
export default async function NewApplicationPage() {
  await requirePageCapability(CAPABILITIES.APPLICATION_CREATE);

  const meta = await getApplicationMeta();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New application"
        description="Choose what you are applying for. This decides the number series, the drawings required and the fees charged, and cannot be changed later."
      />
      <NewApplicationForm meta={meta as ApplicationMeta} />
    </div>
  );
}
