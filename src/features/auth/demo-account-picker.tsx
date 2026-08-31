'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Development convenience: fills the form with a demo account.
 *
 * Rendered only when DEMO_MODE is on, which the production env guardrails
 * refuse. It fills the fields rather than signing in directly, so the tester
 * still exercises the real sign-in path.
 */

const ACCOUNTS: Array<{ email: string; label: string; group: string }> = [
  { email: 'ltp.demo@example.com', label: 'LTP — Ravi Kumar', group: 'Applicant' },
  { email: 'tpa.demo@example.com', label: 'TPA — Priya Sharma', group: 'Department' },
  { email: 'zad.demo@example.com', label: 'ZAD — Anil Reddy', group: 'Department' },
  { email: 'zdd.demo@example.com', label: 'ZDD — Meena Iyer', group: 'Department' },
  { email: 'zjd.demo@example.com', label: 'ZJD — Suresh Naidu', group: 'Department' },
  { email: 'director.demo@example.com', label: 'Director (DP) — Lakshmi Rao', group: 'Executive' },
  { email: 'addlcommissioner.demo@example.com', label: 'Addl Commissioner — Vikram Singh', group: 'Executive' },
  { email: 'commissioner.demo@example.com', label: 'Commissioner — Deepa Menon', group: 'Executive' },
  { email: 'finance.demo@example.com', label: 'Finance — Rajesh Gupta', group: 'Support' },
  { email: 'admin.demo@example.com', label: 'System Admin', group: 'Support' },
  { email: 'super.demo@example.com', label: 'Super Admin (All Access)', group: 'Support' },
  { email: 'viewer.demo@example.com', label: 'Viewer / Auditor', group: 'Support' },

  // Added by `npm run seed:demo`. Listed here regardless: an account that does
  // not exist yet fails at sign-in with the ordinary message, which is a
  // better outcome than a picker that quietly disagrees with the database
  // depending on which seeds have been run.
  { email: 'ltp2.demo@example.com', label: 'LTP — Sunitha Varma', group: 'Applicant' },
  { email: 'ltp3.demo@example.com', label: 'LTP — Naveen Chowdary', group: 'Applicant' },
  { email: 'ltp4.demo@example.com', label: 'LTP — Kavitha Murthy', group: 'Applicant' },
  { email: 'tpa2.demo@example.com', label: 'TPA — Srinivas Raju (Z3–Z5)', group: 'Department' },
  { email: 'zad2.demo@example.com', label: 'ZAD — Padma Sastry (Z5)', group: 'Department' },
  { email: 'zjd2.demo@example.com', label: 'ZJD — Harish Pillai (Z4–Z5)', group: 'Department' },
];

const GROUPS = ['Applicant', 'Department', 'Executive', 'Support'];

export function DemoAccountPicker({
  demoPassword,
  onPick,
}: {
  demoPassword: string;
  onPick: (email: string) => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="rounded border border-warning/30 bg-warning-bg">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <div className="min-w-0">
          <p className="text-small font-medium text-warning">Demo accounts</p>
          <p className="truncate text-caption text-warning/80">
            All use the password <code className="font-mono">{demoPassword}</code>
          </p>
        </div>
        <ChevronDown className={cn('size-4 shrink-0 text-warning transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-warning/20 px-3 py-3">
          {GROUPS.map((group) => (
            <div key={group}>
              <p className="pb-1 text-caption font-semibold uppercase tracking-wide text-warning/70">
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
                    className="rounded border border-warning/30 bg-surface px-2 py-1 text-caption text-text transition-colors hover:border-warning hover:bg-surface-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
  );
}
