import { describe, it } from 'node:test';
import assert from 'node:assert';
import { fill } from '../templates';
import { MockSmsProvider } from '../providers/sms.provider';
import { MockEmailProvider } from '../providers/email.provider';
import { isMandatory } from '../recipients';

describe('Phase 8 Notification Engine', () => {
  describe('Template Engine Variable Substitution', () => {
    it('substitutes all 7 required template variables', () => {
      const template =
        'App: {{applicationNumber}} | Applicant: {{applicantName}} | Status: {{status}} | Stage: {{currentStage}} | Reason: {{shortfallReason}} | Amount: {{amount}} | Date: {{approvalDate}}';

      const values = {
        applicationNumber: 'AP-2026-0099',
        applicantName: 'Kishore Kumar',
        status: 'UNDER_REVIEW',
        currentStage: 'TPA Review',
        shortfallReason: 'Missing structural stability certificate',
        amount: '₹14,500.00',
        approvalDate: '15-Aug-2026',
      };

      const result = fill(template, values);

      assert.strictEqual(result.missing.length, 0);
      assert.strictEqual(
        result.text,
        'App: AP-2026-0099 | Applicant: Kishore Kumar | Status: UNDER_REVIEW | Stage: TPA Review | Reason: Missing structural stability certificate | Amount: ₹14,500.00 | Date: 15-Aug-2026'
      );
    });

    it('gracefully handles missing variables without throwing', () => {
      const template = 'Application {{applicationNumber}} has pending amount {{amount}}';
      const result = fill(template, { applicationNumber: 'AP-123' });

      assert.ok(result.missing.includes('amount'));
      assert.strictEqual(result.text, 'Application AP-123 has pending amount');
    });
  });

  describe('Mock Providers', () => {
    it('MockSmsProvider formats and sends SMS successfully', async () => {
      const provider = new MockSmsProvider();
      const outcome = await provider.sendSms({
        recipient: {
          userId: 'user-1',
          name: 'Test User',
          email: 'test@example.com',
          phone: '9876543210',
          reason: 'LTP',
          mandatory: true,
        },
        message: {
          subject: '',
          body: 'Application AP-001 created successfully.',
          providerTemplateId: 'DLT_123',
        },
        eventCode: 'APPLICATION_CREATED',
        applicationId: 'app-1',
        link: 'http://localhost:3000/applications/app-1',
      });

      assert.strictEqual(outcome.status, 'SENT');
      assert.strictEqual(outcome.provider, 'MockSmsProvider');
      assert.ok(outcome.providerRef.includes('mock-sms-'));
    });

    it('MockEmailProvider formats and sends Email successfully', async () => {
      const provider = new MockEmailProvider();
      const outcome = await provider.sendEmail({
        recipient: {
          userId: 'user-1',
          name: 'Test User',
          email: 'user@example.com',
          phone: '9876543210',
          reason: 'LTP',
          mandatory: true,
        },
        message: {
          subject: 'Application Approved',
          body: 'Dear User, your application is approved.',
        },
        eventCode: 'APPLICATION_APPROVED',
        applicationId: 'app-1',
        link: 'http://localhost:3000/applications/app-1',
      });

      assert.strictEqual(outcome.status, 'SENT');
      assert.strictEqual(outcome.provider, 'MockEmailProvider');
      assert.ok(outcome.providerRef.includes('mock-email-'));
    });
  });

  describe('Mandatory Statutory Enforcement', () => {
    it('identifies critical workflow events as mandatory', () => {
      assert.strictEqual(isMandatory('SHORTFALL_RAISED'), true);
      assert.strictEqual(isMandatory('APPLICATION_APPROVED'), true);
      assert.strictEqual(isMandatory('APPLICATION_REJECTED'), true);
      assert.strictEqual(isMandatory('FEE_GENERATED'), true);
      assert.strictEqual(isMandatory('PAYMENT_SUCCESSFUL'), true);
    });

    it('allows non-critical events to be optional', () => {
      assert.strictEqual(isMandatory('APPLICATION_CREATED'), false);
      assert.strictEqual(isMandatory('DRAWING_UPLOADED'), false);
      assert.strictEqual(isMandatory('DOCUMENTS_PENDING'), false);
    });
  });
});
