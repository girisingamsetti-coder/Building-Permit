'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Renders the error state and wires aria-invalid for assistive tech. */
  invalid?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, invalid, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      aria-invalid={invalid || undefined}
      className={cn(
        'flex h-9 w-full rounded border bg-surface px-3 py-1 text-body text-text',
        'placeholder:text-text-subtle',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-bg',
        'disabled:cursor-not-allowed disabled:bg-surface-sunk disabled:opacity-60',
        invalid ? 'border-danger' : 'border-border-strong',
        className
      )}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export { Input };
