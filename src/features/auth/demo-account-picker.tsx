'use client';

import * as React from 'react';
import { ChevronDown, Sparkles, Shield, HardHat, FileCheck, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';

const FEATURED = [
  {
    email: 'super.demo@example.com',
    label: 'Super Admin',
    role: 'Full Access',
    icon: Crown,
    color: 'hover:border-purple-300 hover:bg-purple-50 text-purple-700 dark:hover:bg-purple-950/30',
  },
  {
    email: 'ltp.demo@example.com',
    label: 'Applicant (LTP)',
    role: 'Ravi Kumar',
    icon: HardHat,
    color: 'hover:border-blue-300 hover:bg-blue-50 text-blue-700 dark:hover:bg-blue-950/30',
  },
  {
    email: 'tpa.demo@example.com',
    label: 'Planning Assistant',
    role: 'TPA',
    icon: FileCheck,
    color: 'hover:border-emerald-300 hover:bg-emerald-50 text-emerald-700 dark:hover:bg-emerald-950/30',
  },
  {
    email: 'commissioner.demo@example.com',
    label: 'Commissioner',
    role: 'Executive',
    icon: Shield,
    color: 'hover:border-rose-300 hover:bg-rose-50 text-rose-700 dark:hover:bg-rose-950/30',
  },
];

const ACCOUNTS: Array<{ email: string; label: string; group: string }> = [
  { email: 'ltp.demo@example.com', label: 'LTP — Ravi Kumar', group: 'Applicant' },
  { email: 'ltp2.demo@example.com', label: 'LTP — Sunitha Varma', group: 'Applicant' },
  { email: 'tpa.demo@example.com', label: 'TPA — Priya Sharma', group: 'Department' },
  { email: 'zad.demo@example.com', label: 'ZAD — Anil Reddy', group: 'Department' },
  { email: 'zdd.demo@example.com', label: 'ZDD — Meena Iyer', group: 'Department' },
  { email: 'zjd.demo@example.com', label: 'ZJD — Suresh Naidu', group: 'Department' },
  { email: 'director.demo@example.com', label: 'Director (DP) — Lakshmi Rao', group: 'Executive' },
  { email: 'addlcommissioner.demo@example.com', label: 'Addl Commissioner — Vikram Singh', group: 'Executive' },
  { email: 'commissioner.demo@example.com', label: 'Commissioner — Deepa Menon', group: 'Executive' },
  { email: 'finance.demo@example.com', label: 'Finance Officer — Rajesh Gupta', group: 'Support' },
  { email: 'admin.demo@example.com', label: 'System Admin', group: 'Support' },
  { email: 'super.demo@example.com', label: 'Super Admin (All Access)', group: 'Support' },
  { email: 'viewer.demo@example.com', label: 'Viewer / Auditor', group: 'Support' },
];

const GROUPS = ['Applicant', 'Department', 'Executive', 'Support'];

export function DemoAccountPicker({
  demoPassword: _demoPassword,
  onPick,
}: {
  demoPassword?: string;
  onPick: (email: string) => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="rounded-xl border border-primary/20 bg-gradient-to-b from-primary/5 to-transparent p-3.5 shadow-subtle">
      <div className="flex items-center justify-between gap-2 pb-2.5">
        <div className="flex items-center gap-1.5 text-primary">
          <Sparkles className="size-4 shrink-0" />
          <span className="text-small font-semibold">Direct Portal Access by Role</span>
        </div>
      </div>

      {/* Featured 1-click personas */}
      <div className="grid grid-cols-2 gap-2">
        {FEATURED.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.email}
              type="button"
              onClick={() => onPick(item.email)}
              className={cn(
                'flex items-center gap-2 rounded-lg border border-border/80 bg-surface px-2.5 py-2 text-left shadow-subtle',
                'transition-all duration-150 active:scale-[0.98]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                item.color
              )}
            >
              <div className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-sunk">
                <Icon className="size-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-caption font-bold leading-tight">{item.label}</p>
                <p className="truncate text-[11px] text-text-muted leading-tight mt-0.5">{item.role}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Expandable full list */}
      <div className="mt-3 pt-2 border-t border-border/60">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-between text-caption font-medium text-text-muted hover:text-text focus-visible:outline-none"
        >
          <span>More officer stations (13 roles)</span>
          <ChevronDown className={cn('size-3.5 transition-transform duration-200', open && 'rotate-180')} />
        </button>

        {open && (
          <div className="mt-3 space-y-3 pt-1">
            {GROUPS.map((group) => (
              <div key={group}>
                <p className="pb-1.5 text-[11px] font-bold uppercase tracking-wider text-text-subtle">
                  {group}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {ACCOUNTS.filter((a) => a.group === group).map((account) => (
                    <button
                      key={account.email}
                      type="button"
                      onClick={() => {
                        onPick(account.email);
                        setOpen(false);
                      }}
                      className="rounded-md border border-border bg-surface px-2 py-1 text-caption text-text transition-all hover:border-primary hover:bg-primary-subtle/40 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {account.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
