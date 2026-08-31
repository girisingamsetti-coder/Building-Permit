import 'server-only';
import type { ScanStatus } from '@prisma/client';
import { env } from '@/server/config/env';

/**
 * Antivirus — docs/07-subsystems.md P.5.
 *
 * The integration point exists from day one so that turning scanning on is
 * CONFIGURATION rather than a refactor. Files are written with
 * `scanStatus = PENDING` and the download route refuses to serve anything not
 * yet cleared, so the control is real even while the only driver is a no-op:
 * the plumbing that would gate an infected file is already load-bearing.
 */

export interface ScanProvider {
  readonly name: string;
  readonly configured: boolean;
  scan(input: { bytes: Buffer; filename: string }): Promise<{ status: ScanStatus; detail: string }>;
}

/**
 * No scanner configured.
 *
 * Marks SKIPPED, never CLEAN. The difference is the whole point: CLEAN claims
 * a check happened. The UI labels SKIPPED as "Not scanned" for the same
 * reason — an operator deciding whether this deployment is fit for public use
 * needs to be able to see that nothing is scanning.
 */
class NoopScanProvider implements ScanProvider {
  readonly name = 'noop';
  readonly configured = false;

  async scan() {
    return { status: 'SKIPPED' as ScanStatus, detail: 'No antivirus provider is configured.' };
  }
}

/**
 * ClamAV over its INSTREAM protocol.
 *
 * NOT IMPLEMENTED. It needs a reachable clamd sidecar, which is a deployment
 * decision rather than something to stub convincingly. It reports FAILED —
 * not SKIPPED and certainly not CLEAN — so a deployment that selected ClamAV
 * and did not get it produces visibly unservable files rather than silently
 * unscanned ones.
 */
class ClamAvScanProvider implements ScanProvider {
  readonly name = 'clamav';
  readonly configured = false;

  async scan() {
    return {
      status: 'FAILED' as ScanStatus,
      detail:
        'ANTIVIRUS_PROVIDER=clamav is selected but the ClamAV driver is not built in this ' +
        'release. Files cannot be cleared for download until a scanner is available.',
    };
  }
}

function create(): ScanProvider {
  return env.antivirusProvider === 'clamav' ? new ClamAvScanProvider() : new NoopScanProvider();
}

const globalForScanner = globalThis as unknown as { scanner?: ScanProvider };

export const scanner: ScanProvider = globalForScanner.scanner ?? create();

if (!env.isProduction) globalForScanner.scanner = scanner;
