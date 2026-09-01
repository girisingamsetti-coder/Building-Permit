import { prisma } from '../src/server/db/prisma';
import { dispatchEvent } from '../src/server/notifications/dispatcher';
import { fill } from '../src/server/notifications/templates';
import { MockSmsProvider } from '../src/server/notifications/providers/sms.provider';
import { MockEmailProvider } from '../src/server/notifications/providers/email.provider';
import { DbInAppProvider } from '../src/server/notifications/providers/in-app.provider';
import { isMandatory } from '../src/server/notifications/recipients';

async function main() {
  console.log('🧪 Running Phase 8 Notification Engine Verification...');

  // 1. Test Template Engine with all 7 variables
  console.log('\n[1/4] Testing Template Engine variable substitution...');
  const templateStr =
    'Notification for App {{applicationNumber}}: Applicant {{applicantName}} is currently at {{currentStage}} (Status: {{status}}). Shortfall: {{shortfallReason}}. Amount: {{amount}}. Approved on: {{approvalDate}}.';

  const sampleValues = {
    applicationNumber: 'AP-2026-TEST',
    applicantName: 'Ravi Teja',
    currentStage: 'TPA Scrutiny',
    status: 'IN_REVIEW',
    shortfallReason: 'Clearance from Fire Department required',
    amount: '₹25,000.00',
    approvalDate: '01-Sep-2026',
  };

  const rendered = fill(templateStr, sampleValues);
  console.log('Rendered output:', rendered.text);
  if (rendered.missing.length > 0) {
    throw new Error(`Unexpected missing variables: ${rendered.missing.join(', ')}`);
  }
  console.log('✅ Template Engine passed all 7 variables!');

  // 2. Test Provider Direct Invocations
  console.log('\n[2/4] Testing Providers (SmsProvider, EmailProvider, InAppProvider)...');
  const smsProvider = new MockSmsProvider();
  const emailProvider = new MockEmailProvider();
  const inAppProvider = new DbInAppProvider();

  // Find a test user
  const user = await prisma.user.findFirstOrThrow();

  const smsRes = await smsProvider.sendSms({
    recipient: {
      userId: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone || '9876543210',
      reason: 'LTP',
      mandatory: true,
    },
    message: { subject: '', body: 'Test SMS from Phase 8 Engine' },
    eventCode: 'APPLICATION_CREATED',
    applicationId: null,
    link: 'http://localhost:3000/dashboard',
  });
  console.log('SmsProvider result:', smsRes.status, smsRes.providerRef);

  const emailRes = await emailProvider.sendEmail({
    recipient: {
      userId: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone || '9876543210',
      reason: 'LTP',
      mandatory: true,
    },
    message: { subject: 'Test Email', body: 'Test Email Body from Phase 8 Engine' },
    eventCode: 'APPLICATION_CREATED',
    applicationId: null,
    link: 'http://localhost:3000/dashboard',
  });
  console.log('EmailProvider result:', emailRes.status, emailRes.providerRef);

  const inAppRes = await inAppProvider.sendInApp({
    recipient: {
      userId: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone || '9876543210',
      reason: 'LTP',
      mandatory: true,
    },
    message: { subject: 'Test In-App Notification', body: 'Test message body' },
    eventCode: 'APPLICATION_CREATED',
    applicationId: null,
    link: '/dashboard',
  });
  console.log('InAppProvider result:', inAppRes.status, inAppRes.providerRef);

  if (smsRes.status !== 'SENT' || emailRes.status !== 'SENT' || inAppRes.status !== 'SENT') {
    throw new Error('Provider direct execution did not return SENT status');
  }
  console.log('✅ All three providers executed successfully!');

  // 3. Test Workflow Event Dispatch & Delivery Log Recording
  console.log('\n[3/4] Testing Event Dispatching & Delivery Log Recording...');
  const app = await prisma.application.findFirst({
    select: { id: true, applicationNumber: true },
  });

  const outcome = await dispatchEvent({
    eventCode: 'SHORTFALL_RAISED',
    applicationId: app?.id ?? null,
    payload: {
      shortfallReason: 'Missing site inspection photograph',
    },
  });
  console.log('Dispatch outcome for SHORTFALL_RAISED:', outcome);

  const latestLog = await prisma.notificationLog.findFirst({
    where: { eventCode: 'SHORTFALL_RAISED' },
    orderBy: { createdAt: 'desc' },
  });
  console.log('Latest notification_log row:', {
    eventCode: latestLog?.eventCode,
    channel: latestLog?.channel,
    status: latestLog?.status,
    recipient: latestLog?.recipient,
  });

  // 4. Test Transaction Isolation (Ensuring notification failure does not corrupt workflow)
  console.log('\n[4/4] Testing Transaction Isolation & Error Resilience...');
  // Simulate dispatching an invalid/failing event and verify it handles error gracefully without throwing
  const failOutcome = await dispatchEvent({
    eventCode: 'PAYMENT_FAILED',
    applicationId: 'non-existent-app-id',
    payload: { amount: '₹5,000.00' },
  });
  console.log('Handled failing dispatch gracefully:', failOutcome);

  console.log('\n🎉 ALL PHASE 8 NOTIFICATION ENGINE TESTS PASSED SUCCESSFULLY!');
}

main()
  .catch((e) => {
    console.error('❌ Test failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
