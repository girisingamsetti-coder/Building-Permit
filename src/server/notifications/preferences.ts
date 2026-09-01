import 'server-only';
import { prisma } from '@/server/db/prisma';
import type { AuthUser } from '@/server/auth/context';
import { isMandatory } from './recipients';

export type PreferenceCategory =
  | 'Applications'
  | 'Payments'
  | 'Shortfalls'
  | 'Approvals'
  | 'System';

export type EventPreferenceItem = {
  eventCode: string;
  label: string;
  category: PreferenceCategory;
  mandatory: boolean;
  channels: {
    IN_APP: boolean;
    EMAIL: boolean;
    SMS: boolean;
  };
};

export const NOTIFICATION_EVENT_GROUPS: {
  eventCode: string;
  label: string;
  category: PreferenceCategory;
}[] = [
  { eventCode: 'APPLICATION_CREATED', label: 'Application Created', category: 'Applications' },
  { eventCode: 'APPLICATION_SUBMITTED', label: 'Application Submitted', category: 'Applications' },
  { eventCode: 'DRAWING_UPLOADED', label: 'Drawing Uploaded', category: 'Applications' },
  { eventCode: 'SCRUTINY_PASSED', label: 'Scrutiny Passed', category: 'Applications' },
  { eventCode: 'SCRUTINY_FAILED', label: 'Scrutiny Failed', category: 'Applications' },
  { eventCode: 'DOCUMENTS_PENDING', label: 'Documents Pending', category: 'Applications' },
  { eventCode: 'DOCUMENTS_COMPLETED', label: 'Documents Complete', category: 'Applications' },
  { eventCode: 'APPLICATION_FORWARDED', label: 'Application Forwarded', category: 'Applications' },

  { eventCode: 'FEE_GENERATED', label: 'Fee Demand Generated', category: 'Payments' },
  { eventCode: 'PAYMENT_PENDING', label: 'Payment Pending', category: 'Payments' },
  { eventCode: 'PAYMENT_SUCCESSFUL', label: 'Payment Received / Success', category: 'Payments' },
  { eventCode: 'PAYMENT_FAILED', label: 'Payment Failed', category: 'Payments' },

  { eventCode: 'SHORTFALL_RAISED', label: 'Shortfall Notice Raised', category: 'Shortfalls' },
  { eventCode: 'SHORTFALL_RESOLVED', label: 'Shortfall Resolved', category: 'Shortfalls' },

  { eventCode: 'APPLICATION_APPROVED', label: 'Application Approved (Order Issued)', category: 'Approvals' },
  { eventCode: 'APPLICATION_REJECTED', label: 'Application Rejected', category: 'Approvals' },

  { eventCode: 'SLA_OVERDUE', label: 'SLA Breached / Overdue Notice', category: 'System' },
  { eventCode: 'PASSWORD_RESET', label: 'Security & Password Alerts', category: 'System' },
];

export async function getUserNotificationPreferences(user: AuthUser): Promise<EventPreferenceItem[]> {
  const saved = await prisma.notificationPreference.findMany({
    where: { userId: user.id },
  });

  const preferenceMap = new Map<string, boolean>();
  for (const row of saved) {
    preferenceMap.set(`${row.eventCode}:${row.channel}`, row.enabled);
  }

  return NOTIFICATION_EVENT_GROUPS.map((item) => {
    const mandatory = isMandatory(item.eventCode);

    return {
      eventCode: item.eventCode,
      label: item.label,
      category: item.category,
      mandatory,
      channels: {
        IN_APP: mandatory ? true : preferenceMap.get(`${item.eventCode}:IN_APP`) ?? true,
        EMAIL: mandatory ? true : preferenceMap.get(`${item.eventCode}:EMAIL`) ?? true,
        SMS: mandatory ? true : preferenceMap.get(`${item.eventCode}:SMS`) ?? true,
      },
    };
  });
}

export async function updateUserNotificationPreference(
  user: AuthUser,
  input: {
    eventCode: string;
    channel: 'IN_APP' | 'EMAIL' | 'SMS';
    enabled: boolean;
  }
) {
  // Critical statutory notifications remain mandatory and cannot be disabled
  if (isMandatory(input.eventCode) && !input.enabled) {
    throw new Error(`Statutory event ${input.eventCode} is mandatory and cannot be disabled.`);
  }

  await prisma.notificationPreference.upsert({
    where: {
      userId_eventCode_channel: {
        userId: user.id,
        eventCode: input.eventCode,
        channel: input.channel,
      },
    },
    create: {
      userId: user.id,
      eventCode: input.eventCode,
      channel: input.channel,
      enabled: input.enabled,
    },
    update: {
      enabled: input.enabled,
    },
  });

  return { success: true };
}
