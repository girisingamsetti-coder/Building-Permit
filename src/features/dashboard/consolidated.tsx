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
      <div className="max-h-[286px] overflow-y-auto overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="h-7 px-2.5 py-1 text-caption">Desk</TableHead>
              <TableHead className="h-7 px-2.5 py-1 text-caption">Worked by</TableHead>
              <TableHead className="h-7 px-2.5 py-1 text-right text-caption">Files</TableHead>
              <TableHead className="h-7 px-2.5 py-1 text-right text-caption">Tasks</TableHead>
              <TableHead className="h-7 px-2.5 py-1 text-right text-caption">Unclaimed</TableHead>
              <TableHead className="h-7 px-2.5 py-1 text-right text-caption">Due soon</TableHead>
              <TableHead className="h-7 px-2.5 py-1 text-right text-caption">Overdue</TableHead>
              <TableHead className="h-7 px-2.5 py-1 text-right text-caption">Shortfalls</TableHead>
              <TableHead className="h-7 px-2.5 py-1 text-right text-caption">Avg wait</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {working.map((desk) => (
              <TableRow key={desk.stageCode} className="hover:bg-primary-subtle/20">
                <TableCell className="px-2.5 py-1 text-caption">
                  <Link
                    href={`/applications?stage=${desk.stageCode}`}
                    className="font-medium text-text hover:text-primary hover:underline"
                  >
                    {desk.label}
                  </Link>
                  <span className="ml-1 font-mono text-[10px] text-text-subtle">({desk.stageCode})</span>
                </TableCell>

                <TableCell className="px-2.5 py-1 text-caption">
                  <div className="flex flex-wrap items-center gap-1">
                    {desk.roleKeys.length ? (
                      desk.roleKeys.map((role) => (
                        <Badge key={role} tone="outline" className="px-1 py-0 text-[10px]">
                          {role}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-caption text-text-subtle">—</span>
                    )}
                    <span className="text-[10px] text-text-subtle">
                      ({desk.officers} {desk.officers === 1 ? 'officer' : 'officers'})
                    </span>
                  </div>
                </TableCell>

                <TableCell className="px-2.5 py-1 text-right tabular-nums text-caption font-semibold">{desk.applications}</TableCell>
                <TableCell className="px-2.5 py-1 text-right tabular-nums text-caption">{desk.openTasks || '—'}</TableCell>
                <TableCell className="px-2.5 py-1 text-right tabular-nums text-caption">{desk.unclaimed || '—'}</TableCell>

                <TableCell className="px-2.5 py-1 text-right text-caption">
                  {desk.dueSoon ? (
                    <Badge tone="warning" className="px-1 py-0 text-[10px]">{desk.dueSoon}</Badge>
                  ) : (
                    <span className="tabular-nums text-text-subtle">—</span>
                  )}
                </TableCell>

                <TableCell className="px-2.5 py-1 text-right text-caption">
                  {desk.overdue ? (
                    <Badge tone="danger" className="px-1 py-0 text-[10px]">{desk.overdue}</Badge>
                  ) : (
                    <span className="tabular-nums text-text-subtle">—</span>
                  )}
                </TableCell>

                <TableCell className="px-2.5 py-1 text-right text-caption">
                  {desk.openShortfalls ? (
                    <Badge tone="warning" className="px-1 py-0 text-[10px]">{desk.openShortfalls}</Badge>
                  ) : (
                    <span className="tabular-nums text-text-subtle">—</span>
                  )}
                </TableCell>

                <TableCell className="px-2.5 py-1 text-right tabular-nums text-caption text-text-muted">
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
      <div className="max-h-[286px] overflow-y-auto overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="h-7 px-2.5 py-1 text-caption">Role</TableHead>
              <TableHead className="h-7 px-2.5 py-1 text-right text-caption">Accounts</TableHead>
              <TableHead className="h-7 px-2.5 py-1 text-right text-caption">Active</TableHead>
              <TableHead className="h-7 px-2.5 py-1 text-right text-caption">Seen this week</TableHead>
              <TableHead className="h-7 px-2.5 py-1 text-right text-caption">Never signed in</TableHead>
              <TableHead className="h-7 px-2.5 py-1 text-right text-caption">Open files</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.byRole.map((row) => (
              <TableRow key={row.roleKey} className="hover:bg-primary-subtle/20">
                <TableCell className="px-2.5 py-1 text-caption">
                  <Link
                    href={`/admin/settings/users?role=${row.roleKey}`}
                    className="text-caption font-medium text-text hover:text-primary hover:underline"
                  >
                    {row.name}
                  </Link>
                  <span className="ml-1.5 font-mono text-[10px] text-text-subtle">({row.roleKey})</span>
                </TableCell>
                <TableCell className="px-2.5 py-1 text-right tabular-nums text-caption">{row.total}</TableCell>
                <TableCell
                  className={cn(
                    'px-2.5 py-1 text-right tabular-nums text-caption',
                    row.active === 0 && row.total > 0 && 'text-danger font-semibold'
                  )}
                >
                  {row.active}
                </TableCell>
                <TableCell className="px-2.5 py-1 text-right tabular-nums text-caption text-text-muted">
                  {row.signedInLast7Days || '—'}
                </TableCell>
                <TableCell className="px-2.5 py-1 text-right text-caption">
                  {row.neverSignedIn ? (
                    <Badge tone="warning" className="px-1 py-0 text-[10px]">{row.neverSignedIn}</Badge>
                  ) : (
                    <span className="tabular-nums text-text-subtle">—</span>
                  )}
                </TableCell>
                <TableCell className="px-2.5 py-1 text-right tabular-nums text-caption font-medium">{row.openTasks || '—'}</TableCell>
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
      <div className="max-h-[286px] overflow-y-auto overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="h-7 px-2.5 py-1 text-caption">Licensed technical person</TableHead>
              <TableHead className="h-7 px-2.5 py-1 text-right text-caption">Files</TableHead>
              <TableHead className="h-7 px-2.5 py-1 text-right text-caption">Drafts</TableHead>
              <TableHead className="h-7 px-2.5 py-1 text-right text-caption">Approved</TableHead>
              <TableHead className="h-7 px-2.5 py-1 text-right text-caption">Rejected</TableHead>
              <TableHead className="h-7 px-2.5 py-1 text-right text-caption">Open shortfalls</TableHead>
              <TableHead className="h-7 px-2.5 py-1 text-right text-caption">Last filed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filers.map((filer) => (
              <TableRow key={filer.userId} className="hover:bg-primary-subtle/20">
                <TableCell className="px-2.5 py-1 text-caption">
                  <Link
                    href={`/admin/settings/users/${filer.userId}`}
                    className="font-medium text-text hover:text-primary hover:underline"
                  >
                    {filer.name}
                  </Link>
                  <span className="ml-1.5 truncate text-[10px] text-text-subtle">
                    {[filer.firmName, filer.licenceNo].filter(Boolean).join(' · ') || '—'}
                  </span>
                </TableCell>
                <TableCell className="px-2.5 py-1 text-right tabular-nums text-caption font-semibold">{filer.total}</TableCell>
                <TableCell className="px-2.5 py-1 text-right tabular-nums text-caption text-text-muted">
                  {filer.drafts || '—'}
                </TableCell>
                <TableCell className="px-2.5 py-1 text-right tabular-nums text-caption text-success font-medium">
                  {filer.approved || '—'}
                </TableCell>
                <TableCell className="px-2.5 py-1 text-right tabular-nums text-caption text-text-muted">
                  {filer.rejected || '—'}
                </TableCell>
                <TableCell className="px-2.5 py-1 text-right text-caption">
                  {filer.openShortfalls ? (
                    <Badge tone="warning" className="px-1 py-0 text-[10px]">{filer.openShortfalls}</Badge>
                  ) : (
                    <span className="tabular-nums text-text-subtle">—</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap px-2.5 py-1 text-right text-[10px] text-text-muted">
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
      className="h-full flex flex-col justify-between"
      bodyClassName="flex flex-col items-center justify-center flex-1"
    >
      <DonutChart
        slices={[
          { key: 'applicant', label: 'With applicant', value: withApplicant, tone: 'neutral' },
          { key: 'desk', label: 'In review desk', value: inReview, tone: 'info' },
          { key: 'closed', label: 'Closed', value: closed, tone: 'success' },
        ]}
        total={total}
        totalLabel="Total"
        className="!flex-col !items-center w-full"
        height={130}
        showEmptyInLegend
      />
    </Panel>
  );
}
