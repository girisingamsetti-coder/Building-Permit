'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogOut, User as UserIcon, KeyRound, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { initials } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/toast';

export function ProfileMenu({
  name,
  email,
  roleNames,
}: {
  name: string;
  email: string;
  roleNames: string[];
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = React.useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      // A hard navigation, not router.push: it discards every cached server
      // component so the next user of this browser cannot see the last one's
      // rendered pages.
      window.location.href = '/login';
    } catch {
      setSigningOut(false);
      toast.error('Could not sign out', {
        description: 'Check your connection and try again.',
      });
      router.refresh();
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 rounded p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={`Account menu for ${name}`}
        >
          <Avatar>
            <AvatarFallback>{initials(name)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <p className="truncate text-small font-semibold text-text">{name}</p>
          <p className="truncate text-caption text-text-muted">{email}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {roleNames.map((role) => (
              <Badge key={role} tone="info">
                {role}
              </Badge>
            ))}
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/profile">
            <UserIcon className="size-4" />
            Profile
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href="/profile?changePassword=1">
            <KeyRound className="size-4" />
            Change password
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem destructive onSelect={(e) => { e.preventDefault(); void signOut(); }}>
          {signingOut ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
