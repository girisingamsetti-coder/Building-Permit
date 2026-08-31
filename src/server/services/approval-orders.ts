import 'server-only';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/server/db/prisma';
import { audit } from './audit';
import { recordEvent, EVENT_TYPES } from './timeline';
import { emit, EVENTS } from '@/server/events/outbox';
import { nextSequence, formatNumber } from './numbering';
import { settingString } from './settings';

/**
 * The approval order — the document the applicant actually receives.
 *
 * Created by the RENDER_APPROVAL_ORDER job, which the workflow's
 * GENERATE_APPROVAL_ORDER effect enqueues inside the approving transaction. The
 * approval and the order are therefore not the same write: an order that failed
 * to render must never be able to roll back an approval the Commissioner made,
 * and a slow renderer must never be able to make an approval fail.
 *
 * ── The snapshot is the record ───────────────────────────────────────────
 *
 * Everything printed on the order is frozen into `snapshot` at issue time, for
 * the same reason a receipt is: an applicant's name may be corrected, a fee
 * schedule revised or a zone renamed years later, and none of that may alter a
 * permission already granted. The renderer reads the snapshot, never the live
 * tables.
 *
 * ── What is deliberately NOT here ────────────────────────────────────────
 *
 * No PDF, and no signature. Rendering to PDF and a digital signature (DSC /
 * eSign) are separate pieces of work with their own dependencies — see
 * docs/10-open-questions.md S3. `storageKey` and `signatureRef` stay empty
 * rather than being filled with something that looks signed and is not, which
 * on a statutory permission would be the worst possible shortcut.
 */

const DEFAULT_ORDER_FORMAT = '{prefix}/{year}/{seq:5}';

/**
 * Creates the order if the application does not already have one.
 *
 * Idempotent by the unique index on `applicationId`: the job may be retried,
 * and a second run finds the existing row and returns it rather than issuing a
 * second permission for the same file.
 */
export async function ensureApprovalOrder(applicationId: string, issuedById: string) {
  const existing = await prisma.approvalOrder.findUnique({
    where: { applicationId },
    select: { id: true, orderNumber: true, status: true, verificationCode: true },
  });

  if (existing) return existing;

  const application = await prisma.application.findFirstOrThrow({
    where: { id: applicationId },
    select: {
      id: true,
      applicationNumber: true,
      status: true,
      approvedAt: true,
      ltpUserId: true,
      applicationType: { select: { code: true, name: true } },
      zone: { select: { code: true, name: true } },
      applicant: { select: { name: true, phone: true, email: true, address: true } },
      property: {
        select: {
          district: true,
          mandal: true,
          village: true,
          localityName: true,
          surveyNumbers: true,
          plotNo: true,
          plotAreaSqm: true,
        },
      },
      building: {
        select: {
          builtUpAreaSqm: true,
          floorAreaSqm: true,
          coverageAreaSqm: true,
        },
      },
      fees: {
        where: { status: { in: ['PAID', 'PARTIALLY_PAID'] } },
        select: { demandNumber: true, totalAmount: true, paidAmount: true, paidAt: true },
      },
    },
  });

  // An order is evidence that a permission was granted. Refusing to issue one
  // for an application that is not approved is what stops a retried or
  // mis-enqueued job from manufacturing that evidence.
  if (application.status !== 'APPROVED') {
    throw new Error(
      `Approval order refused: ${application.applicationNumber} is ${application.status}, not APPROVED.`
    );
  }

  const now = new Date();
  const format = await settingString('approval_order_number_format', DEFAULT_ORDER_FORMAT);

  return prisma.$transaction(async (tx) => {
    const year = now.getFullYear();
    const prefix = 'BPO';
    const seq = await nextSequence(tx, `order:${prefix}:${year}`);
    const orderNumber = formatNumber(format || DEFAULT_ORDER_FORMAT, { prefix, year, seq });

    // 16 bytes of randomness, rendered as 32 hex characters. This is a public
    // handle — /verify-order/[code] is reachable without signing in — so it
    // must not be guessable from the order number or the date.
    const verificationCode = randomBytes(16).toString('hex');

    const order = await tx.approvalOrder.create({
      data: {
        applicationId: application.id,
        orderNumber,
        status: 'ISSUED',
        issuedById,
        issuedAt: now,
        verificationCode,
        snapshot: {
          orderNumber,
          issuedAt: now.toISOString(),
          application: {
            id: application.id,
            applicationNumber: application.applicationNumber,
            type: application.applicationType.name,
            approvedAt: application.approvedAt?.toISOString() ?? now.toISOString(),
            zone: application.zone?.name ?? '',
          },
          applicant: application.applicant ?? {},
          property: application.property
            ? {
                ...application.property,
                plotAreaSqm: application.property.plotAreaSqm?.toString() ?? null,
              }
            : {},
          building: application.building
            ? {
                builtUpAreaSqm: application.building.builtUpAreaSqm?.toString() ?? null,
                floorAreaSqm: application.building.floorAreaSqm?.toString() ?? null,
                coverageAreaSqm: application.building.coverageAreaSqm?.toString() ?? null,
              }
            : {},
          fees: application.fees.map((f) => ({
            demandNumber: f.demandNumber,
            totalAmount: f.totalAmount.toFixed(2),
            paidAmount: f.paidAmount.toFixed(2),
            paidAt: f.paidAt?.toISOString() ?? null,
          })),
        } as never,
      },
      select: { id: true, orderNumber: true, status: true, verificationCode: true },
    });

    await recordEvent(tx, {
      applicationId: application.id,
      type: EVENT_TYPES.APPLICATION_APPROVED,
      title: 'Approval order issued',
      description: `Order ${orderNumber}.`,
      metadata: { orderNumber, approvalOrderId: order.id },
      occurredAt: now,
    });

    await audit(tx, {
      action: 'APPROVAL_ORDER_ISSUED',
      entityType: 'ApprovalOrder',
      entityId: order.id,
      applicationId: application.id,
      after: { orderNumber, status: 'ISSUED', issuedById },
    });

    await emit(tx, {
      eventCode: EVENTS.ORDER_ISSUED,
      applicationId: application.id,
      payload: {
        applicationNumber: application.applicationNumber,
        orderNumber,
        ltpUserId: application.ltpUserId,
      },
    });

    return order;
  });
}
