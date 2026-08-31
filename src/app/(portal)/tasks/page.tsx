import type { Metadata } from 'next';
import { ListChecks } from 'lucide-react';
import { requirePageCapability } from '@/server/auth/page-guard';
import { can } from '@/server/auth/context';
import { CAPABILITIES } from '@/lib/constants';
import { listTasks, taskSummary } from '@/server/workflow/tasks';
import { serialize } from '@/server/http/serialize';
import { PageHeader } from '@/components/common/page-header';
import { KpiCard } from '@/components/common/kpi-card';
import { TaskQueue } from '@/features/tasks/task-queue';
import type { TaskListPayload } from '@/features/workflow/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Tasks' };

/**
 * The officer's queue.
 *
 * WORKFLOW_VIEW rather than WORKFLOW_CLAIM_TASK: a supervisor or an auditor may
 * legitimately want to see what is sitting at a desk without being able to
 * claim any of it. Claiming is gated separately, on the button and again at the
 * endpoint.
 *
 * The first page is rendered on the server with its data already in place —
 * the queue is the screen an officer opens first thing in the morning, and a
 * row of spinners is a poor way to start.
 */
export default async function TasksPage() {
  const user = await requirePageCapability(CAPABILITIES.WORKFLOW_VIEW);

  const [tasks, summary] = await Promise.all([listTasks(user, {}), taskSummary(user)]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tasks"
        description="Files waiting at the desks your role works at. Most urgent first, and among equals the one that has waited longest."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="At your desk" value={summary.total} icon={ListChecks} />
        <KpiCard label="Held by you" value={summary.mine} tone="info" />
        <KpiCard
          label="Due soon"
          value={summary.dueSoon}
          tone={summary.dueSoon ? 'warning' : 'neutral'}
        />
        <KpiCard
          label="Overdue"
          value={summary.overdue}
          tone={summary.overdue ? 'danger' : 'neutral'}
          // Passing the date has no legal effect in this system: it notifies
          // and it reports, and nothing else. See docs/07-subsystems.md R.1.1.
          hint="Reported, not enforced"
        />
      </div>

      <TaskQueue
        initial={serialize(tasks) as TaskListPayload}
        currentUserId={user.id}
        canClaim={can(user, CAPABILITIES.WORKFLOW_CLAIM_TASK)}
      />
    </div>
  );
}
