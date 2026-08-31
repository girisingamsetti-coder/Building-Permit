import 'server-only';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/server/db/prisma';
import { storage, buildStorageKey } from '@/server/storage';
import { env } from '@/server/config/env';
import { settingString } from './settings';
import { notFound } from '@/server/http/errors';

/**
 * The payment receipt.
 *
 * ── It renders from the SNAPSHOT, and never from the demand ────────────
 *
 * `payment_receipts.snapshot` froze the payer, the demand and every line item
 * at the instant the money was credited, inside the settlement transaction.
 * This renderer reads that JSON and joins nothing. A fee schedule revised next
 * year, an applicant name corrected next week, a demand superseded by a
 * shortfall — none of them may alter a receipt already given to a citizen, and
 * the way to guarantee that is to have nothing to re-read.
 *
 * The database enforces the same thing from the other side: a trigger refuses
 * any UPDATE that touches the number, the amount, the payment, the issue date
 * or the snapshot, and refuses DELETE outright. Only `storageKey` may move,
 * because the rendered artefact can legitimately be regenerated.
 *
 * ── Why HTML and not PDF ───────────────────────────────────────────────
 *
 * The same reasoning as the scrutiny report: a real PDF needs a rendering
 * library, and adding one is a dependency decision rather than something to
 * slip in. This produces a SELF-CONTAINED, print-ready HTML document — no
 * external stylesheet, no font fetch, no script — which opens anywhere, prints
 * to PDF from any browser, and is archivable as-is. When a PDF renderer is
 * chosen it replaces `render()` and nothing else.
 *
 * ── A demo receipt says so, on every page ──────────────────────────────
 *
 * A receipt produced through the mock gateway carries "DEMO PAYMENT — NO MONEY
 * HAS CHANGED HANDS" across the sheet, and the driver is named in the footer.
 * A demonstration that prints something indistinguishable from a real receipt
 * is exactly the artefact that ends up in somebody's file.
 */

/**
 * Returns the stored receipt, rendering it if this is the first request.
 *
 * Generate-on-demand rather than relying on the worker: the receipt is what an
 * LTP clicks the moment a payment succeeds, and "come back when a background
 * job has run" is not an acceptable answer to somebody who has just paid. The
 * RENDER_RECEIPT job calls the same function to warm it.
 */
export async function ensureReceipt(paymentReceiptId: string) {
  const existing = await prisma.paymentReceipt.findUnique({
    where: { id: paymentReceiptId },
    select: { id: true, receiptNumber: true, storageKey: true, snapshot: true },
  });

  if (!existing) throw notFound('That receipt could not be found.');

  // Regenerate if the row exists but the bytes are gone — a storage wipe in
  // development must not leave a permanently broken download link.
  if (existing.storageKey && (await storage.exists(existing.storageKey))) return existing;

  const snapshot = existing.snapshot as unknown as ReceiptSnapshot;
  const orgName = await settingString('org_name', env.appName);
  const html = render(snapshot, orgName);

  const storageKey = buildStorageKey({
    applicationId: snapshot.application?.id ?? 'unknown',
    kind: 'receipts',
    random: randomBytes(20).toString('hex'),
    extension: 'html',
  });

  await storage.put({
    key: storageKey,
    body: Buffer.from(html, 'utf8'),
    contentType: 'text/html; charset=utf-8',
    filename: receiptFilename(snapshot),
  });

  const updated = await prisma.paymentReceipt.update({
    where: { id: paymentReceiptId },
    data: { storageKey },
    select: { id: true, receiptNumber: true, storageKey: true, snapshot: true },
  });

  // Drop the orphan only after the row points at the new object.
  if (existing.storageKey) await storage.remove(existing.storageKey).catch(() => {});

  return updated;
}

export function receiptFilename(snapshot: ReceiptSnapshot): string {
  const receipt = (snapshot.receiptNumber ?? 'receipt').replace(/\//g, '-');
  return `receipt-${receipt}.html`;
}

// ═══════════════════════════════════════════════════════════════════════════
// The snapshot's shape
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Declared rather than inferred from Prisma, because this is JSON that was
 * written by a past version of the code and will be read by future ones. Every
 * field is optional: a receipt issued before a field existed must still
 * render, and a renderer that threw on an old snapshot would make an old
 * receipt unprintable.
 */
export type ReceiptSnapshot = {
  receiptNumber?: string;
  issuedAt?: string;
  isDemo?: boolean;
  provider?: string;
  application?: { id?: string; applicationNumber?: string };
  applicant?: { name?: string; phone?: string; email?: string; address?: string };
  payment?: {
    paymentRef?: string;
    attemptNo?: number;
    amount?: string;
    method?: string;
    gatewayTxnId?: string;
    bankRef?: string;
    settledAt?: string;
    status?: string;
  };
  demand?: {
    demandNumber?: string;
    type?: string;
    subtotal?: string;
    adjustmentTotal?: string;
    totalAmount?: string;
    issuedAt?: string | null;
  };
  lines?: Array<{
    kind?: string;
    code?: string;
    name?: string;
    headOfAccount?: string;
    basis?: string;
    amount?: string;
    note?: string;
  }>;
};

// ═══════════════════════════════════════════════════════════════════════════
// Rendering
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The document.
 *
 * Everything §7 requires is present and labelled: application number,
 * applicant, transaction id, payment date, amount, the fee components, and the
 * payment status. The status is printed rather than implied — a receipt that
 * only shows an amount cannot be told apart from a demand, and the difference
 * between "payable" and "paid" is the entire purpose of the document.
 */
function render(s: ReceiptSnapshot, orgName: string): string {
  const isDemo = s.isDemo === true;
  const charges = (s.lines ?? []).filter((l) => l.kind === 'COMPONENT');
  const adjustments = (s.lines ?? []).filter((l) => l.kind && l.kind !== 'COMPONENT');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Receipt ${esc(s.receiptNumber)} — ${esc(s.application?.applicationNumber)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px;
    font: 14px/1.55 ui-sans-serif, system-ui, "Segoe UI", Roboto, Arial, sans-serif;
    color: #111827; background: #f3f4f6;
  }
  .sheet {
    max-width: 760px; margin: 0 auto; padding: 32px 36px;
    background: #fff; border: 1px solid #e5e7eb; border-radius: 6px;
  }
  header { display: flex; justify-content: space-between; gap: 24px;
           border-bottom: 2px solid #111827; padding-bottom: 16px; }
  .org { font-size: 18px; font-weight: 700; letter-spacing: .01em; }
  .doc { font-size: 12px; text-transform: uppercase; letter-spacing: .12em; color: #6b7280; }
  .num { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .paid {
    display: inline-block; margin-top: 6px; padding: 3px 10px; border-radius: 999px;
    font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
    background: #dcfce7; color: #166534; border: 1px solid #86efac;
  }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .1em;
       color: #6b7280; margin: 26px 0 8px; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 20px; margin: 0; }
  dt { color: #6b7280; }
  dd { margin: 0; font-weight: 500; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { padding: 8px 6px; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #6b7280; }
  td.amt, th.amt { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .note { color: #6b7280; font-size: 12px; }
  tfoot td { border-bottom: none; padding-top: 10px; }
  tfoot tr.total td { border-top: 2px solid #111827; font-weight: 700; font-size: 16px; }
  footer { margin-top: 28px; padding-top: 14px; border-top: 1px solid #e5e7eb;
           color: #6b7280; font-size: 12px; }
  @media print {
    body { background: #fff; padding: 0; }
    .sheet { border: none; border-radius: 0; max-width: none; padding: 0; }
  }
  ${isDemo ? demoWatermarkCss() : ''}
</style>
</head>
<body>
<div class="sheet">

<header>
  <div>
    <div class="org">${esc(orgName)}</div>
    <div class="doc">Payment receipt</div>
  </div>
  <div style="text-align:right">
    <div class="num">${esc(s.receiptNumber)}</div>
    <div class="note">${esc(fmt(s.issuedAt))}</div>
    <div class="paid">${esc(s.payment?.status === 'SUCCESS' ? 'Paid' : (s.payment?.status ?? 'Paid'))}</div>
  </div>
</header>

<h2>Application</h2>
<dl>
  <dt>Application number</dt><dd>${esc(s.application?.applicationNumber)}</dd>
  <dt>Applicant</dt><dd>${esc(s.applicant?.name)}</dd>
  ${s.applicant?.phone ? `<dt>Phone</dt><dd>${esc(s.applicant.phone)}</dd>` : ''}
  ${s.applicant?.email ? `<dt>Email</dt><dd>${esc(s.applicant.email)}</dd>` : ''}
  ${s.applicant?.address ? `<dt>Address</dt><dd>${esc(s.applicant.address)}</dd>` : ''}
  <dt>Fee demand</dt><dd>${esc(s.demand?.demandNumber)}</dd>
</dl>

<h2>Payment</h2>
<dl>
  <dt>Transaction ID</dt><dd>${esc(s.payment?.gatewayTxnId || s.payment?.paymentRef)}</dd>
  <dt>Our reference</dt><dd>${esc(s.payment?.paymentRef)}</dd>
  <dt>Payment date</dt><dd>${esc(fmt(s.payment?.settledAt ?? s.issuedAt))}</dd>
  <dt>Amount paid</dt><dd>${esc(money(s.payment?.amount))}</dd>
  <dt>Payment status</dt><dd>${esc(s.payment?.status ?? 'SUCCESS')}</dd>
  ${s.payment?.method ? `<dt>Method</dt><dd>${esc(s.payment.method)}</dd>` : ''}
  ${s.payment?.bankRef ? `<dt>Bank reference</dt><dd>${esc(s.payment.bankRef)}</dd>` : ''}
  <dt>Gateway</dt><dd>${esc(s.provider ?? '—')}${isDemo ? ' (demonstration)' : ''}</dd>
</dl>

<h2>What was charged</h2>
<table>
  <thead>
    <tr>
      <th>Component</th>
      <th>Head of account</th>
      <th class="amt">Amount</th>
    </tr>
  </thead>
  <tbody>
    ${
      charges.length
        ? charges
            .map(
              (line) => `<tr>
      <td>${esc(line.name)}${line.note ? `<div class="note">${esc(line.note)}</div>` : ''}</td>
      <td class="note">${esc(line.headOfAccount || '—')}</td>
      <td class="amt">${esc(money(line.amount))}</td>
    </tr>`
            )
            .join('')
        : '<tr><td colspan="3" class="note">No itemised components were recorded on this demand.</td></tr>'
    }
    ${adjustments
      .map(
        (line) => `<tr>
      <td>${esc(line.name)}${line.note ? `<div class="note">${esc(line.note)}</div>` : ''}</td>
      <td class="note">Adjustment</td>
      <td class="amt">${esc(money(line.amount))}</td>
    </tr>`
      )
      .join('')}
  </tbody>
  <tfoot>
    <tr><td colspan="2">Subtotal</td><td class="amt">${esc(money(s.demand?.subtotal))}</td></tr>
    ${
      s.demand?.adjustmentTotal && Number(s.demand.adjustmentTotal) !== 0
        ? `<tr><td colspan="2">Adjustments</td><td class="amt">${esc(money(s.demand.adjustmentTotal))}</td></tr>`
        : ''
    }
    <tr><td colspan="2">Demand total</td><td class="amt">${esc(money(s.demand?.totalAmount))}</td></tr>
    <tr class="total"><td colspan="2">Amount received</td><td class="amt">${esc(money(s.payment?.amount))}</td></tr>
  </tfoot>
</table>

<footer>
  This receipt was generated by ${esc(env.appName)} on ${esc(fmt(new Date().toISOString()))}.
  It is a record of a payment received against application ${esc(s.application?.applicationNumber)}
  and is valid without a signature.
  ${
    isDemo
      ? '<br><strong>This receipt was produced by a demonstration payment gateway. No money changed hands and it has no financial or legal standing.</strong>'
      : ''
  }
</footer>

</div>
</body>
</html>`;
}

/**
 * A repeating diagonal watermark, drawn in CSS so it survives printing and
 * needs no image asset. `position:fixed` puts it on every printed page.
 */
function demoWatermarkCss(): string {
  return `
  .sheet::before {
    content:"DEMO PAYMENT — NO MONEY HAS CHANGED HANDS";
    position:fixed; inset:0; z-index:0; pointer-events:none;
    display:flex; align-items:center; justify-content:center;
    transform:rotate(-30deg);
    font-size:34px; font-weight:800; letter-spacing:.06em;
    color:rgba(185,28,28,.10); white-space:nowrap;
  }
  .sheet > * { position:relative; z-index:1; }
  @media print { .sheet::before { color:rgba(185,28,28,.16); } }`;
}

/** Escapes text for HTML. Everything interpolated above goes through this. */
function esc(value: unknown): string {
  return String(value ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Indian-format rupees.
 *
 * The amount arrives as a STRING from the snapshot — the settlement wrote
 * `Decimal.toFixed(2)` — so this parses once, at the last moment, purely to
 * group the digits. No arithmetic is done on a receipt figure anywhere.
 */
function money(amount: string | undefined): string {
  if (amount === undefined || amount === null || amount === '') return '—';
  const value = Number(amount);
  if (!Number.isFinite(value)) return String(amount);

  try {
    return `₹${new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)}`;
  } catch {
    return `₹${value.toFixed(2)}`;
  }
}

function fmt(iso: string | undefined | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
