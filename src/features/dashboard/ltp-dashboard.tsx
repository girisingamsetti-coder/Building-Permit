'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRight } from 'lucide-react';
import {
  Icon3DStack,
  Icon3DFileEdit,
  Icon3DCircleSlash,
  Icon3DShieldCheck,
  Icon3DActivity,
  Icon3DAlertOctagon,
  Icon3DCircleDollar,
} from '@/components/ui/icons-3d';
import { KpiCard } from '@/components/common/kpi-card';
import { DataTable } from '@/components/common/data-table';
import { EmptyState } from '@/components/common/empty-state';
import { StatusBadge } from '@/components/common/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { BUCKETS, type BucketKey } from '@/lib/application-buckets';
import { primaryActionFor } from '@/lib/application-actions';
import { stageLabel } from '@/lib/status';
import { formatRelativeTime } from '@/lib/utils';
import type { ApplicationRow } from '@/features/applications/types';
import type { ActivityEntry } from '@/server/services/analytics';
import { ActivityFeed, Panel } from './panels';

/**
 * The LTP dashboard with 3D icons.
 */
const ICONS: Record<BucketKey, React.ComponentType<{ className?: string }>> = {
  total: Icon3DStack,
  draft: Icon3DFileEdit,
  scrutinyFailed: Icon3DCircleSlash,
  scrutinyPassed: Icon3DShieldCheck,
  documentsPending: Icon3DStack,
  paymentPending: Icon3DCircleDollar,
  underReview: Icon3DActivity,
  shortfall: Icon3DAlertOctagon,
  approved: Icon3DShieldCheck,
};

export function LtpDashboard({
  name: _name,
  counts,
  recent,
  activity,
}: {
  name: string;
  counts: Record<string, number>;
  recent: ApplicationRow[];
  activity: ActivityEntry[];
}) {
  const router = useRouter();

  const columns = React.useMemo<ColumnDef<ApplicationRow, unknown>[]>(
    () => [
      {
        id: 'applicationNumber',
        header: 'Application',
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link
              href={`/applications/${row.original.id}`}
              className="whitespace-nowrap font-medium tabular-nums text-text hover:text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {row.original.applicationNumber}
            </Link>
            <p className="truncate text-caption text-text-muted">
              {row.original.applicationType?.name ?? '—'}
            </p>
          </div>
        ),
      },
      {
        id: 'applicant',
        header: 'Applicant',
        cell: ({ row }) =>
          row.original.applicant?.name ? (
            <span className="text-small text-text">{row.original.applicant.name}</span>
          ) : (
            <span className="text-small italic text-text-subtle">Not entered yet</span>
          ),
      },
      {
        id: 'property',
        header: 'Property',
        cell: ({ row }) =>
          row.original.propertyLabel ? (
            <p
              className="max-w-[20ch] truncate text-small text-text-muted"
              title={row.original.propertyLabel}
            >
              {row.original.propertyLabel}
            </p>
          ) : (
            <span className="text-small italic text-text-subtle">Not entered yet</span>
          ),
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <StatusBadge kind="application" status={row.original.status} />
            {row.original.openShortfalls > 0 && (
              <Badge tone="warning">{row.original.openShortfalls}</Badge>
            )}
          </div>
        ),
      },
      {
        id: 'stage',
        header: 'Current stage',
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-small text-text-muted">
            {stageLabel(row.original.status, row.original.currentStageCode)}
          </span>
        ),
      },
      {
        id: 'updatedAt',
        header: 'Last updated',
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-small text-text-muted">
            {formatRelativeTime(row.original.updatedAt)}
          </span>
        ),
      },
      {
        id: 'sla',
        header: 'SLA',
        cell: ({ row }) =>
          row.original.slaDueAt ? (
            <StatusBadge kind="sla" status={row.original.slaStatus} />
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help whitespace-nowrap text-small text-text-subtle">
                  Not started
                </span>
              </TooltipTrigger>
              <TooltipContent>
                SLA tracking begins once reaching departmental review.
              </TooltipContent>
            </Tooltip>
          ),
      },
      {
        id: 'action',
        header: 'Action',
        cell: ({ row }) => {
          const action = primaryActionFor(row.original);
          return (
            <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
              <Button asChild size="sm" variant={action.key === 'view' ? 'secondary' : 'primary'}>
                <Link href={action.href}>{action.label}</Link>
              </Button>
            </div>
          );
        },
      },
    ],
    []
  );

  const nothingYet = (counts.total ?? 0) === 0;

  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {BUCKETS.map((bucket) => {
          const value = counts[bucket.key] ?? 0;
          return (
            <KpiCard
              key={bucket.key}
              label={bucket.label}
              value={value}
              hint={bucket.hint}
              tone={value > 0 ? bucket.tone : 'neutral'}
              icon={ICONS[bucket.key]}
              // Every tile opens the list it counted.
              href={
                bucket.key === 'total' ? '/applications' : `/applications?bucket=${bucket.key}`
              }
            />
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
          <CardTitle className="text-small font-bold text-text">Recent applications</CardTitle>
          <Button asChild size="sm" variant="ghost" className="h-8 text-caption">
            <Link href="/applications">
              View all
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </CardHeader>

        <CardContent className="p-0">
          {nothingYet ? (
            <EmptyState
              icon={FilePlus2}
              title="No applications filed yet"
              description={`Start your first application to begin the permission workflow.`}
              action={
                <Button asChild variant="primary">
                  <Link href="/applications/new">
                    <FilePlus2 className="size-4" />
                    New application
                  </Link>
                </Button>
              }
            />
          ) : (
            <DataTable
              columns={columns}
              data={recent}
              onRowClick={(row) => router.push(`/applications/${row.id}`)}
              className="rounded-none border-0"
              emptyTitle="Nothing recent"
            />
          )}
        </CardContent>
      </Card>

      {!nothingYet && (
        <Panel title="Recent Activity" className="!-mt-3.5 bg-gradient-to-b from-blue-50/50 to-transparent border-blue-100 shadow-inner">
          <ActivityFeed
            entries={activity}
            emptyMessage="No activity recorded yet."
          />
        </Panel>
      )}
    </div>
  );
}

