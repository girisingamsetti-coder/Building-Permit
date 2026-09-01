import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/db/prisma';
import { forbidden } from '@/server/http/errors';
import { isCitywide, isLtp, isSystemAdmin, type AuthUser } from './context';

/**
 * Layer 2 of the authorization model: row scope.
 *
 * The fragment is MERGED INTO the query rather than applied after the fetch.
 * That matters for three reasons: the database never returns a row the caller
 * may not see, pagination counts stay correct, and an out-of-scope row is
 * never loaded into memory where a later refactor might leak it.
 */

export function applicationScope(user: AuthUser): Prisma.ApplicationWhereInput {
  if (isSystemAdmin(user)) return {};

  // An LTP sees only what it filed.
  if (isLtp(user)) return { ltpUserId: user.id };

  // Director, Additional Commissioner, Commissioner, Finance and Viewer have a
  // city-wide remit.
  if (isCitywide(user)) return {};

  // Zonal officers see their jurisdiction. An application with no zone yet
  // (still a draft) is visible to nobody at this level.
  //
  // An officer with NO jurisdiction sees nothing, and that is expressed as an
  // empty `in` rather than a sentinel value. `['__none__']` reads as the same
  // intent but is not a UUID, so Postgres failed the cast and the officer's
  // register answered 500 instead of "nothing here yet" — reachable the moment
  // an administrator creates a zonal account and forgets to assign its zone.
  return { zoneId: { in: user.zoneIds } };
}

/**
 * Throws 403 unless the application exists, is not archived, and is in scope.
 *
 * Deliberately returns the same error whether the row is missing or merely
 * out of scope — distinguishing them tells an attacker which application
 * numbers exist.
 */
export async function assertApplicationAccess(user: AuthUser, applicationId: string) {
  const found = await prisma.application.findFirst({
    where: { id: applicationId, deletedAt: null, ...applicationScope(user) },
    select: { id: true, applicationNumber: true, status: true, currentStageCode: true },
  });

  if (!found) throw forbidden('You do not have access to this application.');
  return found;
}

/**
 * Task queue scope: the desks this user works at, within their jurisdiction.
 *
 * Scoped by the STAGE's owner roles rather than by the task's own
 * `assignedRoleKey`, and the difference is not academic. A stage owned by both
 * ZAD and ZDD produces tasks addressed to one of them; matching on the task's
 * role alone would hide a ZAD-addressed file from the ZDD who shares the desk,
 * and the file would sit in a queue that looks empty to the person expected to
 * work it.
 *
 * A CLAIMED task is deliberately still visible to the rest of the desk. Seeing
 * that a colleague holds a file is how somebody stops waiting for it; the
 * engine, not this fragment, is what stops them acting on it.
 */
export function taskScope(user: AuthUser): Prisma.WorkflowTaskWhereInput {
  if (isSystemAdmin(user)) return {};

  // An applicant's queue is their own files, and only those. Scoping them by
  // zone as though they were an officer would hide their own parked
  // application from them — an LTP holds no jurisdiction, which is correct for
  // an officer's inbox and exactly wrong for theirs.
  if (isLtp(user)) return { instance: { application: { ltpUserId: user.id } } };

  if (isCitywide(user)) return {};

  return {
    OR: [{ zoneId: { in: user.zoneIds } }, { zoneId: null }],
  };
}
