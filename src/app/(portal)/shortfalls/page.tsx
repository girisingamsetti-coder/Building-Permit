import type { Metadata } from 'next';
import { AlertTriangle } from 'lucide-react';
import { requirePageCapability } from '@/server/auth/page-guard';
import { isLtp } from '@/server/auth/context';
import { CAPABILITIES } from '@/lib/constants';
import { listShortfalls, shortfallSummary } from '@/server/shortfalls/queries';
import { serialize } from '@/server/http/serialize';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard } from '@/components/common/kpi-card';
import { ShortfallRegister } from '@/features/shortfalls/shortfall-register';
import { SHORTFALL_FILTERS } from '@/lib/shortfalls';
import type { ShortfallListPayload } from '@/features/shortfalls/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Shortfalls' };

/**
 * The shortfall register.
 *
 * Opens on OPEN rather than on everything: a settled shortfall is history, and
 * the question somebody comes to this page with is "what is outstanding".
 */
export default async function ShortfallsPage() {
  const user = await requirePageCapability(CAPABILITIES.SHORTFALL_VIEW);
  const applicant = isLtp(user);

  const [list, summary] = await Promise.all([
    listShortfalls(user, { filter: SHORTFALL_FILTERS.OPEN }),
    shortfallSummary(user),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Shortfalls"
        description={
          applicant
            ? 'Everything the department has asked you for, across your applications.'
            : 'Everything asked of applicants in your jurisdiction, and what has come back.'
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Open" value={summary.open} icon={AlertTriangle} />
        <KpiCard
          label={applicant ? 'Waiting on you' : 'With the applicant'}
          value={summary.awaitingApplicant}
          tone={applicant && summary.awaitingApplicant ? 'warning' : 'neutral'}
        />
        <KpiCard
          label={applicant ? 'With the department' : 'Waiting on you'}
          value={summary.awaitingOfficer}
          tone={!applicant && summary.awaitingOfficer ? 'warning' : 'info'}
        />
        <KpiCard
          label="Overdue"
          value={summary.overdue}
          tone={summary.overdue ? 'danger' : 'neutral'}
          hint="Past the date the applicant was given"
        />
      </div>

      <ShortfallRegister
        initial={serialize({ ...list, summary }) as unknown as ShortfallListPayload}
      />
    </div>
  );
}
