/**
 * Shared vocabulary. Isomorphic — importable from server and client alike.
 *
 * These keys are the contract between the seed, the RBAC matrix, the route
 * guards and the UI. They are typed as literal unions so a typo is a compile
 * error rather than a silent permission failure.
 */

// ── Roles ────────────────────────────────────────────────────────────────

export const ROLES = {
  LTP: 'LTP',
  TPA: 'TPA',
  ZAD: 'ZAD',
  ZDD: 'ZDD',
  ZJD: 'ZJD',
  DIRECTOR_DP: 'DIRECTOR_DP',
  ADDL_COMMISSIONER: 'ADDL_COMMISSIONER',
  COMMISSIONER: 'COMMISSIONER',
  FINANCE_OFFICER: 'FINANCE_OFFICER',
  SYSTEM_ADMIN: 'SYSTEM_ADMIN',
  VIEWER: 'VIEWER',
} as const;

export type RoleKey = (typeof ROLES)[keyof typeof ROLES];

/** Departmental review roles, in escalation order. */
export const REVIEW_ROLES: RoleKey[] = [
  ROLES.TPA,
  ROLES.ZAD,
  ROLES.ZDD,
  ROLES.ZJD,
  ROLES.DIRECTOR_DP,
  ROLES.ADDL_COMMISSIONER,
  ROLES.COMMISSIONER,
];

/** Roles whose remit is city-wide rather than zonal. */
export const CITYWIDE_ROLES: RoleKey[] = [
  ROLES.DIRECTOR_DP,
  ROLES.ADDL_COMMISSIONER,
  ROLES.COMMISSIONER,
  ROLES.FINANCE_OFFICER,
  ROLES.SYSTEM_ADMIN,
  ROLES.VIEWER,
];

// ── Capabilities ─────────────────────────────────────────────────────────
//
// 46 keys. `SCRUTINY_OVERRIDE` is deliberately absent: the business has not
// authorised officers to override a failed scrutiny result, and the only route
// past a failure is correct → new version → re-scrutiny.
// See docs/04-rbac.md H.3.1.

export const CAPABILITIES = {
  // Applications
  APPLICATION_CREATE: 'APPLICATION_CREATE',
  APPLICATION_VIEW: 'APPLICATION_VIEW',
  APPLICATION_VIEW_ALL: 'APPLICATION_VIEW_ALL',
  APPLICATION_EDIT: 'APPLICATION_EDIT',
  APPLICATION_DELETE: 'APPLICATION_DELETE',
  APPLICATION_WITHDRAW: 'APPLICATION_WITHDRAW',

  // Drawings
  DRAWING_UPLOAD: 'DRAWING_UPLOAD',
  DRAWING_VIEW: 'DRAWING_VIEW',
  DRAWING_DOWNLOAD: 'DRAWING_DOWNLOAD',

  // Scrutiny
  SCRUTINY_REQUEST: 'SCRUTINY_REQUEST',
  SCRUTINY_VIEW: 'SCRUTINY_VIEW',

  // Documents
  DOCUMENT_UPLOAD: 'DOCUMENT_UPLOAD',
  DOCUMENT_VIEW: 'DOCUMENT_VIEW',
  DOCUMENT_DOWNLOAD: 'DOCUMENT_DOWNLOAD',
  DOCUMENT_VERIFY: 'DOCUMENT_VERIFY',

  // Fees
  FEE_VIEW: 'FEE_VIEW',
  FEE_GENERATE: 'FEE_GENERATE',
  FEE_WAIVE: 'FEE_WAIVE',
  FEE_STRUCTURE_MANAGE: 'FEE_STRUCTURE_MANAGE',

  // Payments
  PAYMENT_INITIATE: 'PAYMENT_INITIATE',
  PAYMENT_VIEW: 'PAYMENT_VIEW',
  PAYMENT_RECONCILE: 'PAYMENT_RECONCILE',
  PAYMENT_REFUND: 'PAYMENT_REFUND',

  // Workflow
  WORKFLOW_VIEW: 'WORKFLOW_VIEW',
  WORKFLOW_CLAIM_TASK: 'WORKFLOW_CLAIM_TASK',
  WORKFLOW_FORWARD: 'WORKFLOW_FORWARD',
  WORKFLOW_RETURN: 'WORKFLOW_RETURN',
  WORKFLOW_REASSIGN: 'WORKFLOW_REASSIGN',
  WORKFLOW_MANAGE: 'WORKFLOW_MANAGE',

  // Shortfalls
  SHORTFALL_CREATE: 'SHORTFALL_CREATE',
  SHORTFALL_VIEW: 'SHORTFALL_VIEW',
  SHORTFALL_RESPOND: 'SHORTFALL_RESPOND',
  SHORTFALL_RESOLVE: 'SHORTFALL_RESOLVE',

  // Approval
  APPLICATION_APPROVE: 'APPLICATION_APPROVE',
  APPLICATION_REJECT: 'APPLICATION_REJECT',
  ORDER_VIEW: 'ORDER_VIEW',
  ORDER_REVOKE: 'ORDER_REVOKE',

  // Administration
  USER_MANAGE: 'USER_MANAGE',
  ROLE_MANAGE: 'ROLE_MANAGE',
  ORG_MANAGE: 'ORG_MANAGE',
  MASTER_DATA_MANAGE: 'MASTER_DATA_MANAGE',
  SETTINGS_MANAGE: 'SETTINGS_MANAGE',
  NOTIFICATION_TEMPLATE_MANAGE: 'NOTIFICATION_TEMPLATE_MANAGE',
  INTEGRATION_MANAGE: 'INTEGRATION_MANAGE',

  // Oversight
  AUDIT_VIEW: 'AUDIT_VIEW',
  REPORT_VIEW: 'REPORT_VIEW',
  ANALYTICS_VIEW: 'ANALYTICS_VIEW',
  NOTIFICATION_LOG_VIEW: 'NOTIFICATION_LOG_VIEW',
} as const;

export type Capability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

// ── Workflow vocabulary ──────────────────────────────────────────────────

export const STAGE_CODES = {
  LTP_DRAFT: 'LTP_DRAFT',
  LTP_DRAWING: 'LTP_DRAWING',
  LTP_DOCUMENTS: 'LTP_DOCUMENTS',
  LTP_PAYMENT: 'LTP_PAYMENT',
  TPA_REVIEW: 'TPA_REVIEW',
  ZAD_ZDD_REVIEW: 'ZAD_ZDD_REVIEW',
  ZJD_REVIEW: 'ZJD_REVIEW',
  DIRECTOR_DP_REVIEW: 'DIRECTOR_DP_REVIEW',
  ADDL_COMMISSIONER_REVIEW: 'ADDL_COMMISSIONER_REVIEW',
  COMMISSIONER_REVIEW: 'COMMISSIONER_REVIEW',
  LTP_SHORTFALL_ACTION: 'LTP_SHORTFALL_ACTION',
  CLOSED_APPROVED: 'CLOSED_APPROVED',
  CLOSED_REJECTED: 'CLOSED_REJECTED',
} as const;

/**
 * Shortfall statuses that count as SETTLED.
 *
 * Everything else is open, and the rule is absolute: OPEN_SHORTFALLS > 0 →
 * APPROVAL BLOCKED, of every kind and every mode, with no override. See
 * docs/03-workflow.md F.5.1.
 *
 * Stated as the CLOSED set rather than the open one so that a status added
 * later is open until somebody deliberately says otherwise — the safe
 * direction for a rule whose failure mode is approving an application that
 * should not have been. The full lifecycle lives in `src/lib/shortfalls.ts`.
 */
export const CLOSED_SHORTFALL_STATUSES = ['RESOLVED', 'CANCELLED'] as const;

/** Application statuses from which nothing further happens. */
export const TERMINAL_STATUSES = ['APPROVED', 'REJECTED', 'WITHDRAWN', 'LAPSED'] as const;

// ── Uploads ──────────────────────────────────────────────────────────────

/**
 * Extension allow-list. The upload pipeline additionally sniffs magic bytes
 * and requires them to agree — extension and declared MIME are both
 * attacker-controlled, the file's first bytes are not. See docs P.3.
 */
export const ALLOWED_UPLOAD_EXTENSIONS = [
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'dwg',
  'dxf',
  'zip',
] as const;

export const AUDIT_ACTIONS = {
  LOGIN_SUCCEEDED: 'LOGIN_SUCCEEDED',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  PASSWORD_RESET_REQUESTED: 'PASSWORD_RESET_REQUESTED',
  SETTING_UPDATED: 'SETTING_UPDATED',
} as const;
