'use client';

import * as React from 'react';
import {
  Check,
  Clock,
  Circle,
  Calendar,
  UserCheck,
  Layers,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ApplicationDetail } from '@/features/applications/types';
import type { WorkflowState } from '@/features/workflow/types';

/**
 * 9 Standard Workflow Milestones matching the visual progress stepper in the screenshot
 */
const WORKFLOW_MILESTONES = [
  { code: 'APPLICATION_CREATED', label: 'Application Created', actor: 'LTP' },
  { code: 'DRAWING_SCRUTINY', label: 'Drawing Scrutiny', actor: 'LTP' },
  { code: 'DOCUMENT_UPLOAD', label: 'Document Upload & Verification', actor: 'TPA' },
  { code: 'FEE_GENERATED', label: 'Fee Generated', actor: 'LTP' },
  { code: 'PAYMENT', label: 'Payment', actor: 'LTP' },
  { code: 'TPS_TECHNICAL_SCRUTINY', label: 'TPS Technical Scrutiny', actor: 'TPS' },
  { code: 'TPA_REVIEW', label: 'TPA Review', actor: 'TPA' },
  { code: 'ZAD_ZDD_REVIEW', label: 'ZAD / ZDD Review', actor: 'ZDD' },
  { code: 'ZJD_REVIEW', label: 'ZJD Review', actor: 'ZJD' },
  { code: 'DIRECTOR_DP_REVIEW', label: 'Director – DP Review', actor: 'DIRECTOR_DP' },
  { code: 'ADDL_COMMISSIONER_REVIEW', label: 'Addl. Commissioner Review', actor: 'ADDL_COMMISSIONER' },
];

export function WorkflowStepperHeader({
  application,
  workflow,
}: {
  application: ApplicationDetail;
  workflow: WorkflowState | null;
}) {
  // Determine current milestone index based on status or stage code
  const currentStage = application.currentStageCode || 'LTP_DRAFT';
  const isApproved = application.status === 'APPROVED';
  const isRejected = application.status === 'REJECTED';

  const getMilestoneIndex = () => {
    if (isApproved) return 11;
    if (currentStage.includes('DRAFT')) return 0;
    if (currentStage.includes('DRAWING') || currentStage.includes('SCRUTINY')) return 1;
    if (currentStage.includes('DOCUMENT')) return 2;
    if (currentStage.includes('FEE')) return 3;
    if (currentStage.includes('PAYMENT')) return 4;
    if (currentStage.includes('TPS')) return 5;
    if (currentStage.includes('TPA')) return 6;
    if (currentStage.includes('ZAD') || currentStage.includes('ZDD')) return 7;
    if (currentStage.includes('ZJD')) return 8;
    if (currentStage.includes('DIRECTOR')) return 9;
    if (currentStage.includes('COMMISSIONER')) return 10;
    return 1;
  };

  const activeIndex = getMilestoneIndex();

  // Formatting dates
  const submittedDate = application.submittedAt
    ? new Date(application.submittedAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : application.createdAt
    ? new Date(application.createdAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '15 Aug 2026';

  const expectedSlaDate = application.slaDueAt
    ? new Date(application.slaDueAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '20 Feb 2026';

  const assignedPerson =
    workflow?.task?.assignedUserName ||
    application.ltp?.name ||
    'Ar. Vikram Deshpande';

  const assignedRole =
    workflow?.task?.assignedRoleKey ||
    (application.status === 'DRAFT' ? 'LTP' : 'TPA');

  return (
    <div className="rounded-2xl border border-border/80 bg-surface shadow-subtle p-5 sm:p-6 space-y-6">
      {/* ── Top Horizontal Workflow Stepper ── */}
      <div className="overflow-x-auto pb-2 -mx-2 px-2 scrollbar-thin">
        <div className="flex items-center justify-between min-w-[900px] gap-2">
          {WORKFLOW_MILESTONES.map((milestone, idx) => {
            const isCompleted = idx < activeIndex;
            const isCurrent = idx === activeIndex;
            const isPending = idx > activeIndex;

            return (
              <React.Fragment key={milestone.code}>
                {/* Milestone Node */}
                <div className="flex flex-col items-center text-center min-w-[72px] max-w-[86px] shrink-0 group">
                  {/* Circle Icon Indicator */}
                  <div
                    className={cn(
                      'grid size-8 place-items-center rounded-full transition-all duration-200 shadow-xs',
                      isCompleted &&
                        'bg-emerald-600 text-white shadow-emerald-600/20 ring-4 ring-emerald-500/10',
                      isCurrent &&
                        'bg-emerald-700 text-white ring-4 ring-emerald-500/20 animate-pulse',
                      isPending &&
                        'border-2 border-slate-300 dark:border-slate-700 text-slate-400 bg-surface'
                    )}
                  >
                    {isCompleted ? (
                      <Check className="size-4 stroke-[2.5]" />
                    ) : isCurrent ? (
                      <Clock className="size-4 stroke-[2.5]" />
                    ) : (
                      <div className="size-2 rounded-full bg-slate-300 dark:bg-slate-600" />
                    )}
                  </div>

                  {/* Milestone Label */}
                  <p
                    className={cn(
                      'mt-2 text-[10.5px] leading-tight font-medium text-center',
                      isCompleted || isCurrent
                        ? 'text-text font-semibold'
                        : 'text-text-muted/80'
                    )}
                  >
                    {milestone.label}
                  </p>

                  {/* Actor Badge */}
                  <span className="mt-1 text-[9.5px] font-mono text-text-subtle uppercase tracking-wider">
                    {milestone.actor}
                  </span>
                </div>

                {/* Connecting Line between nodes */}
                {idx < WORKFLOW_MILESTONES.length - 1 && (
                  <div className="flex-1 h-0.5 mx-1 min-w-[20px] bg-slate-200 dark:bg-slate-800 relative self-center mb-6">
                    <div
                      className={cn(
                        'h-full transition-all duration-500',
                        idx < activeIndex ? 'bg-emerald-600' : 'bg-transparent'
                      )}
                    />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* ── Sub-header: Metadata Bar (Submitted Date, Expected SLA, Assigned Person) ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-3.5 border-t border-border/60 text-small text-text-muted">
        {/* Left: Submitted */}
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-emerald-600 dark:text-emerald-400" />
          <span>Submitted:</span>
          <strong className="font-semibold text-text">{submittedDate}</strong>
        </div>

        {/* Center: Expected SLA */}
        <div className="flex items-center gap-2">
          <Calendar className="size-4 text-emerald-600 dark:text-emerald-400" />
          <span>Expected SLA:</span>
          <strong className="font-semibold text-text">{expectedSlaDate}</strong>
        </div>

        {/* Right: Assigned Person & Badge */}
        <div className="flex items-center gap-2">
          <UserCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
          <span>Assigned:</span>
          <span className="font-semibold text-text">{assignedPerson}</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            {assignedRole}
          </span>
        </div>
      </div>
    </div>
  );
}
