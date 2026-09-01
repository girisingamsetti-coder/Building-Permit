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
        'flex h-10 w-full rounded-lg border bg-surface px-3.5 py-2 text-body text-text shadow-subtle',
        'placeholder:text-text-subtle transition-all duration-150',
        'hover:border-border-strong',
        'focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20',
        'disabled:cursor-not-allowed disabled:bg-surface-sunk disabled:opacity-60',
        invalid ? 'border-danger focus-visible:border-danger focus-visible:ring-danger/20' : 'border-border',
        className
      )}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export { Input };
