import 'server-only';

export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'SMS';

export type ProviderRecipient = {
  userId: string | null;
  name: string;
  email: string;
  phone: string;
  reason: string;
  mandatory: boolean;
};

export type RenderedMessage = {
  subject: string;
  body: string;
  providerTemplateId?: string;
};

export type ProviderSendInput = {
  recipient: ProviderRecipient;
  message: RenderedMessage;
  eventCode: string;
  applicationId: string | null;
  link: string;
};

export type ProviderSendOutcome = {
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  provider: string;
  providerRef: string;
  error: string;
};

export interface SmsProvider {
  readonly name: string;
  readonly configured: boolean;
  sendSms(input: ProviderSendInput): Promise<ProviderSendOutcome>;
}

export interface EmailProvider {
  readonly name: string;
  readonly configured: boolean;
  sendEmail(input: ProviderSendInput): Promise<ProviderSendOutcome>;
}

export interface InAppProvider {
  readonly name: string;
  readonly configured: boolean;
  sendInApp(input: ProviderSendInput): Promise<ProviderSendOutcome>;
}
