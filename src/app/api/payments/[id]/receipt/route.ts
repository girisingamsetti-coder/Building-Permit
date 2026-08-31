import { NextResponse } from 'next/server';
import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { requirePayment } from '@/server/services/payments';
import { ensureReceipt, receiptFilename, type ReceiptSnapshot } from '@/server/services/receipts';
import { storage } from '@/server/storage';
import { audit } from '@/server/services/audit';
import { prisma } from '@/server/db/prisma';
import { notFound } from '@/server/http/errors';

export const dynamic = 'force-dynamic';

/**
 * The receipt.
 *
 * Access is re-checked through the payment's APPLICATION — a payment id from a
 * client means nothing on its own, and `requirePayment` merges the caller's row
 * scope into the query, so somebody else's receipt is "not found" rather than
 * a 403.
 *
 * Rendered on first request rather than waited for: the RENDER_RECEIPT job
 * warms it, but an LTP clicking Download the second a payment succeeds must
 * not be told to come back later because a worker is behind.
 *
 * The download is audited BEFORE the bytes are returned — same rule as a
 * drawing or a scrutiny report. "Who took a copy of which citizen's receipt,
 * and when" stays answerable, including for a request that then failed
 * halfway.
 */
export const GET = defineRoute(
  async ({ user, params, ip, userAgent, correlationId }) => {
    const payment = await requirePayment(user, params.id!);

    if (!payment.receipt) {
      throw notFound('No receipt has been issued for this payment.');
    }

    const receipt = await ensureReceipt(payment.receipt.id);
    const bytes = await storage.get(receipt.storageKey);
    const snapshot = receipt.snapshot as unknown as ReceiptSnapshot;

    await audit(prisma, {
      actor: user,
      action: 'PAYMENT_RECEIPT_DOWNLOADED',
      entityType: 'PaymentReceipt',
      entityId: receipt.id,
      applicationId: payment.applicationId,
      after: {
        receiptNumber: receipt.receiptNumber,
        paymentRef: payment.paymentRef,
        amount: payment.amount.toFixed(2),
      },
      ip,
      userAgent,
      correlationId,
    });

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': String(bytes.byteLength),
        // attachment + nosniff: the receipt is HTML, and it must be saved or
        // opened deliberately rather than rendered as a page of this origin.
        'Content-Disposition': `attachment; filename="${receiptFilename(snapshot)}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  },
  { capabilities: [CAPABILITIES.PAYMENT_VIEW] }
);
