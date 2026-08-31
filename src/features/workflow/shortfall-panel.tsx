'use client';

import { AlertTriangle, CircleCheck, MessageSquare } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/common/status-badge';
import { stageName } from '@/lib/workflow';
import { isShortfallOpen } from '@/lib/shortfalls';
import { cn } from '@/lib/utils';
import type { Shortfall } from './types';

/**
 * Everything the department has asked for on this file.
 *
 * ── Open ones are the point of the panel ─────────────────────────────────
 *
 * They are listed first and counted in the heading, because an open shortfall
 * is the single thing that will stop this application being approved — of any
 * kind, in either mode, with no override. An officer reading this screen at
 * the Commissioner's desk needs that number before anything else.
 *
 * ── Every attempt stays visible ──────────────────────────────────────────
 *
 * A rejected response followed by a better one shows both. That is not
 * completeness for its own sake: "I sent that weeks ago" is a real
 * conversation, and the answer to it is on this panel.
 */
export function ShortfallPanel({
  shortfalls,
  openCount,
}: {
  shortfalls: Shortfall[];
  openCount: number;
}) {
  const ordered = [...shortfalls].sort((a, b) => {
    const aOpen = isOpen(a) ? 0 : 1;
    const bOpen = isOpen(b) ? 0 : 1;
    return aOpen - bOpen || new Date(b.raisedAt).getTime() - new Date(a.raisedAt).getTime();
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Shortfalls
          {openCount > 0 ? (
            <Badge tone="warning">
              {openCount} open
            </Badge>
          ) : (
            <Badge tone="success">All settled</Badge>
          )}
        </CardTitle>
        <CardDescription>
          {openCount > 0
            ? 'An application carrying any open shortfall cannot be approved — blocking or merely reported, of any kind.'
            : 'Nothing is outstanding on this application.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {ordered.map((shortfall) => (
          <article
            key={shortfall.id}
            className={cn(
              'rounded border p-3',
              isOpen(shortfall) ? 'border-warning/50 bg-warning-bg/30' : 'border-border'
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-small font-medium text-text">
                  {isOpen(shortfall) ? (
                    <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
                  ) : (
                    <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
                  )}
                  {shortfall.title}
                  <span className="font-normal text-text-muted">{shortfall.shortfallNumber}</span>
                </p>
                <p className="mt-0.5 text-caption text-text-muted">
                  Raised at {stageName(shortfall.raisedAtStageCode)} by{' '}
                  {shortfall.raisedByRoleKey.replace(/_/g, ' ')} ·{' '}
                  {new Date(shortfall.raisedAt).toLocaleDateString()}
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <Badge tone={shortfall.mode === 'BLOCKING' ? 'warning' : 'info'}>
                  {shortfall.mode === 'BLOCKING' ? 'Blocking' : 'Reported'}
                </Badge>
                <StatusBadge kind="shortfall" status={shortfall.status} />
              </div>
            </div>

            {shortfall.description && (
              <p className="mt-2 text-small text-text">{shortfall.description}</p>
            )}

            {shortfall.items.length > 0 && (
              <ul className="mt-2 space-y-1">
                {shortfall.items.map((item) => (
                  <li key={item.id} className="flex items-baseline justify-between gap-3 text-small">
                    <span className={cn('text-text', item.isResolved && 'text-text-muted line-through')}>
                      {item.description}
                    </span>
                    {item.amount && (
                      <span className="shrink-0 tabular-nums text-text">
                        {Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {shortfall.resolutions.length > 0 && (
              <ol className="mt-3 space-y-2 border-t border-border pt-2">
                {shortfall.resolutions.map((resolution) => (
                  <li key={resolution.id} className="text-small">
                    <p className="flex flex-wrap items-center gap-2 text-caption text-text-muted">
                      <MessageSquare className="size-3.5" aria-hidden />
                      Response {resolution.attemptNo} ·{' '}
                      {new Date(resolution.respondedAt).toLocaleDateString()}
                      {resolution.reviewedAt &&
                        (resolution.accepted ? (
                          <Badge tone="success">Accepted</Badge>
                        ) : (
                          <Badge tone="danger">Not accepted</Badge>
                        ))}
                    </p>
                    <p className="text-text">{resolution.response}</p>
                    {resolution.reviewRemarks && (
                      <p className="mt-0.5 text-caption text-text-muted">
                        Officer: {resolution.reviewRemarks}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}

            {shortfall.closedAt && shortfall.closureRemarks && (
              <p className="mt-2 border-t border-border pt-2 text-caption text-text-muted">
                Settled {new Date(shortfall.closedAt).toLocaleDateString()} — {shortfall.closureRemarks}
              </p>
            )}
          </article>
        ))}
      </CardContent>
    </Card>
  );
}

const isOpen = (shortfall: Shortfall) => isShortfallOpen(shortfall.status);
