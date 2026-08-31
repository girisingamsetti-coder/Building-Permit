import 'server-only';
import { cookies } from 'next/headers';
import { env } from '@/server/config/env';
import { verifyAccessToken, type AccessClaims } from './tokens';

/**
 * Cookie handling for the session pair.
 *
 * Both cookies are httpOnly and SameSite=Lax — Lax rather than Strict so that
 * a payment gateway's top-level redirect back to the return page still carries
 * the session, which Strict would drop.
 */

export const ACCESS_COOKIE = 'lams_at';
export const REFRESH_COOKIE = 'lams_rt';

const base = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.isProduction,
  path: '/',
} as const;

export async function setSessionCookies(accessToken: string, refreshToken: string) {
  const jar = await cookies();

  jar.set(ACCESS_COOKIE, accessToken, {
    ...base,
    maxAge: env.accessTokenTtlMinutes * 60,
  });

  jar.set(REFRESH_COOKIE, refreshToken, {
    ...base,
    // The refresh cookie must outlive the access token, but never outlive the
    // session's absolute ceiling.
    maxAge: env.sessionAbsoluteTtlHours * 60 * 60,
  });
}

export async function clearSessionCookies() {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, '', { ...base, maxAge: 0 });
  jar.set(REFRESH_COOKIE, '', { ...base, maxAge: 0 });
}

export async function readAccessClaims(): Promise<AccessClaims | null> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  return verifyAccessToken(token);
}

export async function readRefreshToken(): Promise<string | null> {
  return (await cookies()).get(REFRESH_COOKIE)?.value ?? null;
}

/** Idle expiry, slid forward each time a session is used. */
export function idleExpiry(from = new Date()): Date {
  return new Date(from.getTime() + env.sessionIdleTtlHours * 60 * 60 * 1000);
}

/** Hard ceiling, set once at sign-in and never extended. */
export function absoluteExpiry(from = new Date()): Date {
  return new Date(from.getTime() + env.sessionAbsoluteTtlHours * 60 * 60 * 1000);
}
