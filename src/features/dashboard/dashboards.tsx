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
import { KpiCard } from '@/components/common/kpi-card';
import { Badge } from '@/components/ui/badge';
import { statusMeta } from '@/lib/status';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { EmptyState } from '@/components/common/empty-state';
import { formatMoney, formatMoneyCompact } from '@/lib/utils';
import type { ConsolidatedView, DashboardData } from '@/server/services/analytics';
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
function MoneyPanels({ data }: { data: DashboardData }) {
  const { finance } = data;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel
        title="Fees and collection"
        description="Demands raised against these applications, and what has actually been received."
        action={{ href: '/payments', label: 'Payments register' }}
      >
        <ProgressBar
          value={finance.collected}
          total={finance.generated}
          tone="success"
          label="Collected against demands raised"
          valueLabel={`${formatMoney(finance.collected)} of ${formatMoney(finance.generated)}`}
        />

        <div className="mt-4">
          <StatRow
            label="Demands issued"
            value={finance.demandsIssued}
            hint={finance.shortfallDemands ? `${finance.shortfallDemands} raised by a shortfall` : undefined}
          />
          <StatRow
            label="Outstanding"
            value={formatMoney(finance.outstanding)}
            tone={finance.outstanding > 0 ? 'warning' : 'neutral'}
            hint="Still owed on live demands"
          />
          <StatRow label="Receipts issued" value={finance.receipts} />
        </div>
      </Panel>

      <Panel
        title="Payment attempts"
        description="Every attempt against every demand, including the ones that did not settle."
      >
        <div className="flex items-baseline gap-2">
          <span className="text-[26px] font-semibold leading-none tabular-nums text-text">
            {finance.payments.successRate}%
          </span>
          <span className="text-small text-text-muted">of decided attempts settled</span>
        </div>

        <div className="mt-4">
          <StatRow label="Settled" value={finance.payments.successful} tone="success" />
          <StatRow label="Declined" value={finance.payments.failed} tone={finance.payments.failed ? 'danger' : 'neutral'} />
          <StatRow
            label="In flight"
            value={finance.payments.pending}
            tone={finance.payments.pending ? 'info' : 'neutral'}
            hint="Handed to the gateway, no verdict yet"
          />
          <StatRow
            label="Cancelled or timed out"
            value={finance.payments.cancelled}
            hint="Excluded from the rate above only while undecided"
          />
        </div>
      </Panel>
    </div>
  );
}

/** Scrutiny and shortfalls, side by side — the two sources of rework. */
function QualityPanels({ data }: { data: DashboardData }) {
  const { scrutiny, shortfalls } = data;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel
        title="Automated scrutiny"
        description="Drawing checks run by the scrutiny engine, and what they found."
      >
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

        <div className="mt-4">
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
        description="What the department has asked applicants for, and whether it has come back."
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

        <div className="mt-4">
          <StatRow label="Open" value={shortfalls.open} tone={shortfalls.open ? 'warning' : 'neutral'} />
          <StatRow label="Resolved" value={shortfalls.resolved} tone="success" />
          <StatRow
            label="Blocking / reported"
            value={`${shortfalls.byMode.blocking} / ${shortfalls.byMode.reported}`}
            hint="A reported shortfall travels with the file and still blocks approval"
          />
          <StatRow
            label="Awaiting an officer's verdict"
            value={shortfalls.awaitingReview}
            tone={shortfalls.awaitingReview ? 'info' : 'neutral'}
          />
          <StatRow
            label="Raised but never announced"
            value={shortfalls.neverNotified}
            tone={shortfalls.neverNotified ? 'danger' : 'neutral'}
            hint="From the applicant's side this is indistinguishable from silence"
          />
        </div>
      </Panel>
    </div>
  );
}

/** Where the shortfalls were raised — pendency by desk, for a supervisor. */
function ShortfallsByStage({ data }: { data: DashboardData }) {
  return (
    <Panel
      title="Open shortfalls by desk"
      description="Which stage asked for something that has not yet come back."
    >
      <BarList
        emptyLabel="Nothing outstanding at any desk."
        rows={data.shortfalls.byStage.map((s) => ({
          key: s.code,
          label: s.label,
          value: s.count,
          tone: 'warning' as Tone,
        }))}
      />
    </Panel>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Super Admin — the whole system
// ═══════════════════════════════════════════════════════════════════════════

export type SystemCounts = {
  users: number;
  activeUsers: number;
  inactiveUsers: number;
  roles: number;
  permissions: number;
  zones: number;
  offices: number;
  applicationTypes: number;
  settings: number;
  documentTypes: number;
  auditEvents: number;
  notificationsSent: number;
  workflowPublished: boolean;
  workflowName: string;
  failedJobs: number;
  unprocessedEvents: number;
};

/**
 * The System Administrator's view: everything, in one place.
 *
 * Administrative visibility, and nothing more. Seeing every application does
 * not confer the power to decide one — approving still requires the workflow
 * to be at the Commissioner's desk and the action to be recorded with an
 * actor, remarks and an audit row, exactly as it does for the Commissioner.
 */
export function AdminDashboard({
  data,
  counts,
  consolidated,
}: {
  data: DashboardData;
  counts: SystemCounts;
  /** What every other role would see, gathered for the one login that sees all. */
  consolidated: ConsolidatedView;
}) {
  const { applications, finance, sla, shortfalls } = data;

  return (
    <div className="space-y-6">
      <SectionHeading title="Caseload" hint="Every application in the system." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total applications" value={applications.total} icon={FileText} href="/applications" />
        <KpiCard
          label="In progress"
          value={applications.inProgress}
          tone="info"
          hint="Filed and not yet closed"
          icon={Clock}
        />
        <KpiCard
          label="Approved"
          value={applications.approved}
          tone={applications.approved ? 'success' : 'neutral'}
          icon={CheckCircle2}
          href="/applications?bucket=approved"
        />
        <KpiCard
          label="Rejected"
          value={applications.rejected}
          tone={applications.rejected ? 'danger' : 'neutral'}
          icon={CircleX}
        />
      </div>

      <SectionHeading title="Attention" hint="What is stuck, late or unanswered." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Open shortfalls"
          value={shortfalls.open}
          tone={shortfalls.open ? 'warning' : 'neutral'}
          hint={shortfalls.overdue ? `${shortfalls.overdue} past their due date` : 'Nothing overdue'}
          icon={AlertTriangle}
          href="/shortfalls"
        />
        <KpiCard
          label="Overdue tasks"
          value={sla.overdue}
          tone={sla.overdue ? 'danger' : 'neutral'}
          hint="Reported, never enforced"
          icon={Gauge}
          href="/tasks?filter=overdue"
        />
        <KpiCard
          label="Due soon"
          value={sla.dueSoon}
          tone={sla.dueSoon ? 'warning' : 'neutral'}
          icon={Clock}
          href="/tasks?filter=due-soon"
        />
        <KpiCard
          label="Average time to decide"
          value={sla.averageDaysToClose === null ? '—' : `${sla.averageDaysToClose} d`}
          hint="Filing to decision, closed files only"
          icon={Gauge}
        />
      </div>

      <SectionHeading title="Money" hint="Demands raised and money received." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Fees generated"
          value={formatMoneyCompact(finance.generated)}
          hint={formatMoney(finance.generated)}
          icon={Banknote}
        />
        <KpiCard
          label="Fees collected"
          value={formatMoneyCompact(finance.collected)}
          tone="success"
          hint={`${finance.receipts} receipts issued`}
          icon={CreditCard}
          href="/payments"
        />
        <KpiCard
          label="Pending fee"
          value={formatMoneyCompact(finance.outstanding)}
          tone={finance.outstanding > 0 ? 'warning' : 'neutral'}
          hint="Outstanding on live demands"
          icon={Banknote}
        />
        <KpiCard
          label="Payment success rate"
          value={`${finance.payments.successRate}%`}
          hint={`${finance.payments.successful} settled · ${finance.payments.failed} declined`}
          icon={CreditCard}
        />
      </div>

      <SectionHeading
        title="Every login, consolidated"
        hint="What each role sees on their own dashboard, gathered here."
      />

      <PipelineStrip
        applicantSide={consolidated.applicantSide}
        desks={consolidated.desks}
        approved={applications.approved}
        rejected={applications.rejected}
      />

      <DeskConsolidation desks={consolidated.desks} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ApplicantSidePanel applicantSide={consolidated.applicantSide} />
        <Panel title="Workload" description="Who is holding open files, and what nobody has picked up.">
          <WorkloadTable rows={data.workload} />
        </Panel>
      </div>

      <AccountsPanel accounts={consolidated.accounts} />
      <FilersPanel filers={consolidated.filers} />

      <SectionHeading title="Analysis" hint="Volume, throughput, money and quality." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Applications by status"
          description="Grouped into the vocabulary the register filters by."
          action={{ href: '/applications', label: 'Open the register' }}
        >
          <DonutChart slices={statusSlices(data)} total={applications.total} totalLabel="Files" />
        </Panel>

        <Panel
          title="Where the files are"
          description="The desk each application is currently sitting at."
        >
          <BarList rows={stageRows(data)} emptyLabel="No application has reached a stage yet." />
        </Panel>
      </div>

      <Panel
        title="Volume over time"
        description="Applications started, filed and decided, by month."
      >
        <TrendChart data={data.trend} series={TREND_SERIES} />
      </Panel>

      <MoneyPanels data={data} />
      <QualityPanels data={data} />

      <ShortfallsByStage data={data} />

      <SectionHeading title="Configuration and platform" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Users"
          value={counts.users}
          hint={`${counts.activeUsers} active · ${counts.inactiveUsers} not active`}
          href="/admin/users"
          icon={Users}
        />
        <KpiCard
          label="Roles & permissions"
          value={`${counts.roles} / ${counts.permissions}`}
          href="/admin/roles"
          icon={Shield}
        />
        <KpiCard
          label="Zones & offices"
          value={`${counts.zones} / ${counts.offices}`}
          href="/admin/organisation"
          icon={Building2}
        />
        <KpiCard
          label="Settings"
          value={counts.settings}
          href="/admin/settings"
          icon={Database}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="System health" description="What the platform is doing behind the screens.">
          <StatRow
            label="Workflow"
            value={counts.workflowPublished ? 'Published' : 'Not published'}
            tone={counts.workflowPublished ? 'success' : 'danger'}
            hint={counts.workflowName}
          />
          <StatRow
            label="Failed background jobs"
            value={counts.failedJobs}
            tone={counts.failedJobs ? 'danger' : 'neutral'}
            hint="Dead-lettered after exhausting their retries"
          />
          <StatRow
            label="Unprocessed outbox events"
            value={counts.unprocessedEvents}
            tone={counts.unprocessedEvents > 20 ? 'warning' : 'neutral'}
            hint="Written inside a transaction, dispatched by the worker"
          />
          <StatRow label="Notifications sent" value={counts.notificationsSent} />
          <StatRow
            label="Audit events recorded"
            value={counts.auditEvents}
            hint="Append-only and hash-chained"
          />
          <StatRow label="Document types configured" value={counts.documentTypes} href="/admin/document-types" />
          <StatRow label="Application types" value={counts.applicationTypes} href="/admin/settings" />
        </Panel>

        <Panel
          title="Recent activity"
          description="The latest entries from every application's timeline."
        >
          <ActivityFeed entries={data.activity} />
        </Panel>
      </div>
    </div>
  );
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

/**
 * The senior desks.
 *
 * They share a shape because they ask the same question — what is waiting on
 * me, and how is the department doing — and differ only in the wording of the
 * first tile and in which stage counts as "mine".
 */
export function ExecutiveDashboard({
  data,
  role,
  queue,
}: {
  data: DashboardData;
  role: ExecutiveRole;
  queue: { total: number; mine: number; unclaimed: number; dueSoon: number; overdue: number };
}) {
  const { applications, sla, shortfalls, finance } = data;
  const copy = EXECUTIVE_COPY[role];

  return (
    <div className="space-y-6">
      <SectionHeading title="Your desk" hint="What is waiting on a decision from you." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={copy.desk} value={queue.total} hint={copy.deskHint} icon={ClipboardCheck} href="/tasks" />
        <KpiCard
          label="Unclaimed"
          value={queue.unclaimed}
          tone={queue.unclaimed ? 'info' : 'neutral'}
          hint="Nobody has opened these yet"
          icon={ClipboardCheck}
          href="/tasks?filter=new"
        />
        <KpiCard
          label="Held by you"
          value={queue.mine}
          icon={Clock}
          href="/tasks?filter=pending"
        />
        <KpiCard
          label="Overdue"
          value={queue.overdue}
          tone={queue.overdue ? 'danger' : 'neutral'}
          hint="Reported, never enforced"
          icon={AlertTriangle}
          href="/tasks?filter=overdue"
        />
      </div>

      <SectionHeading title="The department" hint="Volume, throughput and where files are held." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total applications" value={applications.total} icon={FileText} href="/applications" />
        <KpiCard label="In progress" value={applications.inProgress} tone="info" icon={Clock} />
        <KpiCard
          label="Approved"
          value={applications.approved}
          tone={applications.approved ? 'success' : 'neutral'}
          icon={CheckCircle2}
          href="/applications?bucket=approved"
        />
        <KpiCard
          label="Average time to decide"
          value={sla.averageDaysToClose === null ? '—' : `${sla.averageDaysToClose} d`}
          hint="Filing to decision"
          icon={Gauge}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Applications by status"
          action={{ href: '/applications', label: 'Open the register' }}
        >
          <DonutChart slices={statusSlices(data)} total={applications.total} totalLabel="Files" />
        </Panel>

        <Panel title="Stage-wise pendency" description="Where applications are currently held.">
          <BarList rows={stageRows(data)} emptyLabel="No application is in the pipeline." />
        </Panel>
      </div>

      <Panel title="Approvals over time" description="Started, filed and decided, by month.">
        <TrendChart data={data.trend} series={TREND_SERIES} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Reported shortfalls" description="Raised at a lower desk and travelling with the file.">
          <StatRow
            label="Open — reported"
            value={shortfalls.byMode.reported}
            tone={shortfalls.byMode.reported ? 'warning' : 'neutral'}
            hint="Blocks approval exactly as a blocking shortfall does"
          />
          <StatRow
            label="Open — blocking"
            value={shortfalls.byMode.blocking}
            tone={shortfalls.byMode.blocking ? 'warning' : 'neutral'}
            hint="The file is parked with the applicant"
          />
          <StatRow label="Resolved" value={shortfalls.resolved} tone="success" />
          <StatRow
            label="Past their due date"
            value={shortfalls.overdue}
            tone={shortfalls.overdue ? 'danger' : 'neutral'}
          />
          <div className="pt-3">
            <BarList
              emptyLabel="Nothing outstanding at any desk."
              rows={shortfalls.byStage.map((s) => ({
                key: s.code,
                label: s.label,
                value: s.count,
                tone: 'warning' as Tone,
              }))}
            />
          </div>
        </Panel>

        <Panel title="Collection" description="Demands raised against these applications, and receipts.">
          <ProgressBar
            value={finance.collected}
            total={finance.generated}
            tone="success"
            label="Collected against demands raised"
            valueLabel={`${formatMoney(finance.collected)} of ${formatMoney(finance.generated)}`}
          />
          <div className="mt-4">
            <StatRow label="Demands issued" value={finance.demandsIssued} />
            <StatRow
              label="Outstanding"
              value={formatMoney(finance.outstanding)}
              tone={finance.outstanding > 0 ? 'warning' : 'neutral'}
            />
            <StatRow label="Payment success rate" value={`${finance.payments.successRate}%`} />
          </div>
        </Panel>
      </div>

      <Panel title="Recent activity" description="The latest entries from the files you can see.">
        <ActivityFeed entries={data.activity} />
      </Panel>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Officer — TPA, ZAD, ZDD, ZJD
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The officer's dashboard.
 *
 * Every figure is scoped the same way the queue at /tasks is, so a tile
 * reading 7 and a list showing 5 rows is not a state this can produce.
 */
export function OfficerDashboard({
  summary,
  data,
  recent,
  roleLabel,
}: {
  summary: { total: number; mine: number; unclaimed: number; dueSoon: number; overdue: number };
  data: DashboardData;
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
  const { shortfalls, finance, applications } = data;

  return (
    <div className="space-y-6">
      <SectionHeading title="Your queue" hint={`Files at the ${roleLabel} desk, within your jurisdiction.`} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="At your desk" value={summary.total} icon={ClipboardCheck} href="/tasks" />
        <KpiCard
          label="Unclaimed"
          value={summary.unclaimed}
          tone={summary.unclaimed ? 'info' : 'neutral'}
          hint="In the shared inbox"
          icon={ClipboardCheck}
          href="/tasks?filter=new"
        />
        <KpiCard label="Held by you" value={summary.mine} icon={Clock} href="/tasks?filter=pending" />
        <KpiCard
          label="Overdue"
          value={summary.overdue}
          tone={summary.overdue ? 'danger' : 'neutral'}
          hint="Reported, not enforced"
          icon={AlertTriangle}
          href="/tasks?filter=overdue"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Waiting longest</CardTitle>
            <CardDescription>
              The files at your desk that have been there longest. The full queue, with its
              filters, is on the Tasks page.
            </CardDescription>
          </CardHeader>
          <CardContent className={recent.length ? 'space-y-1 p-3' : 'p-0'}>
            {recent.length ? (
              recent.map((task) => (
                <Link
                  key={task.id}
                  href={`/applications/${task.applicationId}?tab=workflow`}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded px-2 py-2 hover:bg-surface-sunk"
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
              ))
            ) : (
              <EmptyState
                icon={ClipboardCheck}
                title="Nothing at your desk"
                description="Files arrive here when they reach a stage your role works at."
              />
            )}
          </CardContent>
        </Card>

        <Panel title="Shortfalls" action={{ href: '/shortfalls', label: 'Register' }}>
          <StatRow
            label="Open"
            value={shortfalls.open}
            tone={shortfalls.open ? 'warning' : 'neutral'}
          />
          <StatRow
            label="Awaiting your verdict"
            value={shortfalls.awaitingReview}
            tone={shortfalls.awaitingReview ? 'info' : 'neutral'}
            hint="The applicant has answered"
          />
          <StatRow label="Document" value={shortfalls.byKind.DOCUMENT ?? 0} />
          <StatRow label="Fee" value={shortfalls.byKind.FEE ?? 0} />
          <StatRow
            label="Past due"
            value={shortfalls.overdue}
            tone={shortfalls.overdue ? 'danger' : 'neutral'}
          />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Applications in your jurisdiction" description="Everything you can see, by stage.">
          <BarList rows={stageRows(data)} emptyLabel="Nothing in your jurisdiction yet." />
          <div className="mt-4">
            <StatRow label="Total visible" value={applications.total} href="/applications" />
            <StatRow label="Approved" value={applications.approved} tone="success" />
            <StatRow
              label="Fee outstanding"
              value={formatMoney(finance.outstanding)}
              tone={finance.outstanding > 0 ? 'warning' : 'neutral'}
            />
          </div>
        </Panel>

        <Panel title="Recent activity" description="The latest movements on files you can see.">
          <ActivityFeed entries={data.activity} />
        </Panel>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Finance
// ═══════════════════════════════════════════════════════════════════════════

export function FinanceDashboard({ data }: { data: DashboardData }) {
  const { finance, applications } = data;

  const demandSlices: Slice[] = [
    { key: 'PAID', label: 'Paid', value: finance.byDemandStatus.PAID ?? 0, tone: 'success' },
    { key: 'ISSUED', label: 'Issued, unpaid', value: finance.byDemandStatus.ISSUED ?? 0, tone: 'warning' },
    {
      key: 'PARTIALLY_PAID',
      label: 'Partly paid',
      value: finance.byDemandStatus.PARTIALLY_PAID ?? 0,
      tone: 'info',
    },
    { key: 'DRAFT', label: 'Draft', value: finance.byDemandStatus.DRAFT ?? 0, tone: 'neutral' },
    { key: 'CANCELLED', label: 'Cancelled', value: finance.byDemandStatus.CANCELLED ?? 0, tone: 'neutral' },
    { key: 'WAIVED', label: 'Waived', value: finance.byDemandStatus.WAIVED ?? 0, tone: 'purple' },
  ];

  return (
    <div className="space-y-6">
      <SectionHeading title="Collection" hint="Demands raised, money received, money owed." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Demands issued"
          value={finance.demandsIssued}
          hint={finance.shortfallDemands ? `${finance.shortfallDemands} from shortfalls` : undefined}
          icon={ScrollText}
        />
        <KpiCard
          label="Total generated"
          value={formatMoneyCompact(finance.generated)}
          hint={formatMoney(finance.generated)}
          icon={Banknote}
        />
        <KpiCard
          label="Collected"
          value={formatMoneyCompact(finance.collected)}
          tone="success"
          hint={`${finance.receipts} receipts`}
          icon={CreditCard}
          href="/payments"
        />
        <KpiCard
          label="Outstanding"
          value={formatMoneyCompact(finance.outstanding)}
          tone={finance.outstanding > 0 ? 'warning' : 'neutral'}
          icon={Landmark}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Demands by status" description="Every demand raised against a live application.">
          <DonutChart slices={demandSlices} totalLabel="Demands" />
        </Panel>

        <Panel
          title="Payment attempts"
          description="Including the ones that did not settle — a register that shows only successes is not a register."
          action={{ href: '/payments', label: 'Payments register' }}
        >
          <DonutChart
            totalLabel="Attempts"
            slices={[
              { key: 'ok', label: 'Settled', value: finance.payments.successful, tone: 'success' },
              { key: 'fail', label: 'Declined', value: finance.payments.failed, tone: 'danger' },
              { key: 'open', label: 'In flight', value: finance.payments.pending, tone: 'info' },
              {
                key: 'gone',
                label: 'Cancelled or timed out',
                value: finance.payments.cancelled,
                tone: 'neutral',
              },
            ]}
            height={168}
          />
          <div className="mt-4">
            <StatRow
              label="Success rate"
              value={`${finance.payments.successRate}%`}
              hint="Of attempts that reached a verdict"
            />
            <StatRow
              label="Awaiting reconciliation"
              value={finance.payments.pending}
              tone={finance.payments.pending ? 'info' : 'neutral'}
              hint="Verified server-side by the sweep, never trusted from the browser"
            />
          </div>
        </Panel>
      </div>

      <Panel title="Volume over time" description="Applications started, filed and decided, by month.">
        <TrendChart data={data.trend} series={TREND_SERIES} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Fee shortfalls" description="Money asked for after the original demand.">
          <StatRow
            label="Open fee shortfalls"
            value={data.shortfalls.byKind.FEE ?? 0}
            tone={(data.shortfalls.byKind.FEE ?? 0) ? 'warning' : 'neutral'}
          />
          <StatRow label="Supplementary demands raised" value={finance.shortfallDemands} />
          <StatRow label="Applications approved" value={applications.approved} tone="success" />
          <StatRow
            label="Applications awaiting payment"
            value={applications.byBucket.paymentPending ?? 0}
            tone={(applications.byBucket.paymentPending ?? 0) ? 'warning' : 'neutral'}
            href="/applications?bucket=paymentPending"
          />
        </Panel>

        <Panel title="Recent activity" description="The latest movements across the register.">
          <ActivityFeed entries={data.activity} />
        </Panel>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Viewer / auditor
// ═══════════════════════════════════════════════════════════════════════════

/** Read-only oversight: the same figures, none of the action links. */
export function ViewerDashboard({ data }: { data: DashboardData }) {
  const { applications, sla, shortfalls, finance } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total applications" value={applications.total} icon={FileText} href="/applications" />
        <KpiCard label="In progress" value={applications.inProgress} tone="info" icon={Clock} />
        <KpiCard label="Approved" value={applications.approved} tone="success" icon={CheckCircle2} />
        <KpiCard
          label="Open shortfalls"
          value={shortfalls.open}
          tone={shortfalls.open ? 'warning' : 'neutral'}
          icon={AlertTriangle}
        />
        <KpiCard label="Fees collected" value={formatMoneyCompact(finance.collected)} icon={CreditCard} />
        <KpiCard
          label="Overdue tasks"
          value={sla.overdue}
          tone={sla.overdue ? 'danger' : 'neutral'}
          icon={Gauge}
        />
        <KpiCard
          label="Average time to decide"
          value={sla.averageDaysToClose === null ? '—' : `${sla.averageDaysToClose} d`}
          icon={Gauge}
        />
        <KpiCard label="Application types" value={applications.byType.length} icon={Layers} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Applications by status">
          <DonutChart slices={statusSlices(data)} total={applications.total} totalLabel="Files" />
        </Panel>
        <Panel title="Where the files are">
          <BarList rows={stageRows(data)} emptyLabel="Nothing in the pipeline." />
        </Panel>
      </div>

      <Panel title="Volume over time">
        <TrendChart data={data.trend} series={TREND_SERIES} />
      </Panel>

      <QualityPanels data={data} />

      <Panel title="Recent activity">
        <ActivityFeed entries={data.activity} />
      </Panel>
    </div>
  );
}

export { MoneyPanels, QualityPanels };
