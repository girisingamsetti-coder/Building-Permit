'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, KeyRound, UserX, UserCheck, Unlock, Copy, Check, ShieldAlert } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { toast } from '@/components/ui/toast';

/**
 * Row actions on the user detail page.
 *
 * Each destructive action confirms with a plain-language statement of what
 * will actually happen — "signs them out of every device", not "are you sure?".
 */
export function UserActions({
  userId,
  userName,
  status,
  isLocked,
  currentRoleKey,
  roles,
  isSelf,
}: {
  userId: string;
  userName: string;
  status: string;
  isLocked: boolean;
  currentRoleKey: string;
  roles: Array<{ key: string; name: string }>;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [dialog, setDialog] = React.useState<'deactivate' | 'activate' | 'reset' | 'role' | null>(null);
  const [temporaryPassword, setTemporaryPassword] = React.useState<string | null>(null);
  const [nextRole, setNextRole] = React.useState(currentRoleKey);
  const [copied, setCopied] = React.useState(false);

  const active = status === 'ACTIVE';

  async function call(url: string, body?: unknown) {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error('That did not work', { description: data.error ?? 'Try again shortly.' });
        return null;
      }
      return data;
    } catch {
      toast.error('Could not reach the server', { description: 'Check your connection and try again.' });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(next: 'ACTIVE' | 'INACTIVE') {
    const data = await call(`/api/admin/users/${userId}/status`, { status: next, reason: '' });
    if (!data) return;
    setDialog(null);
    toast.success(next === 'ACTIVE' ? 'Account activated' : 'Account deactivated', {
      description: next === 'ACTIVE' ? `${userName} can sign in again.` : `${userName} has been signed out.`,
    });
    router.refresh();
  }

  async function resetPassword() {
    const data = await call(`/api/admin/users/${userId}/reset-password`);
    if (!data) return;
    setTemporaryPassword(data.temporaryPassword);
  }

  async function unlock() {
    const data = await call(`/api/admin/users/${userId}/unlock`);
    if (!data) return;
    toast.success('Account unlocked', { description: `${userName} can try signing in again.` });
    router.refresh();
  }

  async function changeRole() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleKey: nextRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error('Could not change the role', { description: data.error ?? 'Try again shortly.' });
        return;
      }
      setDialog(null);
      toast.success('Role updated', {
        description: `${userName} is now ${roles.find((r) => r.key === nextRole)?.name}.`,
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="sm">
            <MoreHorizontal className="size-4" />
            Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog('role')} disabled={isSelf}>
            <ShieldAlert className="size-4" />
            Change role
          </DropdownMenuItem>

          <DropdownMenuItem onSelect={() => setDialog('reset')}>
            <KeyRound className="size-4" />
            Reset password
          </DropdownMenuItem>

          {isLocked && (
            <DropdownMenuItem onSelect={() => void unlock()}>
              <Unlock className="size-4" />
              Unlock account
            </DropdownMenuItem>
          )}

          {active ? (
            <DropdownMenuItem destructive onSelect={() => setDialog('deactivate')} disabled={isSelf}>
              <UserX className="size-4" />
              Deactivate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setDialog('activate')}>
              <UserCheck className="size-4" />
              Activate
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Deactivate */}
      <Dialog open={dialog === 'deactivate'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate {userName}?</DialogTitle>
            <DialogDescription>
              They will be signed out of every device immediately and will not be able to sign in
              again until an administrator reactivates the account. Nothing they have already done is
              removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button variant="destructive" loading={busy} onClick={() => void setStatus('INACTIVE')}>
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Activate */}
      <Dialog open={dialog === 'activate'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Activate {userName}?</DialogTitle>
            <DialogDescription>
              They will be able to sign in with their existing password. Any lockout is cleared.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={() => void setStatus('ACTIVE')}>
              Activate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change role */}
      <Dialog open={dialog === 'role'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change role</DialogTitle>
            <DialogDescription>
              The role decides what {userName} may do. The change takes effect on their next request —
              they do not need to sign out.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label="Role" htmlFor="nextRole">
              <Select value={nextRole} onValueChange={setNextRole}>
                <SelectTrigger id="nextRole">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.key} value={role.key}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={nextRole === currentRoleKey}
              onClick={() => void changeRole()}
            >
              Change role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password */}
      <Dialog
        open={dialog === 'reset' || Boolean(temporaryPassword)}
        onOpenChange={(o) => {
          if (!o) {
            setDialog(null);
            setTemporaryPassword(null);
            if (temporaryPassword) router.refresh();
          }
        }}
      >
        <DialogContent>
          {temporaryPassword ? (
            <>
              <DialogHeader>
                <DialogTitle>Temporary password issued</DialogTitle>
                <DialogDescription>
                  Shown once and not stored in readable form. {userName} has been signed out
                  everywhere and must change this at next sign-in.
                </DialogDescription>
              </DialogHeader>
              <DialogBody>
                <div className="flex items-center gap-2 rounded border border-border bg-surface-sunk px-3 py-2.5">
                  <code className="min-w-0 flex-1 select-all break-all font-mono text-body">
                    {temporaryPassword}
                  </code>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="shrink-0"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(temporaryPassword);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      } catch {
                        toast.error('Could not copy', { description: 'Select it and copy manually.' });
                      }
                    }}
                  >
                    {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </DialogBody>
              <DialogFooter>
                <Button
                  variant="primary"
                  onClick={() => {
                    setTemporaryPassword(null);
                    setDialog(null);
                    router.refresh();
                  }}
                >
                  Done
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Reset {userName}&rsquo;s password?</DialogTitle>
                <DialogDescription>
                  A temporary password is generated and shown to you once. They will be signed out
                  everywhere and asked to set a new password at next sign-in.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setDialog(null)}>
                  Cancel
                </Button>
                <Button variant="primary" loading={busy} onClick={() => void resetPassword()}>
                  Reset password
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
