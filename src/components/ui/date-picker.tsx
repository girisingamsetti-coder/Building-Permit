'use client';

import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Button } from './button';
import { Popover, PopoverTrigger, PopoverContent } from './popover';
import { cn } from '@/lib/utils';
import 'react-day-picker/dist/style.css';

export function DatePicker({
  value,
  onChange,
  placeholder = 'Select a date',
  disabled,
  invalid,
  id,
  fromYear = 1990,
  toYear = new Date().getFullYear() + 10,
}: {
  value?: Date | null;
  onChange?: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  fromYear?: number;
  toYear?: number;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="secondary"
          disabled={disabled}
          aria-invalid={invalid || undefined}
          className={cn(
            'w-full justify-start font-normal',
            !value && 'text-text-subtle',
            invalid && 'border-danger'
          )}
        >
          <CalendarIcon className="text-text-muted" />
          {/* d MMM yyyy — unambiguous, unlike any all-numeric format. */}
          {value ? format(value, 'd MMM yyyy') : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2">
        <DayPicker
          mode="single"
          selected={value ?? undefined}
          onSelect={(d) => {
            onChange?.(d);
            setOpen(false);
          }}
          captionLayout="dropdown"
          startMonth={new Date(fromYear, 0)}
          endMonth={new Date(toYear, 11)}
          className="text-small [--rdp-accent-color:rgb(var(--primary))]"
        />
      </PopoverContent>
    </Popover>
  );
}
