import 'server-only';
import { env } from '@/server/config/env';
import { serviceUnavailable } from '@/server/http/errors';
import { LocalStorageProvider } from './local';
import type { PutInput, StorageProvider, StoredObject } from './types';

export { buildStorageKey } from './types';
export type { StorageProvider, PutInput, StoredObject } from './types';

/**
 * Resolves the configured storage provider. One instance per process.
 *
 * Business code imports `storage`, never a concrete provider, so switching
 * from filesystem to object storage is an environment variable rather than a
 * refactor.
 */

/**
 * S3-compatible object storage.
 *
 * NOT IMPLEMENTED, and it fails loudly rather than quietly.
 *
 * Implementing it needs `@aws-sdk/client-s3`, which is not a dependency of
 * this project yet — adding a ~20 MB SDK is a deployment decision, not
 * something to slip into a feature branch. The interface is what matters and
 * it is settled: dropping in a real S3 provider is one file and one line of
 * the switch below, with no call site touched.
 *
 * Every method throws the same 503 so that a misconfiguration surfaces as an
 * honest "not available" the first time a file is touched, rather than as a
 * silent no-op that loses a citizen's drawing.
 */
class UnconfiguredS3Provider implements StorageProvider {
  readonly name = 's3';
  readonly configured = false;

  private refuse(): never {
    throw serviceUnavailable(
      'Object storage is selected but not installed on this build. ' +
        'Install @aws-sdk/client-s3 and enable the S3 provider, or set STORAGE_PROVIDER=local for development.'
    );
  }

  async put(_input: PutInput): Promise<StoredObject> {
    this.refuse();
  }
  async get(_key: string): Promise<Buffer> {
    this.refuse();
  }
  async exists(_key: string): Promise<boolean> {
    this.refuse();
  }
  async remove(_key: string): Promise<void> {
    this.refuse();
  }
}

function create(): StorageProvider {
  switch (env.storageProvider) {
    case 's3':
      return new UnconfiguredS3Provider();
    case 'local':
    default:
      return new LocalStorageProvider();
  }
}

// Cached on globalThis for the same reason the Prisma client is: Next reloads
// modules on every edit in development, and a new provider per reload would
// leak file handles.
const globalForStorage = globalThis as unknown as { storage?: StorageProvider };

export const storage: StorageProvider = globalForStorage.storage ?? create();

if (!env.isProduction) globalForStorage.storage = storage;
