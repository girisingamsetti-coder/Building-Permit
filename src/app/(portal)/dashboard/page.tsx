import type { Metadata } from 'next';
import Link from 'next/link';
import { FilePlus2, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { requirePageUser } from '@/server/auth/page-guard';
import { prisma } from '@/server/db/prisma';
import { dashboardFor } from '@/lib/rbac-matrix';
import { ROLES, type RoleKey } from '@/lib/constants';
import { PageHeader } from '@/components/common/page-header';
import { getDashboardStats, getRecentApplications } from '@/server/services/applications';
import { consolidatedView, dashboardData, recentActivity } from '@/server/services/analytics';
import { listTasks, taskSummary } from '@/server/workflow/tasks';
import { serialize } from '@/server/http/serialize';
import { LtpDashboard } from '@/features/dashboard/ltp-dashboard';
import type { ApplicationRow } from '@/features/applications/types';
import {
  OfficerDashboard,
  ExecutiveDashboard,
  FinanceDashboard,
  AdminDashboard,
  ViewerDashboard,
  type ExecutiveRole,
  type SystemCounts,
} from '@/features/dashboard/dashboards';

export const metadata: Metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

/**
 * One route, six dashboards, chosen on the SERVER from the user's roles.
 *
 * Deciding here rather than in the client means a role never downloads a
 * dashboard it is not entitled to see, and there is no flash of the wrong one.
 * Every dashboard reads `src/server/services/analytics.ts`, which scopes each
 * query to this user — so the totals differ between roles because the ROWS
 * differ, not because the screens count differently.
 */
export default async function DashboardPage() {
  const user = await requirePageUser();
  const roleKeys = user.roleKeys as RoleKey[];
  const kind = dashboardFor(roleKeys);

  const greeting = `${timeOfDay()}, ${user.name.split(' ')[0]}`;

  // ── The applicant ─────────────────────────────────────────────────────
  if (kind === 'ltp') {
    const [stats, recent, activity] = await Promise.all([
      getDashboardStats(user),
      getRecentApplications(user, 8),
      recentActivity(user, 8),
    ]);

    return (
      <>
        <PageHeader
          title={greeting}
          description="Your applications and anything waiting on you."
          actions={
            <Button asChild variant="primary">
              <Link href="/applications/new">
                <FilePlus2 className="size-4" />
                New application
              </Link>
            </Button>
          }
        />
        <LtpDashboard
          name={user.name}
          counts={stats.counts}
          recent={recent as unknown as ApplicationRow[]}
          activity={activity}
        />
      </>
    );
  }

  // ── The System Administrator ──────────────────────────────────────────
  if (kind === 'admin') {
    const [data, counts, consolidated] = await Promise.all([
      dashboardData(user),
      systemCounts(),
      consolidatedView(user),
    ]);

    return (
      <>
        <PageHeader
          title={greeting}
          description="Every login in one place: what each desk is holding, what is with applicants, who is filing, and the money — plus the system's own configuration."
        />
        <AdminDashboard data={data} counts={counts} consolidated={consolidated} />
      </>
    );
  }

  // ── The senior desks ──────────────────────────────────────────────────
  if (kind === 'executive') {
    const [data, summary] = await Promise.all([dashboardData(user), taskSummary(user)]);

    const role: ExecutiveRole = roleKeys.includes(ROLES.COMMISSIONER)
      ? 'COMMISSIONER'
      : roleKeys.includes(ROLES.ADDL_COMMISSIONER)
        ? 'ADDL_COMMISSIONER'
        : 'DIRECTOR_DP';

    return (
      <>
        <PageHeader
          title={greeting}
          description="What is waiting on you, and how the department is moving."
          actions={
            <Button asChild variant="primary">
              <Link href="/tasks">
                <ListChecks className="size-4" />
                Open the queue
              </Link>
            </Button>
          }
        />
        <ExecutiveDashboard data={data} role={role} queue={summary} />
      </>
    );
  }

  // ── Finance ───────────────────────────────────────────────────────────
  if (kind === 'finance') {
    const data = await dashboardData(user);

    return (
      <>
        <PageHeader title={greeting} description="Demands, collections and reconciliation." />
        <FinanceDashboard data={data} />
      </>
    );
  }

  // ── Oversight ─────────────────────────────────────────────────────────
  if (kind === 'viewer') {
    const data = await dashboardData(user);

    return (
      <>
        <PageHeader
          title={greeting}
          description="Read-only oversight of volume, throughput and collection."
        />
        <ViewerDashboard data={data} />
      </>
    );
  }

  // ── The review desks ──────────────────────────────────────────────────
  const [data, summary, queue] = await Promise.all([
    dashboardData(user),
    taskSummary(user),
    listTasks(user, { sort: 'received', dir: 'asc', pageSize: 6 }),
  ]);

  return (
    <>
      <PageHeader
        title={greeting}
        description="Your task queue and the applications at your stage."
        actions={
          <Button asChild variant="primary">
            <Link href="/tasks">
              <ListChecks className="size-4" />
              Open the queue
            </Link>
          </Button>
        }
      />
      <OfficerDashboard
        summary={summary}
        data={data}
        roleLabel={ROLE_LABELS[roleKeys[0] as RoleKey] ?? 'review'}
        recent={serialize(queue.rows) as Parameters<typeof OfficerDashboard>[0]['recent']}
      />
    </>
  );
}

const ROLE_LABELS: Partial<Record<RoleKey, string>> = {
  TPA: 'Town Planning Assistant',
  ZAD: 'Zonal Assistant Director',
  ZDD: 'Zonal Deputy Director',
  ZJD: 'Zonal Joint Director',
};

/**
 * Configuration and platform counts for the administrator.
 *
 * Genuinely counted rows, every one. `failedJobs` and `unprocessedEvents` in
 * particular are the two figures that tell an administrator the background
 * worker has stopped — which is otherwise invisible until an applicant
 * complains that they were never told about a shortfall.
 */
async function systemCounts(): Promise<SystemCounts> {
  const [
    users,
    activeUsers,
    roles,
    permissions,
    zones,
    offices,
    applicationTypes,
    settings,
    documentTypes,
    auditEvents,
    notificationsSent,
    workflow,
    failedJobs,
    unprocessedEvents,
  ] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
    prisma.role.count({ where: { deletedAt: null } }),
    prisma.permission.count(),
    prisma.zone.count({ where: { deletedAt: null } }),
    prisma.office.count({ where: { deletedAt: null } }),
    prisma.applicationType.count({ where: { deletedAt: null } }),
    prisma.systemSetting.count(),
    prisma.documentType.count({ where: { deletedAt: null } }),
    prisma.auditLog.count(),
    prisma.notificationLog.count({ where: { status: { in: ['SENT', 'DELIVERED'] } } }),
    prisma.workflow.findFirst({
      where: { isPublished: true },
      select: { name: true, code: true, version: true },
      orderBy: { version: 'desc' },
    }),
    prisma.job.count({ where: { status: 'DEAD' } }),
    prisma.outboxEvent.count({ where: { processed: false } }),
  ]);

  return {
    users,
    activeUsers,
    inactiveUsers: users - activeUsers,
    roles,
    permissions,
    zones,
    offices,
    applicationTypes,
    settings,
    documentTypes,
    auditEvents,
    notificationsSent,
    workflowPublished: Boolean(workflow),
    workflowName: workflow ? `${workflow.name} · v${workflow.version}` : 'None published',
    failedJobs,
    unprocessedEvents,
  };
}

function timeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
