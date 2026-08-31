import 'server-only';
import { env } from '@/server/config/env';
import { MockScrutinyProvider } from './mock';
import { HttpScrutinyProvider } from './http';
import type { ScrutinyProvider } from './types';

export type {
  ScrutinyProvider,
  ScrutinyAck,
  ScrutinyOutcome,
  ScrutinySubmission,
  ScrutinyContext,
  ScrutinyIssueInput,
  ScrutinySeverity,
} from './types';

/**
 * Resolves the configured scrutiny driver.
 *
 * Business code imports `scrutinyProvider` and never a concrete class. That is
 * what makes "the architecture does not depend on the mock" a testable claim
 * rather than an aspiration — swapping the driver is an environment variable,
 * and the integration suite proves the resulting application state is
 * identical either way.
 */

function create(): ScrutinyProvider {
  return env.scrutinyProvider === 'http' ? new HttpScrutinyProvider() : new MockScrutinyProvider();
}

const globalForScrutiny = globalThis as unknown as { scrutinyProvider?: ScrutinyProvider };

export const scrutinyProvider: ScrutinyProvider = globalForScrutiny.scrutinyProvider ?? create();

if (!env.isProduction) globalForScrutiny.scrutinyProvider = scrutinyProvider;

/**
 * Overrides the driver for the duration of a test.
 *
 * Exported rather than reached for via module mocking so the swap is explicit
 * and reversible, and so the provider-independence test can run the same path
 * twice without two processes.
 */
export function __setScrutinyProviderForTests(provider: ScrutinyProvider | null): void {
  globalForScrutiny.scrutinyProvider = provider ?? create();
}

/** The live driver, re-read each call so a test override takes effect. */
export const currentProvider = (): ScrutinyProvider =>
  globalForScrutiny.scrutinyProvider ?? scrutinyProvider;
