'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { dueLabel, isOverdue, kindLabel, turnOf } from '@/lib/shortfalls';
import { cn } from '@/lib/utils';
import type { ShortfallRow } from './types';

/**
 * The banner that sits above everything else on an application.
 *
 * ── Why a banner and not a tab ───────────────────────────────────────────
 *
 * An open shortfall is the single fact that decides what happens to this file:
 * the applicant cannot proceed and the Commissioner cannot approve. Putting it
 * behind a tab means somebody arriving on the Overview to ask "why has nothing
 * happened for a fortnight" has to go looking for the answer. It goes at the
 * top, on every tab, and it says whose move it is.
 *
 * ── It addresses the reader ──────────────────────────────────────────────
 *
 * "The department is waiting for you" to the applicant; "waiting for the
 * applicant" to the officer. The same row, two sentences, because a banner
 * that says "action required" to somebody who cannot take the action is
 * furniture.
 */
export function ShortfallBanner({
  shortfalls,
  viewerIsApplicant,
}: {
  /** Open ones only. A settled shortfall belongs in the panel, not up here. */
  shortfalls: ShortfallRow[];
  viewerIsApplicant: boolean;
}) {
  if (!shortfalls.length) return null;

  const mine = shortfalls.filter((s) =>
    viewerIsApplicant ? turnOf(s.status) === 'APPLICANT' : turnOf(s.status) === 'OFFICER'
  );

  // Sorted so the thing the reader must act on is first, and among those the
  // one that has been waiting longest.
  const ordered = [
    ...mine,
    ...shortfalls.filter((s) => !mine.includes(s)),
  ];

  const urgent = mine.length > 0;

  return (
    <section
      aria-label="Open shortfalls"
      className={cn(
        'rounded border p-3',
        urgent ? 'border-warning bg-warning-bg' : 'border-border bg-surface-sunk'
      )}
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle
          className={cn('mt-0.5 size-5 shrink-0', urgent ? 'text-warning' : 'text-text-muted')}
          aria-hidden
        />

        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-small font-semibold text-text">
            {headline(shortfalls.length, mine.length, viewerIsApplicant)}
          </p>

          <ul className="space-y-1.5">
            {ordered.map((shortfall) => {
              const turn = turnOf(shortfall.status);
              const overdue = isOverdue(shortfall.dueDate, shortfall.status);

              return (
                <li
                  key={shortfall.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"
                >
                  <span className="min-w-0">
                    <Link
                      href={`/shortfalls/${shortfall.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {shortfall.shortfallNumber}
                    </Link>
                    <span className="ml-2 text-small text-text">{shortfall.title}</span>
                    <span className="ml-2 text-caption text-text-muted">
                      {viewerIsApplicant
                        ? shortfall.requiredAction
                        : `${kindLabel(shortfall.kind)} · raised at ${shortfall.raisedAtStageCode.replace(/_/g, ' ').toLowerCase()}`}
                    </span>
                  </span>

                  <span className="flex shrink-0 items-center gap-2">
                    {shortfall.mode === 'REPORTED' && <Badge tone="info">Travels with the file</Badge>}

                    {shortfall.dueDate && (
                      <span
                        className={cn(
                          'flex items-center gap-1 text-caption tabular-nums',
                          overdue ? 'font-medium text-danger' : 'text-text-muted'
                        )}
                      >
                        <Clock className="size-3" aria-hidden />
                        {dueLabel(shortfall.dueDate)}
                      </span>
                    )}

                    <Badge tone={turn === 'APPLICANT' ? 'warning' : turn === 'OFFICER' ? 'purple' : 'neutral'}>
                      {turn === 'APPLICANT'
                        ? viewerIsApplicant
                          ? 'Your move'
                          : 'With the applicant'
                        : turn === 'OFFICER'
                          ? viewerIsApplicant
                            ? 'With the department'
                            : 'Your move'
                          : 'Not sent yet'}
                    </Badge>
                  </span>
                </li>
              );
            })}
          </ul>

          {mine.length === 1 && (
            <Button size="sm" variant={urgent ? 'primary' : 'secondary'} asChild>
              <Link href={`/shortfalls/${mine[0]!.id}`}>
                {viewerIsApplicant ? 'Respond' : 'Review the response'}
                <ArrowRight />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function headline(total: number, mine: number, viewerIsApplicant: boolean): string {
  if (mine === 0) {
    return total === 1
      ? 'One shortfall is open on this application. Nothing is needed from you.'
      : `${total} shortfalls are open on this application. Nothing is needed from you.`;
  }

  if (viewerIsApplicant) {
    return mine === 1
      ? 'The department needs something from you before this application can go further.'
      : `The department needs ${mine} things from you before this application can go further.`;
  }

  return mine === 1
    ? 'A shortfall response is waiting for your decision.'
    : `${mine} shortfall responses are waiting for your decision.`;
}
