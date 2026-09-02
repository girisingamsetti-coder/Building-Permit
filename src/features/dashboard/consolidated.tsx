import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn, formatRelativeTime } from '@/lib/utils';
import type { ConsolidatedView } from '@/server/services/analytics';
import { Panel, StatRow } from './panels';
import { BarList, DonutChart, type Tone } from './charts';

/**
 * THE WHOLE SYSTEM, FROM ONE LOGIN.
 *
 * Seven review dashboards each answer "what is on MY desk". The administrator's
 * question is the union of all of them, and before this existed the only way to
 * answer it was to sign in as seven different officers in turn — which is how
 * that question stops being asked, and how a desk with nobody covering it stays
 * invisible until a file has sat there for three weeks.
 *
 * Every number below is the same query the desk's own dashboard runs, grouped
 * by stage rather than filtered to one. A TPA reading "6 at your desk" and an
 * administrator reading "TPA · 6" are reading ONE number, not two that happen
 * to agree today.
 */

// ═══════════════════════════════════════════════════════════════════════════
// The desks
// ═══════════════════════════════════════════════════════════════════════════

export function DeskConsolidation({ desks }: { desks: ConsolidatedView['desks'] }) {
  const working = desks.filter((d) => {
    // Terminal stages hold closed files and have no queue, so they would only
    // add two rows of dashes to a table about who is holding what.
    if (d.isTerminal) return false;

    const preDepartment = d.roleKeys.length === 1 && d.roleKeys[0] === 'LTP';
    const hasActivity = d.applications > 0 || d.openTasks > 0 || d.openShortfalls > 0;

    return !preDepartment || hasActivity;
  });

  return (
    <Panel
      title="Department Desks Summary"
      action={{ href: '/tasks', label: 'Open queue' }}
      bodyClassName="p-0"
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Desk</TableHead>
              <TableHead>Worked by</TableHead>
              <TableHead className="text-right">Files here</TableHead>
              <TableHead className="text-right">Open tasks</TableHead>
              <TableHead className="text-right">Unclaimed</TableHead>
              <TableHead className="text-right">Due soon</TableHead>
              <TableHead className="text-right">Overdue</TableHead>
              <TableHead className="text-right">Shortfalls</TableHead>
              <TableHead className="text-right">Avg wait</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {working.map((desk) => (
              <TableRow key={desk.stageCode}>
                <TableCell>
                  <Link
                    href={`/applications?stage=${desk.stageCode}`}
                    className="text-small font-medium text-text hover:text-primary hover:underline"
                  >
                    {desk.label}
                  </Link>
                  <p className="font-mono text-caption text-text-subtle">{desk.stageCode}</p>
                </TableCell>

                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    {desk.roleKeys.length ? (
                      desk.roleKeys.map((role) => (
                        <Badge key={role} tone="outline">
                          {role}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-caption text-text-subtle">—</span>
                    )}
                  </div>
                  {desk.roleKeys.length > 0 && desk.officers === 0 ? (
                    <p className="mt-0.5 text-caption text-danger">No active account holds this role</p>
                  ) : (
                    <p className="mt-0.5 text-caption text-text-subtle">
                      {desk.officers} active officer{desk.officers === 1 ? '' : 's'}
                    </p>
                  )}
                </TableCell>

                <TableCell className="text-right tabular-nums font-semibold">{desk.applications}</TableCell>
                <TableCell className="text-right tabular-nums">{desk.openTasks || '—'}</TableCell>

                <TableCell className="text-right tabular-nums">
                  {desk.unclaimed || '—'}
                </TableCell>

                <TableCell className="text-right">
                  {desk.dueSoon ? (
                    <Badge tone="warning">{desk.dueSoon}</Badge>
                  ) : (
                    <span className="tabular-nums text-text-subtle">—</span>
                  )}
                </TableCell>

                <TableCell className="text-right">
                  {desk.overdue ? (
                    <Badge tone="danger">{desk.overdue}</Badge>
                  ) : (
                    <span className="tabular-nums text-text-subtle">—</span>
                  )}
                </TableCell>

                <TableCell className="text-right">
                  {desk.openShortfalls ? (
                    <Badge tone="warning">{desk.openShortfalls}</Badge>
                  ) : (
                    <span className="tabular-nums text-text-subtle">—</span>
                  )}
                </TableCell>

                <TableCell className="text-right tabular-nums text-text-muted">
                  {desk.averageDaysWaiting === null ? '—' : `${desk.averageDaysWaiting}d`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Panel>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// The applicant side
// ═══════════════════════════════════════════════════════════════════════════

export function ApplicantSidePanel({
  applicantSide,
}: {
  applicantSide: ConsolidatedView['applicantSide'];
}) {
  const rows: Array<{ key: string; label: string; value: number; tone: Tone; href: string }> = [
    { key: 'drafts', label: 'Draft — not yet filed', value: applicantSide.drafts, tone: 'neutral', href: '/applications?bucket=draft' },
    { key: 'drawing', label: 'Filed, awaiting a drawing', value: applicantSide.awaitingDrawing, tone: 'neutral', href: '/applications?status=SUBMITTED' },
    { key: 'scrutiny', label: 'In automated scrutiny', value: applicantSide.inScrutiny, tone: 'info', href: '/applications?scrutiny=running' },
    { key: 'failed', label: 'Scrutiny failed — correction due', value: applicantSide.scrutinyFailed, tone: 'danger', href: '/applications?bucket=scrutinyFailed' },
    { key: 'documents', label: 'Documents outstanding', value: applicantSide.documentsPending, tone: 'warning', href: '/applications?bucket=documentsPending' },
    { key: 'payment', label: 'Awaiting payment', value: applicantSide.awaitingPayment, tone: 'warning', href: '/applications?bucket=paymentPending' },
    { key: 'payfail', label: 'Payment declined', value: applicantSide.paymentFailed, tone: 'danger', href: '/applications?payment=failed' },
    { key: 'parked', label: 'Returned on a shortfall', value: applicantSide.withApplicant, tone: 'danger', href: '/applications?shortfall=open' },
    { key: 'responded', label: 'Answered — awaiting an officer', value: applicantSide.responded, tone: 'info', href: '/applications?status=SHORTFALL_RESPONDED' },
  ];

  return (
    <Panel title="Applicant-Side Pipeline">
      <div className="mb-4 flex items-baseline gap-2">
        <span className="text-[26px] font-semibold leading-none tabular-nums text-text">
          {applicantSide.totalWithApplicant.toLocaleString('en-IN')}
        </span>
        <span className="text-small text-text-muted">files waiting on somebody outside the department</span>
      </div>

      <BarList rows={rows} emptyLabel="Nothing is with an applicant." />
    </Panel>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Accounts
// ═══════════════════════════════════════════════════════════════════════════

export function AccountsPanel({ accounts }: { accounts: ConsolidatedView['accounts'] }) {
  return (
    <Panel
      title="User Accounts by Role"
      action={{ href: '/admin/settings/users', label: 'Manage users' }}
      bodyClassName="p-0"
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Accounts</TableHead>
              <TableHead className="text-right">Active</TableHead>
              <TableHead className="text-right">Seen this week</TableHead>
              <TableHead className="text-right">Never signed in</TableHead>
              <TableHead className="text-right">Open files</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.byRole.map((row) => (
              <TableRow key={row.roleKey}>
                <TableCell>
                  <Link
                    href={`/admin/settings/users?role=${row.roleKey}`}
                    className="text-small text-text hover:text-primary hover:underline"
                  >
                    {row.name}
                  </Link>
                  <p className="font-mono text-caption text-text-subtle">{row.roleKey}</p>
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.total}</TableCell>
                <TableCell
                  className={cn(
                    'text-right tabular-nums',
                    row.active === 0 && row.total > 0 && 'text-danger'
                  )}
                >
                  {row.active}
                </TableCell>
                <TableCell className="text-right tabular-nums text-text-muted">
                  {row.signedInLast7Days || '—'}
                </TableCell>
                <TableCell className="text-right">
                  {row.neverSignedIn ? (
                    <Badge tone="warning">{row.neverSignedIn}</Badge>
                  ) : (
                    <span className="tabular-nums text-text-subtle">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.openTasks || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Panel>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Filers
// ═══════════════════════════════════════════════════════════════════════════

export function FilersPanel({ filers }: { filers: ConsolidatedView['filers'] }) {
  if (!filers.length) {
    return (
      <Panel title="Licensed Technical Persons (LTP)">
        <p className="py-6 text-center text-small text-text-subtle">No technical persons registered yet.</p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Licensed Technical Persons (LTP)"
      bodyClassName="p-0"
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Licensed technical person</TableHead>
              <TableHead className="text-right">Files</TableHead>
              <TableHead className="text-right">Drafts</TableHead>
              <TableHead className="text-right">Approved</TableHead>
              <TableHead className="text-right">Rejected</TableHead>
              <TableHead className="text-right">Open shortfalls</TableHead>
              <TableHead className="text-right">Last filed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filers.map((filer) => (
              <TableRow key={filer.userId}>
                <TableCell>
                  <Link
                    href={`/admin/settings/users/${filer.userId}`}
                    className="text-small text-text hover:text-primary hover:underline"
                  >
                    {filer.name}
                  </Link>
                  <p className="truncate text-caption text-text-subtle">
                    {[filer.firmName, filer.licenceNo].filter(Boolean).join(' · ') || '—'}
                  </p>
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">{filer.total}</TableCell>
                <TableCell className="text-right tabular-nums text-text-muted">
                  {filer.drafts || '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums text-success">
                  {filer.approved || '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums text-text-muted">
                  {filer.rejected || '—'}
                </TableCell>
                <TableCell className="text-right">
                  {filer.openShortfalls ? (
                    <Badge tone="warning">{filer.openShortfalls}</Badge>
                  ) : (
                    <span className="tabular-nums text-text-subtle">—</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right text-caption text-text-muted">
                  {filer.lastFiledAt ? formatRelativeTime(filer.lastFiledAt) : 'Never'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Panel>
  );
}

/**
 * The pipeline, end to end, as one strip.
 *
 * The three position figures PARTITION the register: every application is with
 * the applicant, at a departmental desk, or closed — exactly once. That is
 * stated on the panel and the arithmetic is printed, because a summary whose
 * parts do not add up to the whole is the fastest way to lose a reader's trust
 * in every other number on the page.
 *
 * A file parked on a shortfall counts as WITH THE APPLICANT, not at the desk
 * that parked it: the department is not working on it, and counting it as
 * departmental work would overstate the queue and hide the wait.
 */
export function PipelineStrip({
  applicantSide,
  desks,
  approved,
  rejected,
}: {
  applicantSide: ConsolidatedView['applicantSide'];
  desks: ConsolidatedView['desks'];
  approved: number;
  rejected: number;
}) {
  const review = desks.filter((d) => !d.isTerminal && d.roleKeys.some((r) => r !== 'LTP'));

  const withApplicant = applicantSide.totalWithApplicant;
  const inReview = review.reduce((sum, d) => sum + d.applications, 0);
  const closed = approved + rejected;
  const total = withApplicant + inReview + closed;

  return (
    <Panel
      title="The pipeline, end to end"
      className="lg:w-1/4 h-fit"
    >
      <DonutChart
        slices={[
          { key: 'applicant', label: 'With the applicant', value: withApplicant, tone: 'neutral' },
          { key: 'desk', label: 'At a departmental desk', value: inReview, tone: 'info' },
          { key: 'closed', label: 'Closed', value: closed, tone: 'success' },
        ]}
        total={total}
        totalLabel="Total Files"
        className="mt-2 !flex-col !items-center"
      />
    </Panel>
  );
}
