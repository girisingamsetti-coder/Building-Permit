import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requirePageCapability } from '@/server/auth/page-guard';
import { CAPABILITIES } from '@/lib/constants';
import { getApplicationMeta, getWizardState } from '@/server/services/applications';
import { isApiError } from '@/server/http/errors';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { ApplicationWizard } from '@/features/applications/wizard/wizard';
import type { ApplicationMeta, WizardState } from '@/features/applications/types';

export const dynamic = 'force-dynamic';

/**
 * Resolves the wizard state once per request, classifying the two ways it can
 * legitimately be unavailable.
 *
 * `redirect()` and `notFound()` both work by throwing, so neither is called
 * from inside the catch — the classification happens here and the control flow
 * happens at the call site.
 */
type EditOutcome =
  | { kind: 'ok'; state: Awaited<ReturnType<typeof getWizardState>> }
  /** Exists, but has been filed and is no longer editable. */
  | { kind: 'filed' }
  /** Not theirs, or not there. Deliberately the same answer for both. */
  | { kind: 'missing' };

const loadEditable = cache(
  async (
    user: Parameters<typeof getWizardState>[0],
    id: string
  ): Promise<EditOutcome> => {
    try {
      return { kind: 'ok', state: await getWizardState(user, id) };
    } catch (error) {
      if (isApiError(error) && error.status === 403) return { kind: 'filed' };
      if (isApiError(error) && error.status === 404) return { kind: 'missing' };
      throw error;
    }
  }
);

/**
 * Decides the outcome BEFORE the document head is flushed.
 *
 * Same reason as the detail page: once Next has streamed the head, the status
 * line is on the wire, and a later `redirect()` degrades to a `<meta refresh>`
 * (a visible delay) while a later `notFound()` renders the right page with a
 * 200. Deciding in `generateMetadata` yields a real 307 and a real 404. The
 * `cache()` above means the page body reuses this result rather than re-querying.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const user = await requirePageCapability(CAPABILITIES.APPLICATION_EDIT);
  const { id } = await params;
  const outcome = await loadEditable(user, id);

  if (outcome.kind === 'missing') notFound();
  // Someone clicked "Continue" on a file that has since been filed. Showing
  // them the application is the useful answer, not an error.
  if (outcome.kind === 'filed') redirect(`/applications/${id}`);

  return { title: `Continue ${outcome.state.application.applicationNumber}` };
}

/**
 * Resuming the filing wizard.
 *
 * The whole state is fetched on the SERVER and handed to the wizard as its
 * initial props, so a resumed draft renders complete on first paint rather
 * than flashing an empty form while a client fetch runs.
 */
export default async function EditApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePageCapability(CAPABILITIES.APPLICATION_EDIT);
  const { id } = await params;

  // generateMetadata has already resolved both failure cases; these repeat it
  // to narrow the type, and as the backstop if metadata is ever skipped.
  const outcome = await loadEditable(user, id);
  if (outcome.kind === 'missing') notFound();
  if (outcome.kind === 'filed') redirect(`/applications/${id}`);

  const state = outcome.state;
  const meta = await getApplicationMeta();
  const { application } = state;

  return (
    <>
      <PageHeader
        title={application.applicationNumber}
        description={`${application.applicationType?.name ?? 'Application'} — draft. Nothing is filed until you submit it.`}
        actions={
          <Button asChild variant="ghost">
            <Link href="/applications">
              <ArrowLeft className="size-4" />
              All applications
            </Link>
          </Button>
        }
      />

      <ApplicationWizard
        initial={state as unknown as WizardState}
        meta={meta as ApplicationMeta}
      />
    </>
  );
}
