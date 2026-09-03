'use client';

import Link from 'next/link';
import {
  FileText,
  AlertTriangle,
  CreditCard,
  ClipboardCheck,
  Clock,
  CheckCircle2,
  CircleX,
  Users,
  Shield,
  Building2,
  Database,
  Layers,
  Banknote,
  Gauge,
  ScrollText,
  Landmark,
} from 'lucide-react';
import {
  Icon3DStack,
  Icon3DActivity,
  Icon3DShieldCheck,
  Icon3DCircleSlash,
  Icon3DAlertOctagon,
  Icon3DHourglass,
  Icon3DTimer,
  Icon3DGauge,
  Icon3DCoins,
  Icon3DLandmark,
  Icon3DCircleDollar,
  Icon3DTrendingUp,
  Icon3DFileEdit,
  Icon3DSparkles,
} from '@/components/ui/icons-3d';
import { KpiCard } from '@/components/common/kpi-card';
import { Badge } from '@/components/ui/badge';
import { statusMeta } from '@/lib/status';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/common/empty-state';
import { formatMoney, formatMoneyCompact } from '@/lib/utils';
import type { ConsolidatedView, DashboardData, ActivityEntry } from '@/server/services/analytics';
import { BarList, DonutChart, ProgressBar, TrendChart, type Slice, type Tone } from './charts';
import { ActivityFeed, Panel, SectionHeading, StatRow, WorkloadTable } from './panels';
import {
  AccountsPanel,
  ApplicantSidePanel,
  DeskConsolidation,
  FilersPanel,
  PipelineStrip,
} from './consolidated';

/**
 * The dashboards.
 *
 * ── Every figure on every one of these is a database count ───────────────
 *
 * There is no constant in this file that a user could mistake for data. The
 * `DashboardData` these components render comes from
 * `src/server/services/analytics.ts`, which is scoped to the signed-in user, so
 * the total an LTP sees counts their own files and the total a Commissioner
 * sees counts the city — and both agree with the register the tile links to,
 * because both are the same query.
 *
 * ── Why the dashboards differ by role ────────────────────────────────────
 *
 * A Commissioner opening a queue of eleven thousand scanned documents learns
 * nothing; a TPA looking at a citywide approval-rate trend learns nothing
 * either. Each audience gets the figures that change what they do next, in the
 * order they would ask for them, and the shared panels keep them recognisably
 * the same product.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Shared pieces
// ═══════════════════════════════════════════════════════════════════════════

/** The status donut, grouped into the vocabulary a person actually uses. */
function statusSlices(data: DashboardData): Slice[] {
  const b = data.applications.byBucket;
  return [
    { key: 'draft', label: 'Draft', value: b.draft ?? 0, tone: 'neutral' },
    {
      key: 'preparing',
      label: 'Preparing (drawings, documents)',
      value:
        (b.scrutinyFailed ?? 0) + (b.scrutinyPassed ?? 0) + (b.documentsPending ?? 0),
      tone: 'purple',
    },
    { key: 'payment', label: 'Awaiting payment', value: b.paymentPending ?? 0, tone: 'warning' },
    { key: 'review', label: 'Under departmental review', value: b.underReview ?? 0, tone: 'info' },
    { key: 'shortfall', label: 'With the applicant (shortfall)', value: b.shortfall ?? 0, tone: 'danger' },
    { key: 'approved', label: 'Approved', value: data.applications.approved, tone: 'success' },
    { key: 'rejected', label: 'Rejected', value: data.applications.rejected, tone: 'danger' },
  ];
}

/** Where the files physically are, desk by desk. */
function stageRows(data: DashboardData) {
  const TONE_BY_STAGE: Record<string, Tone> = {
    LTP_DRAFT: 'neutral',
    LTP_DRAWING: 'neutral',
    LTP_DOCUMENTS: 'neutral',
    LTP_PAYMENT: 'warning',
    LTP_SHORTFALL_ACTION: 'danger',
    TPA_REVIEW: 'info',
    ZAD_ZDD_REVIEW: 'info',
    ZJD_REVIEW: 'info',
    DIRECTOR_DP_REVIEW: 'primary',
    ADDL_COMMISSIONER_REVIEW: 'primary',
    COMMISSIONER_REVIEW: 'primary',
    CLOSED_APPROVED: 'success',
    CLOSED_REJECTED: 'danger',
  };

  return data.applications.byStage.map((s) => ({
    key: s.code,
    label: s.label,
    value: s.count,
    tone: TONE_BY_STAGE[s.code] ?? 'neutral',
  }));
}

const TREND_SERIES = [
  { key: 'created', label: 'Started', tone: 'neutral' as Tone },
  { key: 'submitted', label: 'Filed', tone: 'info' as Tone },
  { key: 'approved', label: 'Approved', tone: 'success' as Tone },
  { key: 'rejected', label: 'Rejected', tone: 'danger' as Tone },
];

/** Fees and payments, in the four figures a reader asks for in order. */
export function MoneyPanels({ data }: { data: DashboardData }) {
  const { finance } = data;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel
        title="Fees and collection"
        action={{ href: '/payments', label: 'Payments register' }}
      >
        <ProgressBar
          value={finance.collected}
          total={finance.generated}
          tone="success"
          label="Collected against demands raised"
          valueLabel={`${formatMoney(finance.collected)} of ${formatMoney(finance.generated)}`}
        />

        <div className="mt-3">
          <StatRow
            label="Demands issued"
            value={finance.demandsIssued}
            hint={finance.shortfallDemands ? `${finance.shortfallDemands} raised by a shortfall` : undefined}
          />
          <StatRow
            label="Outstanding"
            value={formatMoney(finance.outstanding)}
            tone={finance.outstanding > 0 ? 'warning' : 'neutral'}
          />
          <StatRow label="Receipts issued" value={finance.receipts} />
        </div>
      </Panel>

      <Panel title="Payment attempts">
        <div className="flex items-baseline gap-2">
          <span className="text-[26px] font-semibold leading-none tabular-nums text-text">
            {finance.payments.successRate}%
          </span>
          <span className="text-small text-text-muted">settlement success rate</span>
        </div>

        <div className="mt-3">
          <StatRow label="Settled" value={finance.payments.successful} tone="success" />
          <StatRow label="Declined" value={finance.payments.failed} tone={finance.payments.failed ? 'danger' : 'neutral'} />
          <StatRow
            label="In flight"
            value={finance.payments.pending}
            tone={finance.payments.pending ? 'info' : 'neutral'}
          />
          <StatRow
            label="Cancelled or timed out"
            value={finance.payments.cancelled}
          />
        </div>
      </Panel>
    </div>
  );
}

/** Scrutiny and shortfalls, side by side — the two sources of rework. */
export function QualityPanels({ data }: { data: DashboardData }) {
  const { scrutiny, shortfalls } = data;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel title="Automated scrutiny">
        <DonutChart
          totalLabel="Runs"
          slices={[
            { key: 'pass', label: 'Passed', value: scrutiny.passed, tone: 'success' },
            { key: 'fail', label: 'Failed', value: scrutiny.failed, tone: 'danger' },
            { key: 'running', label: 'Queued or running', value: scrutiny.running, tone: 'info' },
            { key: 'errored', label: 'Errored', value: scrutiny.errored, tone: 'warning' },
          ]}
          height={168}
        />

        <div className="mt-3">
          <StatRow
            label="Awaiting a corrected drawing"
            value={scrutiny.awaitingCorrection}
            tone={scrutiny.awaitingCorrection ? 'warning' : 'neutral'}
            href="/applications?bucket=scrutinyFailed"
          />
          <StatRow
            label="Critical findings"
            value={scrutiny.issues.critical}
            tone={scrutiny.issues.critical ? 'danger' : 'neutral'}
          />
          <StatRow label="Major findings" value={scrutiny.issues.major} />
        </div>
      </Panel>

      <Panel
        title="Shortfalls"
        action={{ href: '/shortfalls', label: 'Shortfall register' }}
      >
        <BarList
          emptyLabel="No open shortfalls."
          rows={[
            { key: 'DOCUMENT', label: 'Document', value: shortfalls.byKind.DOCUMENT ?? 0, tone: 'info' },
            { key: 'FEE', label: 'Fee', value: shortfalls.byKind.FEE ?? 0, tone: 'warning' },
            { key: 'TECHNICAL', label: 'Technical', value: shortfalls.byKind.TECHNICAL ?? 0, tone: 'purple' },
            { key: 'CLARIFICATION', label: 'Clarification', value: shortfalls.byKind.CLARIFICATION ?? 0, tone: 'neutral' },
            { key: 'OTHER', label: 'Other', value: shortfalls.byKind.OTHER ?? 0, tone: 'neutral' },
          ]}
        />

        <div className="mt-3">
          <StatRow label="Open" value={shortfalls.open} tone={shortfalls.open ? 'warning' : 'neutral'} />
          <StatRow label="Resolved" value={shortfalls.resolved} tone="success" />
          <StatRow
            label="Blocking / reported"
            value={`${shortfalls.byMode.blocking} / ${shortfalls.byMode.reported}`}
          />
          <StatRow
            label="Awaiting an officer's verdict"
            value={shortfalls.awaitingReview}
            tone={shortfalls.awaitingReview ? 'info' : 'neutral'}
          />
          <StatRow
            label="Pending notification"
            value={shortfalls.neverNotified}
            tone={shortfalls.neverNotified ? 'danger' : 'neutral'}
          />
        </div>
      </Panel>
    </div>
  );
}

/** Fees and payments, automated scrutiny, and shortfalls in a single 4-card row. */
export function OperationsPanels({ data }: { data: DashboardData }) {
  const { finance, scrutiny, shortfalls } = data;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 items-stretch">
      {/* 1. Fees and collection */}
      <Panel
        title="Fees and collection"
        action={{ href: '/payments', label: 'Register' }}
        className="h-full flex flex-col justify-between"
      >
        <div className="flex-1 flex flex-col justify-between space-y-3">
          <ProgressBar
            value={finance.collected}
            total={finance.generated}
            tone="success"
            label="Collected of raised"
            valueLabel={`${formatMoney(finance.collected)}`}
          />

          <div className="space-y-1">
            <StatRow
              label="Demands issued"
              value={finance.demandsIssued}
              hint={finance.shortfallDemands ? `${finance.shortfallDemands} shortfall` : undefined}
            />
            <StatRow
              label="Outstanding"
              value={formatMoney(finance.outstanding)}
              tone={finance.outstanding > 0 ? 'warning' : 'neutral'}
            />
            <StatRow label="Receipts issued" value={finance.receipts} />
          </div>
        </div>
      </Panel>

      {/* 2. Payment attempts */}
      <Panel title="Payment attempts" className="h-full flex flex-col justify-between">
        <div className="flex-1 flex flex-col justify-between space-y-3">
          <div className="flex items-baseline gap-2">
            <span className="text-[26px] font-semibold leading-none tabular-nums text-text">
              {finance.payments.successRate}%
            </span>
            <span className="text-small text-text-muted">settlement rate</span>
          </div>

          <div className="space-y-1">
            <StatRow label="Settled" value={finance.payments.successful} tone="success" />
            <StatRow label="Declined" value={finance.payments.failed} tone={finance.payments.failed ? 'danger' : 'neutral'} />
            <StatRow
              label="In flight"
              value={finance.payments.pending}
              tone={finance.payments.pending ? 'info' : 'neutral'}
            />
            <StatRow
              label="Cancelled"
              value={finance.payments.cancelled}
            />
          </div>
        </div>
      </Panel>

      {/* 3. Automated scrutiny */}
      <Panel title="Automated scrutiny" className="h-full flex flex-col justify-between">
        <div className="flex-1 flex flex-col justify-between space-y-3">
          <DonutChart
            totalLabel="Runs"
            slices={[
              { key: 'pass', label: 'Passed', value: scrutiny.passed, tone: 'success' },
              { key: 'fail', label: 'Failed', value: scrutiny.failed, tone: 'danger' },
              { key: 'running', label: 'Running', value: scrutiny.running, tone: 'info' },
              { key: 'errored', label: 'Errored', value: scrutiny.errored, tone: 'warning' },
            ]}
            height={110}
            className="!flex-col !items-center w-full"
          />

          <div className="space-y-1">
            <StatRow
              label="Correction due"
              value={scrutiny.awaitingCorrection}
              tone={scrutiny.awaitingCorrection ? 'warning' : 'neutral'}
              href="/applications?bucket=scrutinyFailed"
            />
            <StatRow
              label="Critical findings"
              value={scrutiny.issues.critical}
              tone={scrutiny.issues.critical ? 'danger' : 'neutral'}
            />
            <StatRow label="Major findings" value={scrutiny.issues.major} />
          </div>
        </div>
      </Panel>

      {/* 4. Shortfalls */}
      <Panel
        title="Shortfalls"
        action={{ href: '/shortfalls', label: 'Register' }}
        className="h-full flex flex-col justify-between"
      >
        <div className="flex-1 flex flex-col justify-between space-y-3">
          <BarList
            emptyLabel="No open shortfalls."
            rows={[
              { key: 'DOCUMENT', label: 'Document', value: shortfalls.byKind.DOCUMENT ?? 0, tone: 'info' },
              { key: 'FEE', label: 'Fee', value: shortfalls.byKind.FEE ?? 0, tone: 'warning' },
              { key: 'TECHNICAL', label: 'Technical', value: shortfalls.byKind.TECHNICAL ?? 0, tone: 'purple' },
              { key: 'OTHER', label: 'Other', value: (shortfalls.byKind.CLARIFICATION ?? 0) + (shortfalls.byKind.OTHER ?? 0), tone: 'neutral' },
            ]}
          />

          <div className="space-y-1">
            <StatRow label="Open" value={shortfalls.open} tone={shortfalls.open ? 'warning' : 'neutral'} />
            <StatRow label="Resolved" value={shortfalls.resolved} tone="success" />
            <StatRow
              label="Awaiting verdict"
              value={shortfalls.awaitingReview}
              tone={shortfalls.awaitingReview ? 'info' : 'neutral'}
            />
            <StatRow
              label="Unnotified"
              value={shortfalls.neverNotified}
              tone={shortfalls.neverNotified ? 'danger' : 'neutral'}
            />
          </div>
        </div>
      </Panel>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Super Admin — the whole system
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The System Administrator's view: everything, in one place.
 *
 * Administrative visibility, and nothing more. Seeing every application does
 * not confer the power to decide one — approving still requires the workflow
 * to be at the Commissioner's desk and the action to be recorded with an
 * actor, remarks and an audit row, exactly as it does for the Commissioner.
 */
export function UnifiedDashboard({
  data,
  consolidated,
  activity,
  deskSlot,
}: {
  data: DashboardData;
  consolidated: ConsolidatedView;
  activity: ActivityEntry[];
  deskSlot?: React.ReactNode;
}) {
  const { applications, finance, sla, shortfalls } = data;

  return (
    <div className="space-y-3.5">
      {deskSlot}

      <div className="flex flex-col xl:flex-row gap-6">
        <div className="xl:w-3/4 space-y-5">
          <div className="space-y-1.5">
            <SectionHeading title="Applications" />
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Total applications" value={applications.total} icon={Icon3DStack} href="/applications" tone="cyan" />
              <KpiCard
                label="In progress"
                value={applications.inProgress}
                tone="blue"
                icon={Icon3DActivity}
              />
              <KpiCard
                label="Approved"
                value={applications.approved}
                tone="emerald"
                icon={Icon3DShieldCheck}
                href="/applications?bucket=approved"
              />
              <KpiCard
                label="Rejected"
                value={applications.rejected}
                tone="rose"
                icon={Icon3DCircleSlash}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <SectionHeading title="Workflow" />
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                label="Open shortfalls"
                value={shortfalls.open}
                tone="amber"
                hint={shortfalls.overdue ? `${shortfalls.overdue} overdue` : undefined}
                icon={Icon3DAlertOctagon}
                href="/shortfalls"
              />
              <KpiCard
                label="Overdue tasks"
                value={sla.overdue}
                tone="red"
                icon={Icon3DHourglass}
                href="/tasks?filter=overdue"
              />
              <KpiCard
                label="Due soon"
                value={sla.dueSoon}
                tone="orange"
                icon={Icon3DTimer}
                href="/tasks?filter=due-soon"
              />
              <KpiCard
                label="Average time to decide"
                value={sla.averageDaysToClose === null ? '—' : `${sla.averageDaysToClose} d`}
                tone="indigo"
                icon={Icon3DGauge}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <SectionHeading title="Revenue" />
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                label="Fees generated"
                value={formatMoneyCompact(finance.generated)}
                tone="violet"
                icon={Icon3DCoins}
              />
              <KpiCard
                label="Fees collected"
                value={formatMoneyCompact(finance.collected)}
                tone="green"
                icon={Icon3DLandmark}
                href="/payments"
              />
              <KpiCard
                label="Pending fee"
                value={formatMoneyCompact(finance.outstanding)}
                tone="fuchsia"
                icon={Icon3DCircleDollar}
              />
              <KpiCard
                label="Payment success rate"
                value={`${finance.payments.successRate}%`}
                tone="teal"
                icon={Icon3DTrendingUp}
              />
            </div>
          </div>
        </div>

        <div className="xl:w-1/4 relative min-h-[400px] xl:min-h-0">
          <div className="xl:absolute xl:inset-0 w-full h-full">
            <Panel title="Recent Activity" className="h-full flex flex-col" bodyClassName="flex-1 overflow-y-auto pr-2 min-h-0">
              <ActivityFeed entries={activity} />
            </Panel>
          </div>
        </div>
      </div>

      {/* ─── CHARTS & VISUAL ANALYTICS SECTION ─── */}
      <SectionHeading title="Analytics & Visual Overview" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 items-stretch">
        <PipelineStrip
          applicantSide={consolidated.applicantSide}
          desks={consolidated.desks}
          approved={applications.approved}
          rejected={applications.rejected}
        />
        <ApplicantSidePanel applicantSide={consolidated.applicantSide} />
        <Panel
          title="Applications by status"
          action={{ href: '/applications', label: 'Open the register' }}
          className="h-full flex flex-col justify-between"
          bodyClassName="flex flex-col items-center justify-center flex-1"
        >
          <DonutChart
            slices={statusSlices(data)}
            total={applications.total}
            totalLabel="Files"
            height={130}
            className="!flex-col !items-center w-full"
          />
        </Panel>
        <Panel title="Applications by stage" className="h-full">
          <BarList rows={stageRows(data)} emptyLabel="No application has reached a stage yet." />
        </Panel>
      </div>

      <OperationsPanels data={data} />

      {/* ─── TABLES & BREAKDOWN LISTS SECTION ─── */}
      <SectionHeading title="Department Review Desks & Tables" />

      {/* Row 1: Department Desks & LTP Filers */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 items-stretch">
        <DeskConsolidation desks={consolidated.desks} />
        <FilersPanel filers={consolidated.filers} />
      </div>

      {/* Row 2: Officer Workload & User Accounts */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 items-stretch">
        <Panel title="Officer Workload" className="h-full">
          <WorkloadTable rows={data.workload} />
        </Panel>
        <AccountsPanel accounts={consolidated.accounts} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Super Admin — the whole system
// ═══════════════════════════════════════════════════════════════════════════

export function AdminDashboard({
  data,
  consolidated,
  activity,
}: {
  data: DashboardData;
  consolidated: ConsolidatedView;
  activity: ActivityEntry[];
}) {
  return <UnifiedDashboard data={data} consolidated={consolidated} activity={activity} />;
}

// ═══════════════════════════════════════════════════════════════════════════
// Executive — Director, Additional Commissioner, Commissioner
// ═══════════════════════════════════════════════════════════════════════════

export type ExecutiveRole = 'DIRECTOR_DP' | 'ADDL_COMMISSIONER' | 'COMMISSIONER';

const EXECUTIVE_COPY: Record<ExecutiveRole, { desk: string; deskHint: string }> = {
  DIRECTOR_DP: {
    desk: 'At your desk',
    deskHint: 'Files awaiting the Director',
  },
  ADDL_COMMISSIONER: {
    desk: 'At your desk',
    deskHint: 'Files awaiting the Additional Commissioner',
  },
  COMMISSIONER: {
    desk: 'Awaiting your decision',
    deskHint: 'Final approvals pending',
  },
};

export function ExecutiveDashboard({
  data,
  consolidated,
  activity,
  role,
  queue,
}: {
  data: DashboardData;
  consolidated: ConsolidatedView;
  activity: ActivityEntry[];
  role: ExecutiveRole;
  queue: { total: number; mine: number; unclaimed: number; dueSoon: number; overdue: number };
}) {
  const copy = EXECUTIVE_COPY[role];

  const deskSlot = (
    <div className="space-y-1.5">
      <SectionHeading title="Your desk" />
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={copy.desk} value={queue.total} hint={copy.deskHint} icon={Icon3DStack} href="/tasks" tone="blue" />
        <KpiCard
          label="Unclaimed"
          value={queue.unclaimed}
          icon={Icon3DFileEdit}
          href="/tasks?filter=new"
          tone="amber"
        />
        <KpiCard
          label="Held by you"
          value={queue.mine}
          icon={Icon3DActivity}
          href="/tasks?filter=pending"
          tone="indigo"
        />
        <KpiCard
          label="Overdue"
          value={queue.overdue}
          icon={Icon3DHourglass}
          href="/tasks?filter=overdue"
          tone="red"
        />
      </div>
    </div>
  );

  return (
    <UnifiedDashboard
      data={data}
      consolidated={consolidated}
      activity={activity}
      deskSlot={deskSlot}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Officer — TPA, ZAD, ZDD, ZJD
// ═══════════════════════════════════════════════════════════════════════════

export function OfficerDashboard({
  summary,
  data,
  consolidated,
  activity,
  recent,
  roleLabel,
}: {
  summary: { total: number; mine: number; unclaimed: number; dueSoon: number; overdue: number };
  data: DashboardData;
  consolidated: ConsolidatedView;
  activity: ActivityEntry[];
  roleLabel: string;
  recent: Array<{
    id: string;
    applicationId: string;
    applicationNumber: string;
    applicantName: string;
    stageCode: string;
    daysPending: number;
    dueAt: string | null;
    slaStatus: string | null;
    unclaimed: boolean;
  }>;
}) {
  const deskSlot = (
    <div className="space-y-3.5">
      <div className="space-y-1.5">
        <SectionHeading title={`${roleLabel} Desk Queue`} />
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="At your desk" value={summary.total} icon={Icon3DStack} href="/tasks" tone="cyan" />
          <KpiCard
            label="Unclaimed"
            value={summary.unclaimed}
            tone={summary.unclaimed ? 'amber' : 'neutral'}
            icon={Icon3DFileEdit}
            href="/tasks?filter=new"
          />
          <KpiCard label="Held by you" value={summary.mine} tone="indigo" icon={Icon3DActivity} href="/tasks?filter=pending" />
          <KpiCard
            label="Overdue"
            value={summary.overdue}
            tone={summary.overdue ? 'red' : 'neutral'}
            icon={Icon3DHourglass}
            href="/tasks?filter=overdue"
          />
        </div>
      </div>

      {recent.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Waiting longest at your desk</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 p-3">
            {recent.map((task) => (
              <Link
                key={task.id}
                href={`/applications/${task.applicationId}?tab=workflow`}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg px-2.5 py-2 transition-colors hover:bg-surface-sunk"
              >
                <span className="min-w-0">
                  <span className="font-medium tabular-nums text-text">{task.applicationNumber}</span>
                  <span className="ml-2 text-small text-text-muted">{task.applicantName}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-caption">
                  {task.unclaimed && <Badge tone="info">Unclaimed</Badge>}
                  {task.slaStatus && task.slaStatus !== 'ON_TRACK' && (
                    <Badge tone={statusMeta('sla', task.slaStatus).tone}>
                      {statusMeta('sla', task.slaStatus).label}
                    </Badge>
                  )}
                  <span className="tabular-nums text-text-muted">
                    {task.daysPending} {task.daysPending === 1 ? 'day' : 'days'}
                  </span>
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );

  return (
    <UnifiedDashboard
      data={data}
      consolidated={consolidated}
      activity={activity}
      deskSlot={deskSlot}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Finance
// ═══════════════════════════════════════════════════════════════════════════

export function FinanceDashboard({
  data,
  consolidated,
  activity,
}: {
  data: DashboardData;
  consolidated: ConsolidatedView;
  activity: ActivityEntry[];
}) {
  return <UnifiedDashboard data={data} consolidated={consolidated} activity={activity} />;
}

// ═══════════════════════════════════════════════════════════════════════════
// Viewer / auditor
// ═══════════════════════════════════════════════════════════════════════════

export function ViewerDashboard({
  data,
  consolidated,
  activity,
}: {
  data: DashboardData;
  consolidated: ConsolidatedView;
  activity: ActivityEntry[];
}) {
  return <UnifiedDashboard data={data} consolidated={consolidated} activity={activity} />;
}
