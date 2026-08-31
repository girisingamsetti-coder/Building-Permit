import { CAPABILITIES as C, ROLES, type Capability, type RoleKey } from './constants';

/**
 * THE permission matrix — docs/04-rbac.md H.4, as code.
 *
 * One source of truth, read by three things: the seed that writes
 * `role_permissions`, the generated RBAC test suite, and the admin role
 * editor's "reset to default" action. A matrix that lives only in a document
 * becomes a document that lies; this one cannot drift from the database
 * without the seed test failing.
 *
 * Two grants deserve their absence explained:
 *
 *  · SYSTEM_ADMIN holds NO approval capability. An administrator configures
 *    the system; they do not decide applications. They *can* grant it to
 *    themselves through ROLE_MANAGE, but that act is audited and conspicuous,
 *    which is the intended deterrent.
 *
 *  · There is no SCRUTINY_OVERRIDE anywhere. The only route past a failed
 *    scrutiny is correct → new drawing version → re-scrutiny (D4).
 */

/** Read-only capabilities every departmental role shares. */
const OFFICER_BASE: Capability[] = [
  C.APPLICATION_VIEW,
  C.DRAWING_VIEW,
  C.DRAWING_DOWNLOAD,
  C.SCRUTINY_VIEW,
  C.DOCUMENT_VIEW,
  C.DOCUMENT_DOWNLOAD,
  C.DOCUMENT_VERIFY,
  C.FEE_VIEW,
  C.PAYMENT_VIEW,
  C.WORKFLOW_VIEW,
  C.WORKFLOW_CLAIM_TASK,
  C.WORKFLOW_FORWARD,
  C.WORKFLOW_RETURN,
  C.SHORTFALL_CREATE,
  C.SHORTFALL_VIEW,
  C.SHORTFALL_RESOLVE,
  C.ORDER_VIEW,
  C.AUDIT_VIEW,
  C.REPORT_VIEW,
];

/** Everything a reader may see. No write capability appears here. */
const READ_ONLY: Capability[] = [
  C.APPLICATION_VIEW,
  C.APPLICATION_VIEW_ALL,
  C.DRAWING_VIEW,
  C.DRAWING_DOWNLOAD,
  C.SCRUTINY_VIEW,
  C.DOCUMENT_VIEW,
  C.DOCUMENT_DOWNLOAD,
  C.FEE_VIEW,
  C.PAYMENT_VIEW,
  C.WORKFLOW_VIEW,
  C.SHORTFALL_VIEW,
  C.ORDER_VIEW,
  C.AUDIT_VIEW,
  C.REPORT_VIEW,
  C.ANALYTICS_VIEW,
];

export const RBAC_MATRIX: Record<RoleKey, Capability[]> = {
  // ── Licensed Technical Person: files and answers ──────────────────────
  [ROLES.LTP]: [
    C.APPLICATION_CREATE,
    C.APPLICATION_VIEW,
    C.APPLICATION_EDIT,
    C.APPLICATION_DELETE,
    C.APPLICATION_WITHDRAW,
    C.DRAWING_UPLOAD,
    C.DRAWING_VIEW,
    C.DRAWING_DOWNLOAD,
    C.SCRUTINY_REQUEST,
    C.SCRUTINY_VIEW,
    C.DOCUMENT_UPLOAD,
    C.DOCUMENT_VIEW,
    C.DOCUMENT_DOWNLOAD,
    C.FEE_VIEW,
    C.PAYMENT_INITIATE,
    C.PAYMENT_VIEW,
    C.WORKFLOW_VIEW,
    C.SHORTFALL_VIEW,
    C.SHORTFALL_RESPOND,
    C.ORDER_VIEW,
    C.AUDIT_VIEW,
  ],

  // ── Town Planning Assistant: first departmental desk ──────────────────
  [ROLES.TPA]: [
    ...OFFICER_BASE,
    // Re-runs scrutiny on a corrected drawing, and raises fee shortfalls,
    // which issues a demand.
    C.SCRUTINY_REQUEST,
    C.FEE_GENERATE,
  ],

  // ── Zonal Assistant / Deputy Director ─────────────────────────────────
  // Identical grants: the requirement treats them as one review step.
  // Whether they are alternates by zone or two desks is Q4.
  [ROLES.ZAD]: [...OFFICER_BASE, C.WORKFLOW_REASSIGN, C.ANALYTICS_VIEW],
  [ROLES.ZDD]: [...OFFICER_BASE, C.WORKFLOW_REASSIGN, C.ANALYTICS_VIEW],

  // ── Zonal Joint Director: may report a fee shortfall and forward ──────
  [ROLES.ZJD]: [...OFFICER_BASE, C.WORKFLOW_REASSIGN, C.ANALYTICS_VIEW, C.FEE_GENERATE],

  // ── Director (Development Plan): city-wide remit ──────────────────────
  [ROLES.DIRECTOR_DP]: [
    ...OFFICER_BASE,
    C.APPLICATION_VIEW_ALL,
    C.WORKFLOW_REASSIGN,
    C.ANALYTICS_VIEW,
    C.FEE_GENERATE,
  ],

  [ROLES.ADDL_COMMISSIONER]: [
    ...OFFICER_BASE,
    C.APPLICATION_VIEW_ALL,
    C.WORKFLOW_REASSIGN,
    C.ANALYTICS_VIEW,
    C.FEE_GENERATE,
  ],

  // ── Commissioner: the only role that may decide an application ────────
  [ROLES.COMMISSIONER]: [
    ...OFFICER_BASE,
    C.APPLICATION_VIEW_ALL,
    C.WORKFLOW_REASSIGN,
    C.ANALYTICS_VIEW,
    C.FEE_GENERATE,
    C.FEE_WAIVE,
    C.APPLICATION_APPROVE,
    C.APPLICATION_REJECT,
    C.ORDER_REVOKE,
  ],

  // ── Finance: money only, no workflow action ───────────────────────────
  [ROLES.FINANCE_OFFICER]: [
    C.APPLICATION_VIEW,
    C.APPLICATION_VIEW_ALL,
    C.DOCUMENT_VIEW,
    C.DOCUMENT_DOWNLOAD,
    C.FEE_VIEW,
    C.FEE_GENERATE,
    C.FEE_STRUCTURE_MANAGE,
    C.PAYMENT_VIEW,
    C.PAYMENT_RECONCILE,
    C.PAYMENT_REFUND,
    C.WORKFLOW_VIEW,
    C.SHORTFALL_VIEW,
    C.ORDER_VIEW,
    C.AUDIT_VIEW,
    C.REPORT_VIEW,
    C.ANALYTICS_VIEW,
  ],

  // ── System administrator: configures, never decides ───────────────────
  [ROLES.SYSTEM_ADMIN]: [
    C.APPLICATION_VIEW,
    C.APPLICATION_VIEW_ALL,
    C.APPLICATION_EDIT,
    C.APPLICATION_DELETE,
    C.APPLICATION_WITHDRAW,
    C.DRAWING_VIEW,
    C.DRAWING_DOWNLOAD,
    C.SCRUTINY_REQUEST,
    C.SCRUTINY_VIEW,
    C.DOCUMENT_VIEW,
    C.DOCUMENT_DOWNLOAD,
    C.FEE_VIEW,
    C.FEE_GENERATE,
    C.FEE_STRUCTURE_MANAGE,
    C.PAYMENT_VIEW,
    C.PAYMENT_RECONCILE,
    C.WORKFLOW_VIEW,
    C.WORKFLOW_REASSIGN,
    C.WORKFLOW_MANAGE,
    C.SHORTFALL_VIEW,
    C.ORDER_VIEW,
    C.USER_MANAGE,
    C.ROLE_MANAGE,
    C.ORG_MANAGE,
    C.MASTER_DATA_MANAGE,
    C.SETTINGS_MANAGE,
    C.NOTIFICATION_TEMPLATE_MANAGE,
    C.INTEGRATION_MANAGE,
    C.AUDIT_VIEW,
    C.REPORT_VIEW,
    C.ANALYTICS_VIEW,
    C.NOTIFICATION_LOG_VIEW,
  ],

  // ── Auditor: reads everything, writes nothing ─────────────────────────
  // Writes are additionally rejected at the route wrapper, so a
  // misconfiguration here still cannot make this account dangerous.
  [ROLES.VIEWER]: READ_ONLY,
};

/** Human-readable role metadata, used by the seed and the admin UI. */
export const ROLE_META: Record<RoleKey, { name: string; description: string; rank: number }> = {
  [ROLES.LTP]: {
    name: 'Licensed Technical Person',
    description: 'Files applications, uploads drawings and documents, pays fees, answers shortfalls.',
    rank: 10,
  },
  [ROLES.TPA]: {
    name: 'Town Planning Assistant',
    description: 'First departmental review. Technical scrutiny, document verification, shortfalls.',
    rank: 20,
  },
  [ROLES.ZAD]: {
    name: 'Zonal Assistant Director',
    description: 'Zonal review.',
    rank: 30,
  },
  [ROLES.ZDD]: {
    name: 'Zonal Deputy Director',
    description: 'Zonal review.',
    rank: 30,
  },
  [ROLES.ZJD]: {
    name: 'Zonal Joint Director',
    description: 'Zonal review. May report a fee shortfall and still forward.',
    rank: 40,
  },
  [ROLES.DIRECTOR_DP]: {
    name: 'Director (Development Plan)',
    description: 'City-wide review. May report a shortfall and still forward.',
    rank: 50,
  },
  [ROLES.ADDL_COMMISSIONER]: {
    name: 'Additional Commissioner',
    description: 'Penultimate review before the Commissioner.',
    rank: 60,
  },
  [ROLES.COMMISSIONER]: {
    name: 'Commissioner',
    description: 'Final approval authority. The only role that may approve or reject.',
    rank: 70,
  },
  [ROLES.FINANCE_OFFICER]: {
    name: 'Finance Officer',
    description: 'Fee structures, payment reconciliation and refunds.',
    rank: 45,
  },
  [ROLES.SYSTEM_ADMIN]: {
    name: 'System Administrator',
    description: 'Users, roles, workflow configuration and settings. Holds no approval authority.',
    rank: 90,
  },
  [ROLES.VIEWER]: {
    name: 'Viewer / Auditor',
    description: 'Read-only across the register. Every write is refused at the route boundary.',
    rank: 5,
  },
};

/** Where each role lands after signing in. */
export const ROLE_LANDING: Record<RoleKey, string> = {
  [ROLES.LTP]: '/dashboard',
  [ROLES.TPA]: '/dashboard',
  [ROLES.ZAD]: '/dashboard',
  [ROLES.ZDD]: '/dashboard',
  [ROLES.ZJD]: '/dashboard',
  [ROLES.DIRECTOR_DP]: '/dashboard',
  [ROLES.ADDL_COMMISSIONER]: '/dashboard',
  [ROLES.COMMISSIONER]: '/dashboard',
  [ROLES.FINANCE_OFFICER]: '/dashboard',
  [ROLES.SYSTEM_ADMIN]: '/admin',
  [ROLES.VIEWER]: '/dashboard',
};

/** Which dashboard a role sees at /dashboard. */
export type DashboardKind = 'ltp' | 'officer' | 'executive' | 'finance' | 'admin' | 'viewer';

/**
 * `viewer` is separated from `officer` deliberately.
 *
 * An auditor holds no stage and therefore has no task queue, so the officer
 * dashboard would greet them with four tiles reading zero and a "nothing at
 * your desk" panel — which is accurate and useless. They get the oversight
 * figures instead, with none of the action links they could not use anyway.
 */
export function dashboardFor(roleKeys: RoleKey[]): DashboardKind {
  if (roleKeys.includes(ROLES.SYSTEM_ADMIN)) return 'admin';
  if (roleKeys.includes(ROLES.LTP)) return 'ltp';
  if (roleKeys.includes(ROLES.FINANCE_OFFICER)) return 'finance';
  if (
    roleKeys.includes(ROLES.COMMISSIONER) ||
    roleKeys.includes(ROLES.ADDL_COMMISSIONER) ||
    roleKeys.includes(ROLES.DIRECTOR_DP)
  ) {
    return 'executive';
  }
  if (roleKeys.includes(ROLES.VIEWER)) return 'viewer';
  return 'officer';
}
