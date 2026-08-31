import 'server-only';

/**
 * The channel adapter contract.
 *
 * Three channels, one interface, and the dispatcher knows none of them apart.
 * That is the same bargain the payment drivers and the scrutiny engine make:
 * adding a provider is a file, and the code that decides WHO to tell and WHAT
 * to say never learns how a message physically leaves the building.
 */

export type Channel = 'IN_APP' | 'EMAIL' | 'SMS';

export const CHANNELS: Channel[] = ['IN_APP', 'EMAIL', 'SMS'];

/** One person to tell, with whatever addresses are known for them. */
export type Recipient = {
  /** Null for somebody who has no account — an applicant reachable only by SMS. */
  userId: string | null;
  name: string;
  email: string;
  phone: string;
  /** Why this person is on the list. Recorded in the log. */
  reason: string;
  /**
   * Transactional messages the recipient may not opt out of.
   *
   * The LTP who owns an application cannot switch off "a shortfall was raised
   * against your file": losing that message does not inconvenience them, it
   * breaks the process. Everything else is theirs to silence.
   */
  mandatory: boolean;
};

/** A message, after the template has been filled in. */
export type Rendered = {
  subject: string;
  body: string;
  /** DLT id. The SMS adapter refuses to send without one. */
  providerTemplateId: string;
};

export type SendInput = {
  channel: Channel;
  recipient: Recipient;
  message: Rendered;
  eventCode: string;
  applicationId: string | null;
  /** Deep link into the product, absolute. */
  link: string;
};

export type SendOutcome = {
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  provider: string;
  providerRef: string;
  /** Why it failed or was skipped, for the delivery log. Empty on success. */
  error: string;
};

export interface ChannelAdapter {
  readonly channel: Channel;
  /** The provider name recorded against every log row. */
  readonly name: string;
  /**
   * False when the adapter cannot send — no SMTP host, no API key.
   *
   * A misconfigured channel logs SKIPPED with the reason rather than throwing:
   * an unreachable SMS gateway must not stop the email and the in-app message
   * that would have reached the same person.
   */
  readonly configured: boolean;
  send(input: SendInput): Promise<SendOutcome>;
}

export const skipped = (provider: string, error: string): SendOutcome => ({
  status: 'SKIPPED',
  provider,
  providerRef: '',
  error,
});

export const sent = (provider: string, providerRef = ''): SendOutcome => ({
  status: 'SENT',
  provider,
  providerRef,
  error: '',
});

export const failed = (provider: string, error: string): SendOutcome => ({
  status: 'FAILED',
  provider,
  providerRef: '',
  error: error.slice(0, 500),
});
