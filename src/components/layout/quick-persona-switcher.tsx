'use client';

import * as React from 'react';
import { UserCheck, Sparkles, Check, ChevronDown, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

const PERSONAS = [
  {
    name: 'Super Administrator',
    role: 'Super Admin',
    email: 'admin.demo@example.com',
    desc: 'Full system oversight & configuration',
    badge: 'Admin',
    color: 'text-purple-600 bg-purple-50 border-purple-200',
  },
  {
    name: 'Ravi Kumar (LTP)',
    role: 'Licensed Architect',
    email: 'ltp.demo@example.com',
    desc: 'Submit plans, upload drawings, pay fees',
    badge: 'Applicant',
    color: 'text-blue-600 bg-blue-50 border-blue-200',
  },
  {
    name: 'P. Venkat Rao (TPA)',
    role: 'Town Planning Assistant',
    email: 'tpa.demo@example.com',
    desc: 'Scrutiny verification & fee demands',
    badge: 'Department',
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  },
  {
    name: 'K. Ramesh Babu (ZAD)',
    role: 'Zonal Assistant Director',
    email: 'zad.demo@example.com',
    desc: 'Technical inspection & desk approvals',
    badge: 'Department',
    color: 'text-amber-600 bg-amber-50 border-amber-200',
  },
  {
    name: 'S. Vijay Kumar (ZJD)',
    role: 'Zonal Joint Director',
    email: 'zjd.demo@example.com',
    desc: 'Intermediate planning sanction',
    badge: 'Department',
    color: 'text-amber-700 bg-amber-50 border-amber-200',
  },
  {
    name: 'Smt. M. Padmavathi IAS',
    role: 'Commissioner',
    email: 'commissioner.demo@example.com',
    desc: 'Final statutory sanction order issuance',
    badge: 'Executive',
    color: 'text-rose-600 bg-rose-50 border-rose-200',
  },
];

export function QuickPersonaSwitcher({ currentEmail }: { currentEmail: string }) {
  const [switchingTo, setSwitchingTo] = React.useState<string | null>(null);

  async function switchPersona(email: string) {
    if (email === currentEmail || switchingTo) return;
    setSwitchingTo(email);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'Demo@12345' }),
      });

      if (!res.ok) {
        throw new Error('Failed to switch persona');
      }

      toast.success('Switched desk', {
        description: `Now active on ${email}`,
      });

      // Reload to ensure all server layouts and session caches refresh
      window.location.href = '/dashboard';
    } catch {
      setSwitchingTo(null);
      toast.error('Could not switch desk', {
        description: 'Check your connection and try again.',
      });
    }
  }

  const activePersona = PERSONAS.find((p) => p.email === currentEmail);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-caption font-medium text-primary',
            'transition-all duration-150 hover:bg-primary/10 hover:border-primary/30 active:scale-[0.98]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
          )}
          aria-label="Switch officer desk"
        >
          {switchingTo ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5 text-primary" />
          )}
          <span className="hidden sm:inline font-semibold">
            {activePersona ? activePersona.role : 'Switch Desk'}
          </span>
          <ChevronDown className="size-3 opacity-70" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-2 shadow-elevated rounded-xl">
        <DropdownMenuLabel className="px-2.5 py-1.5">
          <div className="flex items-center gap-1.5 text-text">
            <UserCheck className="size-4 text-primary" />
            <span className="font-semibold text-small">Department Officer Desk</span>
          </div>
          <p className="mt-0.5 text-caption font-normal text-text-muted">
            Switch officer station or applicant portal view
          </p>
        </DropdownMenuLabel>

        <DropdownMenuSeparator className="my-1.5" />

        <div className="space-y-1">
          {PERSONAS.map((persona) => {
            const isCurrent = persona.email === currentEmail;
            const isSwitching = switchingTo === persona.email;

            return (
              <DropdownMenuItem
                key={persona.email}
                disabled={isCurrent || Boolean(switchingTo)}
                onSelect={(e) => {
                  e.preventDefault();
                  void switchPersona(persona.email);
                }}
                className={cn(
                  'flex items-start gap-2.5 rounded-lg p-2 transition-colors cursor-pointer',
                  isCurrent && 'bg-primary-subtle/50 cursor-default'
                )}
              >
                <div
                  className={cn(
                    'mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border text-caption font-bold',
                    persona.color
                  )}
                >
                  {isSwitching ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : isCurrent ? (
                    <Check className="size-3.5 text-primary" />
                  ) : (
                    persona.badge.charAt(0)
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <p className="truncate text-small font-semibold text-text leading-tight">
                      {persona.name}
                    </p>
                    <span className="shrink-0 rounded-full bg-surface-sunk px-1.5 py-0.2 text-[10px] font-medium text-text-muted">
                      {persona.badge}
                    </span>
                  </div>
                  <p className="text-caption text-text-muted leading-tight mt-0.5">
                    {persona.desc}
                  </p>
                </div>
              </DropdownMenuItem>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
