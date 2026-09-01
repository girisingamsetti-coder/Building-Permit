import 'server-only';
import { env } from '@/server/config/env';
import { MockSmsProvider, Msg91SmsProvider } from './sms.provider';
import { MockEmailProvider, SmtpEmailProvider } from './email.provider';
import { DbInAppProvider } from './in-app.provider';
import type { SmsProvider, EmailProvider, InAppProvider } from './types';

export * from './types';
export * from './sms.provider';
export * from './email.provider';
export * from './in-app.provider';

export function getSmsProvider(): SmsProvider {
  if (env.smsProvider === 'mock' || !env.smsApiKey) {
    return new MockSmsProvider();
  }
  return new Msg91SmsProvider();
}

export function getEmailProvider(): EmailProvider {
  if (env.emailProvider === 'console' || !env.smtp.host) {
    return new MockEmailProvider();
  }
  return new SmtpEmailProvider();
}

export function getInAppProvider(): InAppProvider {
  return new DbInAppProvider();
}
