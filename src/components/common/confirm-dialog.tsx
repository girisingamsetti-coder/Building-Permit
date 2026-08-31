'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/field';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';

/**
 * The confirmation every irreversible action goes through.
 *
 * Two rules it enforces by shape:
 *
 *  · The body states WHAT WILL HAPPEN, not "are you sure?". Someone who
 *    mis-clicked learns what they nearly did; someone who meant it gets
 *    confirmation they picked the right row.
 *  · The confirm button names the ACTION — "Delete draft", never "OK". A
 *    dialog read at a glance should still be unambiguous.
 *
 * `requireReason` adds a mandatory note that is passed to `onConfirm`. It is
 * for the actions somebody else will later have to understand — a withdrawn
 * shortfall, a cancelled demand — where "who did this and why" is the whole
 * value of the record, and an optional field would be left blank.
 *
 * Radix traps focus and restores it on close, and the destructive button is
 * not autofocused: the default target of a stray Enter must never be the
 * one that destroys something.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  /** What actually happens, in the user's terms. Rendered as the body. */
  consequence,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  requireReason = false,
  reasonLabel = 'Reason',
  reasonPlaceholder = '',
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  consequence?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  /** Demands a note before the action can be confirmed. */
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  onConfirm: (reason: string) => void | Promise<void>;
}) {
  const [reason, setReason] = React.useState('');
  const [touched, setTouched] = React.useState(false);

  // Cleared on every open, so yesterday's reason is never submitted with
  // today's decision.
  React.useEffect(() => {
    if (open) {
      setReason('');
      setTouched(false);
    }
  }, [open]);

  const missing = requireReason && reason.trim().length === 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        // Without this the first focusable child is the destructive button.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {(consequence || requireReason) && (
          <DialogBody className="space-y-3 text-small text-text-muted">
            {consequence}

            {requireReason && (
              <Field
                label={reasonLabel}
                htmlFor="confirm-reason"
                required
                error={touched && missing ? 'This is required — it goes on the record.' : undefined}
              >
                <Textarea
                  id="confirm-reason"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  invalid={touched && missing}
                  maxLength={1000}
                  placeholder={reasonPlaceholder}
                />
              </Field>
            )}
          </DialogBody>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'primary'}
            onClick={() => {
              setTouched(true);
              // Deliberately not disabled while the reason is empty: pressing
              // it shows which field is wanted, where a dead button explains
              // nothing.
              if (missing) return;
              void onConfirm(reason.trim());
            }}
            loading={busy}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
