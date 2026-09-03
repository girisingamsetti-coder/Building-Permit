import 'server-only';
import { randomBytes, createHash } from 'node:crypto';
import { prisma } from '@/server/db/prisma';
import { env } from '@/server/config/env';
import { hashPassword, verifyPassword } from '@/server/auth/password';
import {
  signAccessToken,
  generateRefreshToken,
  hashToken,
} from '@/server/auth/tokens';
import {
  setSessionCookies,
  clearSessionCookies,
  readAccessClaims,
  readRefreshToken,
  idleExpiry,
  absoluteExpiry,
} from '@/server/auth/session';
import { audit } from './audit';
import { AUDIT_ACTIONS } from '@/lib/constants';
import { badRequest, unauthorized } from '@/server/http/errors';

/**
 * Sign-in, sign-out and password lifecycle.
 *
 * Two principles run through all of it:
 *
 *  1. **Never leak whether an account exists.** Bad password, unknown email,
 *     deactivated account and locked account all produce the same message.
 *     Forgot-password always returns the same response.
 *  2. **Every outcome is recorded.** `login_attempts` for rate-limit and
 *     lockout arithmetic, `audit_logs` for the trail.
 */

type RequestMeta = { ip: string; userAgent: string; correlationId?: string };

/** Deliberately identical for every failure mode. */
const SIGN_IN_FAILED = 'Those sign-in details are not correct.';

export async function signIn(email: string, password: string, meta: RequestMeta) {
  const normalised = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalised },
    select: {
      id: true,
      name: true,
      email: true,
      passwordHash: true,
      status: true,
      deletedAt: true,
      lockedUntil: true,
      failedLoginCount: true,
      mustChangePassword: true,
      roles: { select: { role: { select: { key: true } } } },
    },
  });

  // Timing: a missing user would otherwise return noticeably faster than a
  // wrong password, which is itself an account-existence oracle. Hash a dummy
  // so both paths pay the Argon2 cost.
  if (!user || user.deletedAt) {
    await verifyPassword(password, DUMMY_HASH);
    await recordAttempt(normalised, meta, false, 'no_such_user');
    throw unauthorized(SIGN_IN_FAILED);
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await recordAttempt(normalised, meta, false, 'locked');
    throw unauthorized(SIGN_IN_FAILED);
  }

  if (user.status !== 'ACTIVE') {
    await verifyPassword(password, DUMMY_HASH);
    await recordAttempt(normalised, meta, false, `status_${user.status.toLowerCase()}`);
    throw unauthorized(SIGN_IN_FAILED);
  }

  const ok = await verifyPassword(password, user.passwordHash);

  if (!ok) {
    const failures = user.failedLoginCount + 1;
    const shouldLock = failures >= env.maxFailedLogins;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failures,
        ...(shouldLock
          ? {
              status: 'LOCKED',
              lockedUntil: new Date(Date.now() + env.lockoutMinutes * 60_000),
            }
          : {}),
      },
    });

    await recordAttempt(normalised, meta, false, shouldLock ? 'locked_now' : 'bad_password');

    await prisma.$transaction((tx) =>
      audit(tx, {
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        entityType: 'User',
        entityId: user.id,
        remarks: shouldLock ? `Locked after ${failures} failed attempts` : `Failed attempt ${failures}`,
        ip: meta.ip,
        userAgent: meta.userAgent,
        correlationId: meta.correlationId,
      })
    );

    throw unauthorized(SIGN_IN_FAILED);
  }

  // ── Success ───────────────────────────────────────────────────────────
  const now = new Date();
  const refreshToken = generateRefreshToken();

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      ip: meta.ip,
      userAgent: meta.userAgent,
      expiresAt: idleExpiry(now),
      absoluteUntil: absoluteExpiry(now),
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
  });

  await recordAttempt(normalised, meta, true, '');

  await prisma.$transaction((tx) =>
    audit(tx, {
      actor: { id: user.id, name: user.name, roleKeys: user.roles.map((r) => r.role.key) },
      action: AUDIT_ACTIONS.LOGIN_SUCCEEDED,
      entityType: 'User',
      entityId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    })
  );

  const accessToken = await signAccessToken({ sub: user.id, sid: session.id });
  await setSessionCookies(accessToken, refreshToken);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roleKeys: user.roles.map((r) => r.role.key),
    mustChangePassword: user.mustChangePassword,
  };
}

export async function signOut(meta: RequestMeta) {
  const claims = await readAccessClaims();

  if (claims) {
    await prisma.session.updateMany({
      where: { id: claims.sid, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'signed_out' },
    });

    await prisma.$transaction((tx) =>
      audit(tx, {
        action: AUDIT_ACTIONS.LOGOUT,
        entityType: 'Session',
        entityId: claims.sid,
        ip: meta.ip,
        userAgent: meta.userAgent,
        correlationId: meta.correlationId,
      })
    );
  }

  await clearSessionCookies();
}

/**
 * Slides the idle window and rotates the refresh token.
 *
 * Rotation matters: a stolen refresh token is usable exactly once, and the
 * legitimate holder's next refresh fails, which surfaces the theft.
 */
export async function refreshSession(meta: RequestMeta) {
  const token = await readRefreshToken();
  if (!token) throw unauthorized();

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  const now = new Date();

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt < now ||
    session.absoluteUntil < now ||
    session.user.deletedAt ||
    session.user.status !== 'ACTIVE'
  ) {
    await clearSessionCookies();
    throw unauthorized();
  }

  const nextRefresh = generateRefreshToken();

  await prisma.session.update({
    where: { id: session.id },
    data: {
      tokenHash: hashToken(nextRefresh),
      lastSeenAt: now,
      // Never past the absolute ceiling.
      expiresAt: new Date(Math.min(idleExpiry(now).getTime(), session.absoluteUntil.getTime())),
      ip: meta.ip,
    },
  });

  const accessToken = await signAccessToken({ sub: session.userId, sid: session.id });
  await setSessionCookies(accessToken, nextRefresh);

  return { ok: true };
}

/**
 * Always returns the same shape, whether or not the address exists — the
 * response must not be an account-existence oracle.
 */
export async function requestPasswordReset(email: string, meta: RequestMeta) {
  const normalised = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalised } });

  if (user && !user.deletedAt && user.status === 'ACTIVE') {
    const token = randomBytes(32).toString('base64url');

    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 30 * 60_000),
        requestIp: meta.ip,
      },
    });

    await prisma.$transaction((tx) =>
      audit(tx, {
        action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
        entityType: 'User',
        entityId: user.id,
        ip: meta.ip,
        userAgent: meta.userAgent,
        correlationId: meta.correlationId,
      })
    );

    const link = `${env.appUrl}/reset-password/${token}`;

    // Phase 9 replaces this with the notification dispatcher. Logging the link
    // is what makes the flow testable today, and it is gated on demo mode so a
    // real deployment cannot print reset links to its logs.
    if (env.demoMode || !env.isProduction) {
      console.log(`[auth] password reset for ${user.email}: ${link}`);
    }
  }

  return { ok: true };
}

export async function resetPassword(token: string, newPassword: string, meta: RequestMeta) {
  const tokenHash = createHash('sha256').update(token).digest('hex');

  const reset = await prisma.passwordReset.findUnique({ where: { tokenHash } });

  if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
    throw badRequest('This reset link has expired or has already been used. Request a new one.');
  }

  const user = await prisma.user.findUnique({ where: { id: reset.userId } });
  if (!user || user.deletedAt) {
    throw badRequest('This reset link is no longer valid.');
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        failedLoginCount: 0,
        lockedUntil: null,
        // A locked-out user resetting their password is unlocked by doing so.
        status: user.status === 'LOCKED' ? 'ACTIVE' : user.status,
      },
    });

    await tx.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } });

    // Every other session is revoked: if the reset was prompted by a
    // compromise, the attacker's session must not survive it.
    await tx.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'password_reset' },
    });

    await audit(tx, {
      actor: { id: user.id, name: user.name },
      action: AUDIT_ACTIONS.PASSWORD_CHANGED,
      entityType: 'User',
      entityId: user.id,
      remarks: 'Reset via emailed link',
      ip: meta.ip,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });
  });

  return { ok: true };
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  meta: RequestMeta & { sessionId: string }
) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw badRequest('Your current password is not correct.');
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false },
    });

    // Other sessions go; the one changing the password stays signed in.
    await tx.session.updateMany({
      where: { userId: user.id, revokedAt: null, id: { not: meta.sessionId } },
      data: { revokedAt: new Date(), revokedReason: 'password_changed' },
    });

    await audit(tx, {
      actor: { id: user.id, name: user.name },
      action: AUDIT_ACTIONS.PASSWORD_CHANGED,
      entityType: 'User',
      entityId: user.id,
      remarks: 'Changed by the account holder',
      ip: meta.ip,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });
  });

  return { ok: true };
}

// ── Internals ─────────────────────────────────────────────────────────────

async function recordAttempt(email: string, meta: RequestMeta, success: boolean, reason: string) {
  await prisma.loginAttempt.create({
    data: { email, ip: meta.ip, success, reason },
  });
}

/**
 * A real Argon2id hash of a value nobody knows, used to equalise the timing of
 * the unknown-account path. Generated once per process.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$3rBBnKPFEYr5nVGh5N0Yjm1qHVvBw8dJ4hMHqvBqQ0M';
