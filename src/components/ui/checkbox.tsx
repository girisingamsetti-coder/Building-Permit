'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * A native checkbox, styled.
 *
 * Deliberately not a Radix primitive with a hidden input: a legal declaration
 * is exactly the control that must behave like a checkbox for assistive
 * technology, autofill and form reset, and `appearance-none` on the real
 * element gets the styling without giving any of that up.
 */
export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  invalid?: boolean;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, invalid, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      aria-invalid={invalid || undefined}
      className={cn(
        'peer size-4 shrink-0 cursor-pointer appearance-none rounded-sm border bg-surface',
        'checked:border-primary checked:bg-primary',
        // The tick is a background image so it inherits no layout and cannot
        // be knocked out of alignment by the label beside it.
        "checked:bg-[url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 8.5l3.5 3.5L13 5'/%3E%3C/svg%3E\")] checked:bg-center checked:bg-no-repeat",
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-bg',
        'disabled:cursor-not-allowed disabled:opacity-60',
        invalid ? 'border-danger' : 'border-border-strong',
        className
      )}
      {...props}
    />
  )
);
Checkbox.displayName = 'Checkbox';

/**
 * Checkbox + label + optional description, as one clickable target.
 *
 * The whole block is the label, so the hit area is the sentence rather than a
 * 16px square — which matters on a touch screen and to anyone with a tremor.
 */
export function CheckboxField({
  id,
  label,
  description,
  error,
  className,
  ...props
}: CheckboxProps & { label: React.ReactNode; description?: React.ReactNode; error?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5">
        <Checkbox id={id} invalid={Boolean(error)} className="mt-0.5" {...props} />
        <span className="min-w-0">
          <span className="block text-small font-medium text-text">{label}</span>
          {description && <span className="mt-0.5 block text-caption text-text-muted">{description}</span>}
        </span>
      </label>
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export { Checkbox };
