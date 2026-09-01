import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePageCapability } from '@/server/auth/page-guard';
import { CAPABILITIES } from '@/lib/constants';
import { prisma } from '@/server/db/prisma';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/common/empty-state';
import { listSettings } from '@/server/services/settings';
import { SettingsConsole } from '@/features/admin/settings-console';
import { stageName } from '@/lib/workflow';
import { formatMoney } from '@/lib/utils';
import { FileText, Settings2 } from 'lucide-react';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

/**
 * The configuration console.
 *
 * ── Two kinds of thing, deliberately kept apart ──────────────────────────
 *
 * SETTINGS are scalars an administrator may change from this screen, and they
 * take effect immediately. Everything else here — application types, the
 * workflow graph, fee structures, document rules, notification templates,
 * service standards — is STRUCTURE, and it is shown read-only.
 *
 * That is not an omission. Editing a workflow stage or a fee component while
 * applications are mid-flight is how a file ends up at a stage that no longer
 * exists, or a demand ends up quoting a schedule that has been rewritten
 * underneath it. Those objects are versioned for exactly that reason, and the
 * safe way to change them is a new version — which is a piece of work in its
 * own right, not a text box. Showing them here means an administrator can SEE
 * what the system is configured to do without being handed a way to corrupt an
 * application in progress.
 */
export default async function SettingsPage() {
  await requirePageCapability(CAPABILITIES.SETTINGS_MANAGE);

  const [settings, applicationTypes, workflow, feeStructures, documentRules, templates, slaRules] =
    await Promise.all([
      listSettings(),
      prisma.applicationType.findMany({
        where: { deletedAt: null },
        orderBy: { code: 'asc' },
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          numberPrefix: true,
          requiresScrutiny: true,
          isActive: true,
          _count: { select: { applications: true } },
        },
      }),
      prisma.workflow.findFirst({
        where: { isPublished: true },
        orderBy: { version: 'desc' },
        select: {
          code: true,
          name: true,
          version: true,
          publishedAt: true,
          stages: {
            orderBy: { sequence: 'asc' },
            select: {
              id: true,
              code: true,
              name: true,
              type: true,
              sequence: true,
              ownerRoleKeys: true,
              slaDays: true,
              isEntry: true,
              isTerminal: true,
              isActive: true,
              _count: { select: { fromTrans: true } },
            },
          },
          _count: { select: { transitions: true, assignments: true } },
        },
      }),
      prisma.feeStructure.findMany({
        where: { isActive: true },
        orderBy: [{ code: 'asc' }, { version: 'desc' }],
        select: {
          id: true,
          code: true,
          name: true,
          version: true,
          effectiveFrom: true,
          effectiveTo: true,
          roundingRule: true,
          isPlaceholder: true,
          notes: true,
          applicationType: { select: { name: true } },
          components: {
            orderBy: { displayOrder: 'asc' },
            select: { code: true, name: true, basis: true, rate: true, isActive: true },
          },
          _count: { select: { rules: true } },
        },
      }),
      prisma.documentRequirement.findMany({
        where: { isActive: true },
        orderBy: [{ displayOrder: 'asc' }],
        select: {
          id: true,
          isMandatory: true,
          buildingUse: true,
          landUseZone: true,
          stageCode: true,
          documentType: { select: { code: true, name: true, requiresExpiry: true } },
          applicationType: { select: { name: true } },
        },
      }),
      prisma.notificationTemplate.findMany({
        where: { isActive: true },
        orderBy: [{ eventCode: 'asc' }, { channel: 'asc' }],
        select: {
          id: true,
          eventCode: true,
          channel: true,
          subject: true,
          providerTemplateId: true,
        },
      }),
      prisma.slaRule.findMany({
        where: { isActive: true },
        select: {
          id: true,
          days: true,
          calendar: true,
          warnAtPercent: true,
          escalateToRoleKey: true,
          pauseOnShortfall: true,
          stage: { select: { code: true, name: true, sequence: true } },
          applicationType: { select: { name: true } },
        },
      }),
    ]);

  const orderedSla = [...slaRules].sort((a, b) => a.stage.sequence - b.stage.sequence);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Business configuration. Values are editable and take effect immediately; structure — workflow, fee schedules, document rules — is shown as configured and is versioned rather than edited in place."
      />

      <Tabs defaultValue="values">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="values">Values ({settings.total})</TabsTrigger>
          <TabsTrigger value="types">Application types ({applicationTypes.length})</TabsTrigger>
          <TabsTrigger value="workflow">Workflow ({workflow?.stages.length ?? 0})</TabsTrigger>
          <TabsTrigger value="fees">Fees ({feeStructures.length})</TabsTrigger>
          <TabsTrigger value="documents">Documents ({documentRules.length})</TabsTrigger>
          <TabsTrigger value="notifications">Notifications ({templates.length})</TabsTrigger>
          <TabsTrigger value="sla">Service standards ({orderedSla.length})</TabsTrigger>
        </TabsList>

        {/* ── Editable scalars ─────────────────────────────────────────── */}
        <TabsContent value="values">
          <SettingsConsole groups={settings.groups} />
        </TabsContent>

        {/* ── Application types ────────────────────────────────────────── */}
        <TabsContent value="types">
          <Card>
            <CardHeader>
              <CardTitle>Application types</CardTitle>
              <CardDescription>
                The kinds of permission this office issues. The prefix is what makes a layout
                approval readable as LP/2026/000001 at a glance, and it is per type rather than
                fixed in code.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Prefix</TableHead>
                      <TableHead>Scrutiny</TableHead>
                      <TableHead className="text-right">Applications</TableHead>
                      <TableHead>State</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {applicationTypes.map((type) => (
                      <TableRow key={type.id}>
                        <TableCell className="font-mono text-caption">{type.code}</TableCell>
                        <TableCell>
                          <p className="text-small text-text">{type.name}</p>
                          {type.description && (
                            <p className="max-w-[46ch] text-caption text-text-muted">{type.description}</p>
                          )}
                        </TableCell>
                        <TableCell className="font-mono tabular-nums">{type.numberPrefix}</TableCell>
                        <TableCell>
                          <Badge tone={type.requiresScrutiny ? 'info' : 'neutral'}>
                            {type.requiresScrutiny ? 'Required' : 'Skipped'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{type._count.applications}</TableCell>
                        <TableCell>
                          <Badge tone={type.isActive ? 'success' : 'neutral'}>
                            {type.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Workflow ─────────────────────────────────────────────────── */}
        <TabsContent value="workflow">
          {workflow ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  {workflow.name} · v{workflow.version}
                </CardTitle>
                <CardDescription>
                  {workflow.stages.length} stages · {workflow._count.transitions} transitions ·{' '}
                  {workflow._count.assignments} assignment rules. Routing lives entirely in these
                  rows — no stage order or role check is written in code. Changing a published
                  workflow means publishing a NEW version, so applications already in flight keep
                  the graph they started under.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Stage</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Worked by</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                        <TableHead className="text-right">SLA</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workflow.stages.map((stage) => (
                        <TableRow key={stage.id}>
                          <TableCell className="tabular-nums text-text-subtle">{stage.sequence}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-small text-text">{stage.name}</span>
                              {stage.isEntry && <Badge tone="info">Entry</Badge>}
                              {stage.isTerminal && <Badge tone="neutral">Terminal</Badge>}
                              {!stage.isActive && <Badge tone="warning">Inactive</Badge>}
                            </div>
                            <p className="font-mono text-caption text-text-subtle">{stage.code}</p>
                          </TableCell>
                          <TableCell className="text-caption text-text-muted">{stage.type}</TableCell>
                          <TableCell>
                            {Array.isArray(stage.ownerRoleKeys) && stage.ownerRoleKeys.length ? (
                              <div className="flex flex-wrap gap-1">
                                {(stage.ownerRoleKeys as string[]).map((role) => (
                                  <Badge key={role} tone="outline">
                                    {role}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-caption text-text-subtle">Nobody — closed</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{stage._count.fromTrans}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {stage.slaDays ? `${stage.slaDays} d` : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <EmptyState
                  icon={Settings2}
                  title="No workflow is published"
                  description="Applications cannot leave the payment gate until a workflow graph validates and is published. Run the database seed, or publish a version from the workflow configuration."
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Fees ─────────────────────────────────────────────────────── */}
        <TabsContent value="fees">
          <div className="space-y-4">
            {feeStructures.map((structure) => (
              <Card key={structure.id}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    {structure.name} · v{structure.version}
                    {structure.isPlaceholder && <Badge tone="warning">Demo rates</Badge>}
                  </CardTitle>
                  <CardDescription>
                    {structure.applicationType?.name ?? 'Every application type'} · effective from{' '}
                    {structure.effectiveFrom.toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                    {structure.effectiveTo
                      ? ` to ${structure.effectiveTo.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                      : ' with no end date'}{' '}
                    · rounding {structure.roundingRule} · {structure._count.rules} adjustment rules.
                    {structure.isPlaceholder && (
                      <>
                        {' '}
                        <strong className="text-warning">
                          These are placeholder figures, not a statutory schedule.
                        </strong>{' '}
                        Replace them with the department&rsquo;s own rates before this is used to
                        collect money.
                      </>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Component</TableHead>
                          <TableHead>Basis</TableHead>
                          <TableHead className="text-right">Rate</TableHead>
                          <TableHead>State</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {structure.components.map((component) => (
                          <TableRow key={component.code}>
                            <TableCell>
                              <p className="text-small text-text">{component.name}</p>
                              <p className="font-mono text-caption text-text-subtle">{component.code}</p>
                            </TableCell>
                            <TableCell className="text-caption text-text-muted">{component.basis}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {component.rate === null ? '—' : formatMoney(Number(component.rate), { paise: true })}
                            </TableCell>
                            <TableCell>
                              <Badge tone={component.isActive ? 'success' : 'neutral'}>
                                {component.isActive ? 'Active' : 'Inactive'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ))}

            {!feeStructures.length && (
              <Card>
                <CardContent className="p-0">
                  <EmptyState
                    icon={FileText}
                    title="No fee structure is configured"
                    description="Without one, no demand can be raised and no application can pass the payment gate."
                  />
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ── Documents ────────────────────────────────────────────────── */}
        <TabsContent value="documents">
          <Card>
            <CardHeader className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle>Document requirements</CardTitle>
                <CardDescription>
                  Which documents an application must carry, evaluated against its type, building
                  use and land use. An empty axis means &ldquo;any&rdquo;.
                </CardDescription>
              </div>
              <Link href="/admin/document-types" className="text-small text-primary hover:underline">
                Manage document types
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Application type</TableHead>
                      <TableHead>Building use</TableHead>
                      <TableHead>Land use</TableHead>
                      <TableHead>Required</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documentRules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell>
                          <p className="text-small text-text">{rule.documentType.name}</p>
                          <p className="font-mono text-caption text-text-subtle">
                            {rule.documentType.code}
                            {rule.documentType.requiresExpiry ? ' · needs an expiry date' : ''}
                          </p>
                        </TableCell>
                        <TableCell className="text-small text-text-muted">
                          {rule.applicationType?.name ?? 'Any'}
                        </TableCell>
                        <TableCell className="text-small text-text-muted">
                          {rule.buildingUse || 'Any'}
                        </TableCell>
                        <TableCell className="text-small text-text-muted">
                          {rule.landUseZone || 'Any'}
                        </TableCell>
                        <TableCell>
                          <Badge tone={rule.isMandatory ? 'warning' : 'neutral'}>
                            {rule.isMandatory ? 'Mandatory' : 'Optional'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Notifications ────────────────────────────────────────────── */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification templates</CardTitle>
              <CardDescription>
                One template per event, channel and locale. An Indian transactional SMS must quote a
                DLT template id registered with the operator; the SMS adapter refuses to send
                without one rather than making a call that looks successful and delivers nothing.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>DLT id</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templates.map((template) => (
                      <TableRow key={template.id}>
                        <TableCell className="font-mono text-caption">{template.eventCode}</TableCell>
                        <TableCell>
                          <Badge tone={template.channel === 'SMS' ? 'purple' : 'outline'}>
                            {template.channel}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[38ch] truncate text-small text-text-muted">
                          {template.subject || '—'}
                        </TableCell>
                        <TableCell>
                          {template.channel === 'SMS' ? (
                            template.providerTemplateId ? (
                              <span className="font-mono text-caption">{template.providerTemplateId}</span>
                            ) : (
                              <Badge tone="warning">Not registered</Badge>
                            )
                          ) : (
                            <span className="text-caption text-text-subtle">n/a</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Service standards ────────────────────────────────────────── */}
        <TabsContent value="sla">
          <Card>
            <CardHeader>
              <CardTitle>Service standards</CardTitle>
              <CardDescription>
                Target turnaround per desk. Passing a due date NOTIFIES and REPORTS — it never
                approves, rejects or moves an application, and no rule here has any legal effect on
                a permission.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Stage</TableHead>
                      <TableHead>Application type</TableHead>
                      <TableHead className="text-right">Target</TableHead>
                      <TableHead>Calendar</TableHead>
                      <TableHead className="text-right">Warn at</TableHead>
                      <TableHead>Escalates to</TableHead>
                      <TableHead>On shortfall</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderedSla.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell className="text-small text-text">{stageName(rule.stage.code)}</TableCell>
                        <TableCell className="text-small text-text-muted">
                          {rule.applicationType?.name ?? 'Any'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{rule.days} d</TableCell>
                        <TableCell className="text-caption text-text-muted">
                          {rule.calendar === 'WORKING_DAYS' ? 'Working days' : 'Calendar days'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{rule.warnAtPercent}%</TableCell>
                        <TableCell className="text-small text-text-muted">
                          {rule.escalateToRoleKey ?? '—'}
                        </TableCell>
                        <TableCell className="text-caption text-text-muted">
                          {rule.pauseOnShortfall ? 'Clock pauses' : 'Clock keeps running'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
