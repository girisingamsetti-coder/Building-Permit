/**
 * What an LTP can do with an application right now.
 *
 * Derived from status in ONE place so the dashboard, the list and the detail
 * header offer the same thing for the same file. A row offering "Pay" on one
 * screen and "Continue" on another is the kind of inconsistency that makes
 * people stop trusting the buttons and go and ring somebody.
 *
 * This is CHROME. It decides what is offered, never what is permitted — the
 * server re-derives permission on every request regardless. An action marked
 * `available: false` is rendered disabled with the reason, rather than hidden:
 * an LTP looking for "Pay" needs to learn that it appears once a demand
 * exists, not to wonder whether the product has the feature at all.
 */

export type ActionKey = 'view' | 'continue' | 'edit' | 'upload-drawing' | 'pay' | 'shortfall';

export type ApplicationAction = {
  key: ActionKey;
  label: string;
  href: string;
  /** Exactly one action per row is the primary one. */
  primary: boolean;
  available: boolean;
  /** Why it is unavailable, in the user's terms. Empty when it is available. */
  reason: string;
};

type Input = {
  id: string;
  status: string;
  openShortfalls?: number;
};



/**
 * Every action for one application, in display order.
 *
 * `primary` marks the single thing this file is actually waiting for — the
 * one the row's button should be.
 */
export function actionsFor(app: Input): ApplicationAction[] {
  const isDraft = app.status === 'DRAFT';
  const base = `/applications/${app.id}`;

  const awaitingDrawing = ['SUBMITTED', 'SCRUTINY_FAILED'].includes(app.status);
  const awaitingPayment = ['FEE_GENERATED', 'PAYMENT_PENDING', 'PAYMENT_FAILED'].includes(app.status);
  const hasShortfall = (app.openShortfalls ?? 0) > 0 || app.status.includes('SHORTFALL');

  // The primary action is the first of these that applies. Order is the order
  // an application actually moves through.
  const primaryKey: ActionKey = hasShortfall
    ? 'shortfall'
    : isDraft
      ? 'continue'
      : awaitingPayment
        ? 'pay'
        : awaitingDrawing
          ? 'upload-drawing'
          : 'view';

  const actions: ApplicationAction[] = [
    {
      key: 'view',
      label: 'View',
      href: base,
      primary: primaryKey === 'view',
      available: true,
      reason: '',
    },
    {
      key: 'continue',
      label: 'Continue',
      href: `${base}/edit`,
      primary: primaryKey === 'continue',
      available: isDraft,
      reason: isDraft ? '' : 'This application has already been filed',
    },
    {
      key: 'edit',
      label: 'Edit',
      href: `${base}/edit`,
      primary: false,
      available: isDraft,
      reason: isDraft ? '' : 'A filed application is changed by answering a shortfall',
    },
    {
      key: 'upload-drawing',
      label: 'Upload drawing',
      href: `${base}?tab=drawings`,
      primary: primaryKey === 'upload-drawing',
      available: true,
      reason: '',
    },
    {
      key: 'pay',
      label: 'Pay',
      href: `${base}?tab=payments`,
      primary: primaryKey === 'pay',
      available: awaitingPayment,
      reason: awaitingPayment ? '' : 'Pay appears once a fee demand has been raised',
    },
    {
      key: 'shortfall',
      label: 'Answer shortfall',
      href: `${base}?tab=workflow`,
      primary: primaryKey === 'shortfall',
      available: hasShortfall,
      // Points at the Workflow tab rather than the Shortfalls one: answering
      // is a workflow action (RESUBMIT), and the button has to land where the
      // thing it names can actually be done.
      reason: hasShortfall ? '' : 'Nothing has been asked for on this application',
    },
  ];

  return actions;
}

/**
 * The one action a row's button should perform.
 *
 * Falls back to View when the primary action is not yet buildable, so the
 * button always goes somewhere useful rather than to a disabled control.
 */
export function primaryActionFor(app: Input): ApplicationAction {
  const actions = actionsFor(app);
  const primary = actions.find((a) => a.primary && a.available);
  return primary ?? actions[0]!;
}
