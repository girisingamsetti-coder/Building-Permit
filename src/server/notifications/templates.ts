import 'server-only';
import { prisma } from '@/server/db/prisma';
import { settingString } from '@/server/services/settings';
import { env } from '@/server/config/env';
import type { Channel, Rendered } from './types';

/**
 * Templates, and the substitution that fills them in.
 *
 * ── An unknown variable renders as nothing, and says so ──────────────────
 *
 * `{{demandNumber}}` on an event that carries no demand becomes an empty
 * string, not the literal braces. An applicant receiving "Your fee of Rs.
 * {{amount}} is due" learns that the department's software is broken, which is
 * a worse message than the one that was meant.
 *
 * The missing keys are RETURNED alongside the text so the caller can record
 * them: a template quietly rendering half its variables blank is exactly the
 * kind of fault nobody notices until an applicant rings up confused.
 */

/** Values available to every template, whatever the event. */
async function ambient(): Promise<Record<string, string>> {
  const [orgName, orgShortName] = await Promise.all([
    settingString('org_name', 'Directorate of Town and Country Planning'),
    settingString('org_short_name', 'DTCP'),
  ]);

  return { orgName, orgShortName, appUrl: env.appUrl };
}

export type RenderResult = Rendered & { missing: string[] };

/**
 * Fills `{{name}}` placeholders from the payload.
 *
 * Deliberately not a template ENGINE. There are no conditionals, no loops and
 * no expressions, because a notification template is edited by an
 * administrator through a web form and a language with control flow in it is a
 * language somebody can write an infinite loop in.
 */
export function fill(
  text: string,
  values: Record<string, unknown>
): { text: string; missing: string[] } {
  const missing: string[] = [];

  const filled = text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
    const value = values[key];

    if (value === undefined || value === null || value === '') {
      missing.push(key);
      return '';
    }

    return String(value);
  });

  // Collapse the double spaces and stranded punctuation an empty substitution
  // leaves behind, so a missing variable reads as a terse sentence rather than
  // a broken one.
  return { text: filled.replace(/[ \t]{2,}/g, ' ').trim(), missing: [...new Set(missing)] };
}

export type TemplateRow = {
  id: string;
  subject: string;
  body: string;
  providerTemplateId: string;
};

/** Every active template for an event, keyed by channel. One query per event. */
export async function templatesFor(
  eventCode: string,
  locale = 'en'
): Promise<Map<Channel, TemplateRow>> {
  const rows = await prisma.notificationTemplate.findMany({
    where: { eventCode, locale, isActive: true },
    select: { id: true, channel: true, subject: true, body: true, providerTemplateId: true },
  });

  return new Map(
    rows.map((row) => [
      row.channel as Channel,
      {
        id: row.id,
        subject: row.subject,
        body: row.body,
        providerTemplateId: row.providerTemplateId,
      },
    ])
  );
}

/** Renders one template against an event payload. */
export async function render(
  template: TemplateRow,
  values: Record<string, unknown>
): Promise<RenderResult> {
  const all = { ...(await ambient()), ...values };

  const subject = fill(template.subject, all);
  const body = fill(template.body, all);

  return {
    subject: subject.text,
    body: body.text,
    providerTemplateId: template.providerTemplateId,
    missing: [...new Set([...subject.missing, ...body.missing])],
  };
}

/**
 * The deep link a notification points at.
 *
 * Absolute, because it goes into an email and an SMS as well as the bell, and
 * a relative path in an email is a dead link.
 */
export function linkFor(eventCode: string, payload: Record<string, unknown>): string {
  const applicationId = String(payload.applicationId ?? '');
  const shortfallId = String(payload.shortfallId ?? '');

  if (shortfallId) return `${env.appUrl}/shortfalls/${shortfallId}`;
  if (!applicationId) return env.appUrl;

  if (eventCode.startsWith('PAYMENT') || eventCode === 'FEE_GENERATED') {
    return `${env.appUrl}/applications/${applicationId}?tab=payments`;
  }
  if (eventCode.startsWith('SCRUTINY')) {
    return `${env.appUrl}/applications/${applicationId}?tab=scrutiny`;
  }
  if (eventCode.startsWith('TASK') || eventCode.startsWith('APPLICATION_')) {
    return `${env.appUrl}/applications/${applicationId}?tab=workflow`;
  }

  return `${env.appUrl}/applications/${applicationId}`;
}
