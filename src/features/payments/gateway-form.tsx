'use client';

/**
 * Posting a signed field set to a gateway.
 *
 * ── Why a form and not a fetch ─────────────────────────────────────────
 *
 * PayU and CCAvenue are form-POST gateways: the PAYER'S BROWSER must arrive at
 * the gateway carrying the fields, because what happens next is the gateway's
 * own hosted page — a card form, a bank redirect, a UPI intent. A `fetch` would
 * put those bytes in our JavaScript instead of on the payer's screen, which is
 * both useless and the wrong place for a card number to be.
 *
 * ── Why the fields are never built here ────────────────────────────────
 *
 * They arrive from the server already signed by the driver, and this function
 * copies them verbatim into hidden inputs. It does not know what any of them
 * mean, and it must not: a client that could assemble a gateway field set is a
 * client that could assemble a different amount. The hash the driver computed
 * covers the amount, so an edited field is rejected by the gateway — but the
 * reason nothing is edited is that nothing here is authored.
 */
export function submitToGateway(formPost: { action: string; fields: Record<string, string> }): void {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = formPost.action;
  // The gateway's page replaces ours. `_self` is explicit rather than implied,
  // because a popup here is blocked by default and the payer sees nothing.
  form.target = '_self';
  form.style.display = 'none';

  for (const [name, value] of Object.entries(formPost.fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
}
