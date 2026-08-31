import 'server-only';
import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id. Parameters follow the OWASP Password Storage Cheat Sheet's
 * second recommended configuration: 19 MiB of memory, 2 iterations, 1 degree
 * of parallelism.
 */
const OPTIONS = {
  memoryCost: 19_456, // KiB
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

/**
 * Never throws on a malformed stored hash — a corrupt row must read as
 * "wrong password", not as a 500 that tells an attacker something.
 */
export async function verifyPassword(plain: string, storedHash: string): Promise<boolean> {
  try {
    return await verify(storedHash, plain);
  } catch {
    return false;
  }
}

/**
 * Minimum password policy. Deliberately modest and length-led: composition
 * rules push people toward `Password1!`, length does not.
 */
export function checkPasswordStrength(password: string): { ok: boolean; message: string } {
  if (password.length < 10) {
    return { ok: false, message: 'Use at least 10 characters.' };
  }
  if (password.length > 200) {
    return { ok: false, message: 'That password is too long.' };
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return { ok: false, message: 'Include at least one letter and one number.' };
  }
  return { ok: true, message: '' };
}
