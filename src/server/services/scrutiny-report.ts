import 'server-only';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/server/db/prisma';
import { storage, buildStorageKey } from '@/server/storage';
import { env } from '@/server/config/env';
import { notFound } from '@/server/http/errors';
import { severityRank } from '@/lib/drawings';

/**
 * The scrutiny report.
 *
 * ── Why HTML and not PDF ───────────────────────────────────────────────
 *
 * A real PDF needs a rendering library, and adding one is a dependency
 * decision rather than something to slip in. This produces a SELF-CONTAINED,
 * print-ready HTML document — no external stylesheet, no font fetch, no
 * script — which opens anywhere, prints to PDF from any browser, and is
 * archivable as-is. When a PDF renderer is chosen, it replaces `render()` and
 * nothing else: the storage key, the row and the download route are unchanged.
 *
 * ── The watermark is not decoration ────────────────────────────────────
 *
 * A report from a non-production driver carries "DEMO SCRUTINY — NOT A
 * COMPLIANCE CERTIFICATE" across every page, and `isDemo` is recorded on the
 * row so the UI says the same thing. A mock PASS printed on letterhead is
 * exactly the artefact that would get mistaken for an approval, so it is made
 * impossible to print one that does not say what it is.
 */

/**
 * Returns the stored report, generating it if this is the first request.
 *
 * Generate-on-demand rather than relying on the worker: the report is what an
 * LTP clicks for the moment scrutiny finishes, and "come back when a
 * background job has run" is not an acceptable answer. The RENDER_SCRUTINY_REPORT
 * job calls the same function to warm it.
 */
export async function ensureReport(scrutinyResultId: string) {
  const existing = await prisma.scrutinyReport.findUnique({
    where: { scrutinyResultId },
  });

  // Regenerate if the row exists but the bytes are gone — a storage wipe in
  // development should not leave a permanently broken download link.
  if (existing && (await storage.exists(existing.storageKey))) return existing;

  const result = await loadForReport(scrutinyResultId);
  const html = render(result);

  const storageKey = buildStorageKey({
    applicationId: result.applicationId,
    kind: 'reports',
    random: randomBytes(20).toString('hex'),
    extension: 'html',
  });

  await storage.put({
    key: storageKey,
    body: Buffer.from(html, 'utf8'),
    contentType: 'text/html; charset=utf-8',
    filename: reportFilename(result),
  });

  if (existing) {
    // Point the row at the new object and drop the orphan.
    const updated = await prisma.scrutinyReport.update({
      where: { scrutinyResultId },
      data: { storageKey, isDemo: result.isDemo, generatedAt: new Date() },
    });
    await storage.remove(existing.storageKey).catch(() => {});
    return updated;
  }

  return prisma.scrutinyReport.create({
    data: { scrutinyResultId, storageKey, isDemo: result.isDemo },
  });
}

export function reportFilename(result: { applicationNumber: string; versionNo: number }): string {
  return `scrutiny-${result.applicationNumber.replace(/\//g, '-')}-V${result.versionNo}.html`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Loading
// ═══════════════════════════════════════════════════════════════════════════

type ReportModel = Awaited<ReturnType<typeof loadForReport>>;

async function loadForReport(scrutinyResultId: string) {
  const row = await prisma.scrutinyResult.findUnique({
    where: { id: scrutinyResultId },
    select: {
      id: true,
      outcome: true,
      summary: true,
      criticalCount: true,
      majorCount: true,
      minorCount: true,
      infoCount: true,
      checksRun: true,
      checksPassed: true,
      evaluatedAt: true,
      issues: {
        select: {
          ruleCode: true,
          severity: true,
          title: true,
          description: true,
          expectedValue: true,
          actualValue: true,
          layer: true,
          rule: { select: { name: true, category: true, remedy: true, reference: true } },
        },
      },
      request: {
        select: {
          engineDriver: true,
          requestedAt: true,
          completedAt: true,
          attempt: true,
          drawingVersion: {
            select: {
              versionNo: true,
              uploadedAt: true,
              file: { select: { originalName: true, checksumSha256: true, sizeBytes: true } },
              drawing: {
                select: {
                  title: true,
                  category: true,
                  applicationId: true,
                  application: {
                    select: {
                      applicationNumber: true,
                      applicant: { select: { name: true } },
                      property: { select: { surveyNumbers: true, localityName: true, district: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!row) throw notFound('That scrutiny result could not be found.');

  const version = row.request.drawingVersion;
  const app = version.drawing.application;

  row.issues.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

  return {
    ...row,
    applicationId: version.drawing.applicationId,
    applicationNumber: app.applicationNumber,
    applicantName: app.applicant?.name ?? '',
    property: [app.property?.surveyNumbers, app.property?.localityName, app.property?.district]
      .filter(Boolean)
      .join(', '),
    versionNo: version.versionNo,
    drawingTitle: version.drawing.title,
    fileName: version.file.originalName,
    checksum: version.file.checksumSha256,
    engineDriver: row.request.engineDriver,
    // Any driver other than a real one produces a demo report. Derived from
    // the recorded driver rather than from current configuration, so a report
    // regenerated years later still says what it said at the time.
    isDemo: row.request.engineDriver !== 'http',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Rendering
// ═══════════════════════════════════════════════════════════════════════════

function render(r: ReportModel): string {
  const passed = r.outcome === 'PASS';
  const failedChecks = r.checksRun - r.checksPassed;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Scrutiny report — ${esc(r.applicationNumber)} V${r.versionNo}</title>
<style>
  :root { --ink:#18181b; --muted:#52525b; --line:#e4e4e7; --bg:#fff;
          --pass:#15803d; --fail:#b91c1c; --warn:#a16207; --info:#1d4ed8; }
  * { box-sizing:border-box; }
  body { margin:0; padding:32px; background:var(--bg); color:var(--ink);
         font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  .sheet { max-width:900px; margin:0 auto; position:relative; }
  ${r.isDemo ? demoWatermarkCss() : ''}
  h1 { font-size:20px; margin:0 0 4px; }
  h2 { font-size:15px; margin:28px 0 10px; padding-bottom:6px; border-bottom:1px solid var(--line); }
  .muted { color:var(--muted); }
  .banner { padding:12px 16px; border-radius:6px; margin:16px 0;
            border:1px solid; font-weight:600; }
  .banner.pass { color:var(--pass); border-color:var(--pass); background:#f0fdf4; }
  .banner.fail { color:var(--fail); border-color:var(--fail); background:#fef2f2; }
  .banner.demo { color:var(--warn); border-color:var(--warn); background:#fefce8;
                 font-weight:700; letter-spacing:.02em; }
  dl.facts { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
             gap:10px 24px; margin:0; }
  dt { font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); }
  dd { margin:2px 0 0; word-break:break-word; }
  .tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:10px; }
  .tile { border:1px solid var(--line); border-radius:6px; padding:12px; }
  .tile .n { font-size:24px; font-weight:600; font-variant-numeric:tabular-nums; }
  .issue { border:1px solid var(--line); border-left-width:4px; border-radius:6px;
           padding:12px 14px; margin-bottom:10px; break-inside:avoid; }
  .issue.CRITICAL,.issue.MAJOR { border-left-color:var(--fail); }
  .issue.MINOR { border-left-color:var(--warn); }
  .issue.INFO { border-left-color:var(--info); }
  .sev { display:inline-block; font-size:10px; font-weight:700; letter-spacing:.05em;
         padding:2px 6px; border-radius:3px; text-transform:uppercase; }
  .sev.CRITICAL,.sev.MAJOR { background:#fee2e2; color:var(--fail); }
  .sev.MINOR { background:#fef9c3; color:var(--warn); }
  .sev.INFO { background:#dbeafe; color:var(--info); }
  .kv { display:grid; grid-template-columns:120px 1fr; gap:2px 12px; margin-top:8px; font-size:13px; }
  .kv span:first-child { color:var(--muted); }
  .remedy { margin-top:8px; padding:8px 10px; background:#f4f4f5; border-radius:4px; font-size:13px; }
  footer { margin-top:32px; padding-top:12px; border-top:1px solid var(--line);
           font-size:11px; color:var(--muted); }
  @media print { body { padding:0; } .sheet { max-width:none; } }
</style>
</head>
<body>
<div class="sheet">

${r.isDemo ? `<div class="banner demo">DEMO SCRUTINY — NOT A COMPLIANCE CERTIFICATE</div>` : ''}

<h1>Automated scrutiny report</h1>
<p class="muted">${esc(env.appName)} · ${esc(r.applicationNumber)} · ${esc(r.drawingTitle)} version ${r.versionNo}</p>

<div class="banner ${passed ? 'pass' : 'fail'}">
  ${passed ? 'PASSED' : 'FAILED'} — ${esc(r.summary)}
</div>

<h2>Application</h2>
<dl class="facts">
  <div><dt>Application number</dt><dd>${esc(r.applicationNumber)}</dd></div>
  <div><dt>Applicant</dt><dd>${esc(r.applicantName) || '<span class="muted">Not recorded</span>'}</dd></div>
  <div><dt>Property</dt><dd>${esc(r.property) || '<span class="muted">Not recorded</span>'}</dd></div>
  <div><dt>Drawing</dt><dd>${esc(r.drawingTitle)} (V${r.versionNo})</dd></div>
  <div><dt>File</dt><dd>${esc(r.fileName)}</dd></div>
  <div><dt>SHA-256</dt><dd style="font-family:ui-monospace,monospace;font-size:11px">${esc(r.checksum)}</dd></div>
  <div><dt>Engine</dt><dd>${esc(r.engineDriver)}${r.isDemo ? ' <strong>(demo)</strong>' : ''}</dd></div>
  <div><dt>Evaluated</dt><dd>${fmt(r.evaluatedAt)}</dd></div>
</dl>

<h2>Checks</h2>
<div class="tiles">
  <div class="tile"><div class="n">${r.checksRun}</div><div class="muted">Checks run</div></div>
  <div class="tile"><div class="n" style="color:var(--pass)">${r.checksPassed}</div><div class="muted">Passed</div></div>
  <div class="tile"><div class="n" style="color:${failedChecks ? 'var(--fail)' : 'inherit'}">${failedChecks}</div><div class="muted">Failed</div></div>
  <div class="tile"><div class="n" style="color:${r.criticalCount ? 'var(--fail)' : 'inherit'}">${r.criticalCount}</div><div class="muted">Critical</div></div>
  <div class="tile"><div class="n" style="color:${r.majorCount ? 'var(--fail)' : 'inherit'}">${r.majorCount}</div><div class="muted">Major</div></div>
  <div class="tile"><div class="n">${r.minorCount}</div><div class="muted">Minor</div></div>
  <div class="tile"><div class="n">${r.infoCount}</div><div class="muted">Advisory</div></div>
</div>

<h2>Findings${r.issues.length ? ` (${r.issues.length})` : ''}</h2>
${
  r.issues.length === 0
    ? `<p class="muted">No issues were raised. Every check the engine ran was satisfied.</p>`
    : r.issues
        .map(
          (i) => `
<div class="issue ${esc(i.severity)}">
  <span class="sev ${esc(i.severity)}">${esc(i.severity)}</span>
  <strong style="margin-left:8px">${esc(i.title)}</strong>
  <span class="muted" style="margin-left:8px;font-size:12px">${esc(i.ruleCode)}${i.rule?.category ? ` · ${esc(i.rule.category)}` : ''}</span>
  <p style="margin:8px 0 0">${esc(i.description)}</p>
  <div class="kv">
    <span>Expected</span><span>${esc(i.expectedValue) || '—'}</span>
    <span>Found</span><span>${esc(i.actualValue) || '—'}</span>
    ${i.layer ? `<span>Layer</span><span>${esc(i.layer)}</span>` : ''}
    ${i.rule?.reference ? `<span>Reference</span><span>${esc(i.rule.reference)}</span>` : ''}
  </div>
  ${i.rule?.remedy ? `<div class="remedy"><strong>What to do:</strong> ${esc(i.rule.remedy)}</div>` : ''}
</div>`
        )
        .join('')
}

<footer>
  Generated ${fmt(new Date())} by ${esc(env.appName)}.
  Engine driver: <strong>${esc(r.engineDriver)}</strong>. Attempt ${r.request.attempt}.
  ${
    r.isDemo
      ? '<br><strong>This report was produced by a demonstration engine. It does not assess compliance with any building rule and carries no statutory weight.</strong>'
      : ''
  }
  ${
    r.issues.some((i) => !i.rule?.reference)
      ? '<br>Findings without a reference are not tied to a published clause.'
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
    content:"DEMO SCRUTINY — NOT A COMPLIANCE CERTIFICATE";
    position:fixed; inset:0; z-index:0; pointer-events:none;
    display:flex; align-items:center; justify-content:center;
    transform:rotate(-30deg);
    font-size:38px; font-weight:800; letter-spacing:.06em;
    color:rgba(185,28,28,.10); white-space:nowrap;
  }
  .sheet > * { position:relative; z-index:1; }
  @media print { .sheet::before { color:rgba(185,28,28,.16); } }`;
}

/** Escapes text for HTML. Everything interpolated above goes through this. */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const fmt = (d: Date): string =>
  new Date(d).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
