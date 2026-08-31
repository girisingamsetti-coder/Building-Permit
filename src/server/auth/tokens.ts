import 'server-only';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { createHash, randomBytes } from 'node:crypto';
import { env } from '@/server/config/env';

/**
 * Access tokens carry IDENTITY ONLY.
 *
 * Role and capabilities are never put in the token — they are re-read from the
 * database on every request (see context.ts), so suspending an account or
 * changing its role takes effect on the next request rather than whenever the
 * token happens to expire.
 */

const secret = new TextEncoder().encode(env.authSecret);
const ISSUER = 'lams';
const AUDIENCE = 'lams-web';

export type AccessClaims = {
  /** User id. */
  sub: string;
  /** Session id — lets a revoked session invalidate tokens minted from it. */
  sid: string;
};

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  return new SignJWT({ sid: claims.sid })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${env.accessTokenTtlMinutes}m`)
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER, audience: AUDIENCE });
    return claimsFrom(payload);
  } catch {
    // Expired, tampered, or malformed — all resolve to "no session".
    return null;
  }
}

function claimsFrom(payload: JWTPayload): AccessClaims | null {
  const sub = payload.sub;
  const sid = payload.sid;
  if (typeof sub !== 'string' || typeof sid !== 'string') return null;
  return { sub, sid };
}

/**
 * Refresh tokens are opaque random strings. Only their hash is stored, so a
 * database leak does not yield usable session tokens.
 */
export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
