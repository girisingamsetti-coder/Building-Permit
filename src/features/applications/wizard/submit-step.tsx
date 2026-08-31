'use client';

import * as React from 'react';
import { ChevronLeft, Send, TriangleAlert, FileCheck2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CheckboxField } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { toast } from '@/components/ui/toast';
import { api, ApiCallError } from '../api';
import type { ApplicationDetail, WizardState } from '../types';

/**
 * The final step: file the application.
 *
 * Submission is irreversible from the LTP's side — the file leaves their hands
 * and goes to the department — so it gets a confirmation naming what actually
 * happens, not an "Are you sure?".
 *
 * The completeness check shown here is advisory. The SERVER re-derives it from
 * the persisted rows inside the submit transaction; if this screen and the
 * server ever disagree, the server wins and its reasons are rendered below.
 */
export function SubmitStep({
  state,
  onBack,
  onSubmitted,
}: {
  state: WizardState;
  onBack: () => void;
  onSubmitted: (application: ApplicationDetail) => void;
}) {
  const [confirmed, setConfirmed] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [problems, setProblems] = React.useState(state.problems);
  const [error, setError] = React.useState<string | null>(null);

  const application = state.application;
  const blocked = problems.length > 0;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const filed = await api.post<ApplicationDetail>(
        `/api/applications/${application.id}/submit`,
        { confirmed: true }
      );
      setConfirming(false);
      onSubmitted(filed);
    } catch (err) {
      setConfirming(false);
      if (err instanceof ApiCallError) {
        // A 422 carries the exact fields the server found wanting. Showing
        // them here — rather than a generic failure — means the user never
        // has to guess which of ten steps to go back to.
        if (err.details.length) {
          setProblems(err.details);
          setError(err.message);
          toast.error('Not filed', { description: 'Some particulars are still missing.' });
        } else {
          setError(err.message);
          toast.error('Not filed', { description: err.message });
        }
      } else {
        setError('Something went wrong. Try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Submit</CardTitle>
          <CardDescription>
            File {application.applicationNumber} and start the approval process.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {error && (
            <p role="alert" className="rounded border border-danger/30 bg-danger-bg px-3 py-2 text-small text-danger">
              {error}
            </p>
          )}

          {blocked ? (
            <div className="rounded border border-warning/30 bg-warning-bg px-3 py-2.5">
              <div className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                <div className="min-w-0">
                  <p className="text-small font-medium text-warning">
                    This application cannot be filed yet
                  </p>
                  <ul className="mt-1.5 space-y-0.5">
                    {problems.map((problem) => (
                      <li key={problem.path} className="text-caption text-warning">
                        • {problem.message}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-caption text-warning">
                    Go back to Review to jump straight to the step that needs it.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded border border-border bg-surface-sunk p-4">
                <div className="flex items-start gap-2.5">
                  <FileCheck2 className="mt-0.5 size-4 shrink-0 text-text-muted" />
                  <div className="min-w-0 space-y-2">
                    <p className="text-small font-medium text-text">What happens when you file</p>
                    <ol className="space-y-1 text-caption text-text-muted">
                      <li>
                        1. The application is locked. You will not be able to change the particulars
                        afterwards.
                      </li>
                      <li>
                        2. It is registered under{' '}
                        <span className="font-medium tabular-nums text-text">
                          {application.applicationNumber}
                        </span>
                        , which is the reference for every later step.
                      </li>
                      <li>3. It goes to the department for review, and you will be notified.</li>
                      <li>
                        4. If anything is found wanting, a shortfall is raised and comes back to you
                        to answer.
                      </li>
                    </ol>
                  </div>
                </div>
              </div>

              <CheckboxField
                id="confirmed"
                label="The particulars in this application are correct"
                description="You are filing this as the licensed technical person of record."
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
            </>
          )}
        </CardContent>

        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <Button variant="ghost" onClick={onBack} disabled={busy}>
            <ChevronLeft className="size-4" />
            Back to review
          </Button>

          <Button
            variant="primary"
            onClick={() => setConfirming(true)}
            disabled={blocked || !confirmed || busy}
          >
            <Send className="size-4" />
            File application
          </Button>
        </div>
      </Card>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="File this application?"
        description={application.applicationNumber}
        consequence={
          <>
            The particulars are locked and the application goes to the department for review. You
            will not be able to edit it afterwards — changes are made by answering a shortfall if
            the department raises one.
          </>
        }
        confirmLabel="File application"
        busy={busy}
        onConfirm={submit}
      />
    </>
  );
}
