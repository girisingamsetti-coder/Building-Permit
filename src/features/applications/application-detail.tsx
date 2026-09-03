'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Lock,
  Pencil,
  Trash2,
  Clock,
  CircleCheck,
  ArrowRight,
  UploadCloud,
  FileText,
  Layers,
  History,
  AlertTriangle,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { StatusBadge } from '@/components/common/status-badge';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { toast } from '@/components/ui/toast';
import { stageLabel } from '@/lib/status';
import { isShortfallOpen } from '@/lib/shortfalls';
import { WIZARD_STEPS } from '@/lib/application-steps';
import { cn } from '@/lib/utils';
import { api, ApiCallError } from './api';
import { visibleTabs, isTabKey, type TabDef } from './application-tabs';
import { ApplicationTimeline } from './application-timeline';
import { AuditPanel, type AuditRow } from './audit-panel';
import { DrawingsTab } from '@/features/drawings/drawings-tab';
import { ScrutinyTab } from '@/features/scrutiny/scrutiny-tab';
import { DocumentsTab } from '@/features/documents/documents-tab';
import { FeesTab } from '@/features/fees/fees-tab';
import { PaymentsTab } from '@/features/payments/payments-tab';
import { WorkflowTab } from '@/features/workflow/workflow-tab';
import { ShortfallPanel } from '@/features/workflow/shortfall-panel';
import { ShortfallBanner } from '@/features/shortfalls/shortfall-banner';
import type { ShortfallRow } from '@/features/shortfalls/types';
import type { DrawingsPayload, ScrutinyPayload } from '@/features/drawings/types';
import type { DocumentsPayload } from '@/features/documents/types';
import type { FeesPayload } from '@/features/fees/types';
import type { PaymentsPayload } from '@/features/payments/types';
import type {
  HistoryEntry,
  Shortfall,
  WorkflowState,
} from '@/features/workflow/types';
import { WorkflowStepperHeader } from '@/components/common/workflow-stepper-header';
import type { ApplicationDetail as Detail, ApplicationMeta, TimelineEvent } from './types';

/**
 * The application page — the one screen an LTP returns to.
 *
 * The active tab lives in the URL (`?tab=drawings`), so a link to the drawings
 * of a particular file is a link somebody can send. It also means the row
 * actions elsewhere in the product can deep-link straight to the tab their
 * label implies.
 */
export function ApplicationDetailView({
  application,
  timeline,
  meta,
  capabilities,
  canEdit,
  canDelete,
  drawings,
  scrutiny,
  documents,
  fees,
  payments,
  canUploadDrawing,
  canRequestScrutiny,
  canUploadDocument,
  canVerifyDocument,
  canGenerateFee,
  canInitiatePayment,
  workflow,
  history,
  shortfalls,
  canClaimTask,
  currentUserId,
  audit,
  openShortfalls,
  viewerIsApplicant,
}: {
  application: Detail;
  timeline: TimelineEvent[];
  meta: ApplicationMeta;
  capabilities: string[];
  canEdit: boolean;
  canDelete: boolean;
  drawings: DrawingsPayload;
  scrutiny: ScrutinyPayload;
  /** Null when the caller holds no DOCUMENT_VIEW — the tab is hidden anyway. */
  documents: DocumentsPayload | null;
  /** Null when the caller holds no FEE_VIEW. */
  fees: FeesPayload | null;
  /** Null when the caller holds no PAYMENT_VIEW. */
  payments: PaymentsPayload | null;
  canUploadDrawing: boolean;
  canRequestScrutiny: boolean;
  canUploadDocument: boolean;
  canVerifyDocument: boolean;
  canGenerateFee: boolean;
  canInitiatePayment: boolean;
  /** Null when the caller holds no WORKFLOW_VIEW — the tab is hidden anyway. */
  workflow: WorkflowState | null;
  history: HistoryEntry[];
  /** Null when the caller holds no SHORTFALL_VIEW. */
  shortfalls: Shortfall[] | null;
  canClaimTask: boolean;
  currentUserId: string;
  /** Null when the caller holds no AUDIT_VIEW — the tab is hidden anyway. */
  audit: AuditRow[] | null;
  /** Open shortfalls, for the banner that sits above every tab. */
  openShortfalls: ShortfallRow[];
  viewerIsApplicant: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabs = React.useMemo(() => visibleTabs(capabilities), [capabilities]);

  const requested = searchParams.get('tab') ?? '';
  // An unavailable tab in the URL falls back to Overview rather than showing a
  // blank panel — deep links outlive the phases that made them valid.
  const active =
    isTabKey(requested) && tabs.some((t) => t.key === requested && t.available)
      ? requested
      : 'overview';

  const isDraft = application.status === 'DRAFT';

  function setTab(key: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (key === 'overview') next.delete('tab');
    else next.set('tab', key);
    router.replace(`${pathname}${next.toString() ? `?${next}` : ''}`, { scroll: false });
  }

  return (
    <div className="space-y-5">
      <Header
        application={application}
        isDraft={isDraft}
        canEdit={canEdit}
        canDelete={canDelete}
        workflow={workflow}
        onDeleted={() => {
          toast.success('Draft deleted', { description: application.applicationNumber });
          router.push('/applications');
          router.refresh();
        }}
      />

      {/*
        Above the tabs, on every tab. An open shortfall is the one fact that
        decides what happens to this file next, and it must not be something a
        reader has to go looking for.
      */}
      <ShortfallBanner shortfalls={openShortfalls} viewerIsApplicant={viewerIsApplicant} />

      {/* Visual Workflow Progress Tracker & SLA Metadata Bar */}
      <WorkflowStepperHeader application={application} workflow={workflow} />

      <Tabs value={active} onValueChange={setTab}>
        <TabsList className="overflow-x-auto p-1.5 rounded-xl bg-surface-sunk/70 border border-border/80 gap-1.5 shadow-xs">
          {tabs.map((tab) =>
            tab.available ? (
              <TabsTrigger
                key={tab.key}
                value={tab.key}
                className="gap-2 px-3.5 py-2 text-caption sm:text-small font-medium text-text-muted rounded-lg transition-all data-[state=active]:bg-surface data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 data-[state=active]:shadow-sm data-[state=active]:font-semibold"
              >
                {tab.key === 'overview' && <FileText className="size-3.5" />}
                {tab.key === 'workflow' && <Clock className="size-3.5" />}
                {tab.key === 'drawings' && <UploadCloud className="size-3.5" />}
                {tab.key === 'documents' && <Layers className="size-3.5" />}
                {tab.key === 'fees' && <FileText className="size-3.5" />}
                {tab.key === 'payments' && <FileText className="size-3.5" />}
                {tab.key === 'shortfalls' && <AlertTriangle className="size-3.5" />}
                {tab.key === 'audit' && <History className="size-3.5" />}
                <span>{tab.label}</span>
              </TabsTrigger>
            ) : (
              <Tooltip key={tab.key}>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <TabsTrigger
                      value={tab.key}
                      disabled
                      className="cursor-not-allowed gap-1.5 opacity-50 px-3 py-1.5 text-caption"
                    >
                      {tab.label}
                      <Lock className="size-3" aria-hidden />
                    </TabsTrigger>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <span className="font-medium">{tab.phase}</span> — {tab.description}
                </TooltipContent>
              </Tooltip>
            )
          )}
        </TabsList>

        <TabsContent value="overview">
          <Overview application={application} timeline={timeline} isDraft={isDraft} canEdit={canEdit} />
        </TabsContent>

        <TabsContent value="details">
          <Details application={application} meta={meta} />
        </TabsContent>

        <TabsContent value="drawings">
          <DrawingsTab
            initial={drawings}
            canUpload={canUploadDrawing}
            canRequestScrutiny={canRequestScrutiny}
          />
        </TabsContent>

        <TabsContent value="scrutiny">
          <ScrutinyTab initial={scrutiny} canRequest={canRequestScrutiny} />
        </TabsContent>

        <TabsContent value="documents">
          {documents && (
            <DocumentsTab
              initial={documents}
              canUpload={canUploadDocument}
              canVerify={canVerifyDocument}
            />
          )}
        </TabsContent>

        <TabsContent value="fees">
          {fees && <FeesTab initial={fees} canGenerate={canGenerateFee} />}
        </TabsContent>

        <TabsContent value="payments">
          {payments && <PaymentsTab initial={payments} canInitiate={canInitiatePayment} />}
        </TabsContent>

        <TabsContent value="workflow">
          {workflow && (
            <WorkflowTab
              applicationId={application.id}
              initialState={workflow}
              initialHistory={history}
              initialShortfalls={shortfalls ?? []}
              canClaim={canClaimTask}
              currentUserId={currentUserId}
            />
          )}
        </TabsContent>

        <TabsContent value="shortfalls">
          {shortfalls &&
            (shortfalls.length ? (
              <ShortfallPanel
                shortfalls={shortfalls}
                openCount={shortfalls.filter((s) => isShortfallOpen(s.status)).length}
              />
            ) : (
              <EmptyState
                icon={CircleCheck}
                title="Nothing has been asked for"
                description="If an officer needs a document, a correction or a further payment, it appears here with your response."
              />
            ))}
        </TabsContent>

        <TabsContent value="audit">{audit && <AuditPanel rows={audit} />}</TabsContent>

        {/*
          Panels for the tabs that do not exist yet. They are unreachable while
          the trigger is disabled, and they are here so that enabling a tab is
          a one-line change in application-tabs.ts plus a component swap.
        */}
        {tabs
          .filter((tab) => !tab.available)
          .map((tab) => (
            <TabsContent key={tab.key} value={tab.key}>
              <ComingSoon tab={tab} />
            </TabsContent>
          ))}
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Header
// ═══════════════════════════════════════════════════════════════════════════

function Header({
  application,
  isDraft,
  canEdit,
  canDelete,
  onDeleted,
  workflow,
}: {
  application: Detail;
  isDraft: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onDeleted: () => void;
  /** Null until the file reaches the department. */
  workflow?: WorkflowState | null;
}) {
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function remove() {
    setBusy(true);
    try {
      await api.delete(`/api/applications/${application.id}`);
      setConfirming(false);
      onDeleted();
    } catch (error) {
      toast.error('Could not delete the draft', {
        description: error instanceof ApiCallError ? error.message : 'Try again shortly.',
      });
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="rounded border border-border bg-surface">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border p-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-display tabular-nums tracking-tight text-text">
                {application.applicationNumber}
              </h1>
              <StatusBadge kind="application" status={application.status} />
              {application.openShortfalls > 0 && (
                <Badge tone="warning">
                  {application.openShortfalls} open{' '}
                  {application.openShortfalls === 1 ? 'shortfall' : 'shortfalls'}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-small text-text-muted">
              {application.applicationType?.name ?? 'Application'}
              {application.applicant?.name && <> · {application.applicant.name}</>}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isDraft && canEdit && (
              <Button asChild variant="primary">
                <Link href={`/applications/${application.id}/edit`}>
                  <Pencil className="size-4" />
                  Continue filing
                </Link>
              </Button>
            )}
            {isDraft && canDelete && (
              <Button variant="ghost" onClick={() => setConfirming(true)}>
                <Trash2 className="size-4" />
                Delete draft
              </Button>
            )}
          </div>
        </div>

        <dl className="grid gap-x-6 gap-y-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <HeaderFact label="Applicant" value={application.applicant?.name || null} />
          <HeaderFact label="Application type" value={application.applicationType?.name ?? null} />
          <HeaderFact
            label="Current stage"
            value={stageLabel(application.status, application.currentStageCode)}
          />
          {/*
            Who is actually holding the file.

            "Unclaimed" is a different fact from "nobody is working on it": the
            task is addressed to a whole desk and sits in a shared inbox until
            an officer takes it. An applicant chasing a file needs to be able to
            tell the two apart, and so does a supervisor.
          */}
          <div>
            <dt className="text-caption uppercase tracking-wide text-text-muted">With</dt>
            <dd className="mt-0.5 text-small">
              {workflow?.task ? (
                workflow.task.assignedUserId ? (
                  <span className="text-text">{workflow.task.assignedUserName}</span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Badge tone="info">Unclaimed</Badge>
                    <span className="text-text-muted">{workflow.task.assignedRoleKey} desk</span>
                  </span>
                )
              ) : (
                <span className="text-text-subtle">
                  {isDraft ? 'You — not yet filed' : 'Not with an officer'}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-caption uppercase tracking-wide text-text-muted">SLA</dt>
            <dd className="mt-0.5 text-small">
              {application.slaDueAt ? (
                <span className="flex items-center gap-1.5">
                  <StatusBadge kind="sla" status={application.slaStatus} />
                  {application.slaDaysRemaining !== null && (
                    <span className="tabular-nums text-text-muted">
                      {application.slaDaysRemaining < 0
                        ? `${Math.abs(application.slaDaysRemaining)}d over`
                        : `${application.slaDaysRemaining}d left`}
                    </span>
                  )}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-text-subtle">
                  <Clock className="size-3.5" aria-hidden />
                  Not started
                </span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete this draft?"
        description={application.applicationNumber}
        consequence={
          <>
            Everything entered on this application is removed from your list. The application
            number stays reserved and is not reissued, so this file remains accounted for in the
            register. This cannot be undone.
          </>
        }
        confirmLabel="Delete draft"
        destructive
        busy={busy}
        onConfirm={remove}
      />
    </>
  );
}

function HeaderFact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-small text-text">
        {value || <span className="italic text-text-subtle">Not entered yet</span>}
      </dd>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Overview
// ═══════════════════════════════════════════════════════════════════════════

function Overview({
  application,
  timeline,
  isDraft,
  canEdit,
}: {
  application: Detail;
  timeline: TimelineEvent[];
  isDraft: boolean;
  canEdit: boolean;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-4">
        {isDraft && (
          <Card>
            <CardHeader>
              <CardTitle>This application has not been filed</CardTitle>
              <CardDescription>
                It is a draft. Nothing reaches the department until you submit it.
              </CardDescription>
            </CardHeader>
            {canEdit && (
              <CardContent>
                <Button asChild variant="primary">
                  <Link href={`/applications/${application.id}/edit`}>
                    Continue filing
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </CardContent>
            )}
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Property</CardTitle>
            <CardDescription>Where the development is proposed.</CardDescription>
          </CardHeader>
          <CardContent>
            {application.propertyLabel ? (
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Fact label="Location" value={application.propertyLabel} />
                <Fact label="Zone" value={application.zone?.name ?? null} />
                <Fact
                  label="Plot area"
                  value={
                    application.property?.plotAreaSqm
                      ? `${application.property.plotAreaSqm} sq m`
                      : null
                  }
                />
                <Fact
                  label="Road width"
                  value={
                    application.property?.roadWidthM ? `${application.property.roadWidthM} m` : null
                  }
                />
              </dl>
            ) : (
              <EmptyState
                title="No property details yet"
                description="They are entered on the Property, Location and Survey steps of the wizard."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Proposed building</CardTitle>
            <CardDescription>What is to be built.</CardDescription>
          </CardHeader>
          <CardContent>
            {application.building?.builtUpAreaSqm ? (
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Fact label="Use" value={application.building.buildingUse || null} />
                <Fact label="Occupancy" value={application.building.occupancyType || null} />
                <Fact
                  label="Floors"
                  value={`${application.building.numFloors} above ground${
                    application.building.numBasements
                      ? `, ${application.building.numBasements} basement`
                      : ''
                  }`}
                />
                <Fact
                  label="Built-up area"
                  value={`${application.building.builtUpAreaSqm} sq m`}
                />
                <Fact label="Achieved FAR" value={application.building.achievedFar.toFixed(2)} />
                <Fact
                  label="Achieved coverage"
                  value={`${application.building.achievedCoverage.toFixed(1)}%`}
                />
              </dl>
            ) : (
              <EmptyState
                title="No building details yet"
                description="They are entered on the Development and Building steps of the wizard."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="lg:sticky lg:top-4 lg:self-start">
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>What has happened to this application.</CardDescription>
        </CardHeader>
        <CardContent>
          <ApplicationTimeline events={timeline} limit={6} />
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Application details
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Everything entered, read-only, grouped exactly as the wizard collected it.
 *
 * Matching the wizard's grouping is the point: someone who needs to correct a
 * value can see which step to go to without translating between two different
 * mental models of the same form.
 */
function Details({ application, meta }: { application: Detail; meta: ApplicationMeta }) {
  const { applicant, property, building } = application;

  const label = (category: string, code: string) =>
    meta.master[category]?.find((o) => o.code === code)?.label ?? code;

  const groups: Array<{ key: string; facts: Array<[string, string | number | null]> }> = [
    {
      key: 'applicant',
      facts: [
        ['Full name', applicant?.name ?? null],
        ["Father's / husband's name", applicant?.fatherName ?? null],
        ['Mobile', applicant?.phone ?? null],
        ['Email', applicant?.email ?? null],
        ['Aadhaar (last 4)', applicant?.aadhaarLast4 ? `••••${applicant.aadhaarLast4}` : null],
        ['PAN', applicant?.panMasked ?? null],
        ['Address', applicant?.address ?? null],
      ],
    },
    {
      key: 'owner',
      facts: applicant?.ownerSameAsApplicant
        ? [['Owner', 'The applicant is the owner of the land']]
        : [
            ["Owner's name", applicant?.ownerName ?? null],
            ["Owner's mobile", applicant?.ownerPhone ?? null],
            ["Owner's address", applicant?.ownerAddress ?? null],
          ],
    },
    {
      key: 'property',
      facts: [
        ['District', property?.district ?? null],
        ['Mandal', property?.mandal ?? null],
        ['Village', property?.village ?? null],
        ['Locality', property?.localityName ?? null],
        ['Ward', property?.wardNo ?? null],
      ],
    },
    {
      key: 'location',
      facts: [
        ['Zone', application.zone?.name ?? null],
        ['Door number', property?.doorNo ?? null],
        ['Street', property?.streetName ?? null],
        ['PIN code', property?.pincode ?? null],
        ['North', property?.boundaryNorth ?? null],
        ['South', property?.boundarySouth ?? null],
        ['East', property?.boundaryEast ?? null],
        ['West', property?.boundaryWest ?? null],
        ['Latitude', property?.latitude ?? null],
        ['Longitude', property?.longitude ?? null],
      ],
    },
    {
      key: 'survey',
      facts: [
        ['Survey number(s)', property?.surveyNumbers ?? null],
        ['Plot number', property?.plotNo ?? null],
        ['Layout', property?.layoutName ?? null],
        ['LP number', property?.lpNumber ?? null],
        ['Plot area', property?.plotAreaSqm ? `${property.plotAreaSqm} sq m` : null],
        ['Road width', property?.roadWidthM ? `${property.roadWidthM} m` : null],
        ['Land use', property?.landUseZone ? label('LAND_USE', property.landUseZone) : null],
        ['Tenure', property?.tenureType ? label('TENURE', property.tenureType) : null],
      ],
    },
    {
      key: 'development',
      facts: [
        ['Building use', building?.buildingUse ? label('BUILDING_USE', building.buildingUse) : null],
        ['Sub-use', building?.buildingSubUse ?? null],
        ['Occupancy', building?.occupancyType ? label('OCCUPANCY', building.occupancyType) : null],
        ['Structure', building?.structureType ? label('STRUCTURE_TYPE', building.structureType) : null],
        ['Floors above ground', building?.numFloors ?? null],
        ['Basements', building?.numBasements ?? null],
        ['Dwelling units', building?.numDwellingUnits ?? null],
        ['Height', building?.buildingHeightM ? `${building.buildingHeightM} m` : null],
      ],
    },
    {
      key: 'building',
      facts: [
        ['Built-up area', building?.builtUpAreaSqm ? `${building.builtUpAreaSqm} sq m` : null],
        ['Floor area', building?.floorAreaSqm ? `${building.floorAreaSqm} sq m` : null],
        ['Ground coverage', building?.coverageAreaSqm ? `${building.coverageAreaSqm} sq m` : null],
        ['Parking area', building?.parkingAreaSqm ? `${building.parkingAreaSqm} sq m` : null],
        ['Achieved FAR', building?.achievedFar ? building.achievedFar.toFixed(2) : null],
        [
          'Achieved coverage',
          building?.achievedCoverage ? `${building.achievedCoverage.toFixed(1)}%` : null,
        ],
        ['Front setback', building?.setbackFrontM ? `${building.setbackFrontM} m` : null],
        ['Rear setback', building?.setbackRearM ? `${building.setbackRearM} m` : null],
        ['Left setback', building?.setbackLeftM ? `${building.setbackLeftM} m` : null],
        ['Right setback', building?.setbackRightM ? `${building.setbackRightM} m` : null],
      ],
    },
  ];

  const declaration = application.ltpDeclaration as Record<string, string | null> | null;

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const step = WIZARD_STEPS.find((s) => s.key === group.key);
        return (
          <Card key={group.key}>
            <CardHeader>
              <CardTitle>{step?.label ?? group.key}</CardTitle>
              <CardDescription>{step?.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.facts.map(([factLabel, value]) => (
                  <Fact key={factLabel} label={factLabel} value={value} />
                ))}
              </dl>
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader>
          <CardTitle>Licensed technical person</CardTitle>
          <CardDescription>
            The licence particulars as they stood when the declaration was made.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {application.ltpDeclaredAt ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded border border-success/25 bg-success-bg px-3 py-2.5">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
                <p className="text-small text-success">
                  Declaration accepted on{' '}
                  {new Date(application.ltpDeclaredAt).toLocaleString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  .
                </p>
              </div>

              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                <Fact label="Name" value={declaration?.name ?? application.ltp?.name ?? null} />
                <Fact label="Firm" value={declaration?.firmName ?? null} />
                <Fact label="Licence number" value={declaration?.licenceNo ?? null} />
                <Fact label="Licence class" value={declaration?.licenceClass ?? null} />
                <Fact
                  label="Valid until"
                  value={
                    declaration?.validUpto
                      ? new Date(declaration.validUpto).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      : null
                  }
                />
                <Fact label="Remarks" value={declaration?.remarks ?? null} />
              </dl>
            </div>
          ) : (
            <EmptyState
              title="Declaration not yet made"
              description="It is accepted on the last step of the wizard, and is required before the application can be filed."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | number | null }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div className="min-w-0">
      <dt className="text-caption uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className={cn('mt-0.5 break-words text-small', empty ? 'text-text-subtle' : 'text-text')}>
        {empty ? <span className="italic">Not entered</span> : value}
      </dd>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Placeholder panels
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A tab that has not been built.
 *
 * States what will be here and when, rather than "coming soon". Someone
 * evaluating the system needs to be able to tell an unbuilt feature from a
 * broken one, and this is where that distinction gets made.
 */
function ComingSoon({ tab }: { tab: TabDef }) {
  return (
    <Card>
      <CardContent className="py-10 text-center">
        <div className="mx-auto mb-3 w-fit rounded-full bg-surface-sunk p-3">
          <Lock className="size-5 text-text-subtle" />
        </div>
        <p className="text-body font-medium text-text">{tab.label}</p>
        <p className="mx-auto mt-1 max-w-[52ch] text-small text-text-muted">{tab.description}</p>
        <p className="mt-3">
          <Badge tone="info">Arrives in {tab.phase}</Badge>
        </p>
      </CardContent>
    </Card>
  );
}
