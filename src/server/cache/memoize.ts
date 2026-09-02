import 'server-only';

type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

const store = new Map<string, CacheEntry<any>>();
const inFlight = new Map<string, Promise<any>>();

/**
 * High-performance in-memory cache with TTL and thundering-herd protection.
 *
 * @param key Unique cache key
 * @param ttlSeconds Time-to-live in seconds
 * @param fn Async data fetcher
 */
export async function memoizeAsync<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const cached = store.get(key);

  if (cached && cached.expiresAt > now) {
    return cached.data as T;
  }

  // Prevent multiple concurrent DB hits for the same cache key
  const activePromise = inFlight.get(key);
  if (activePromise) {
    return activePromise as Promise<T>;
  }

  const promise = (async () => {
    try {
      const result = await fn();
      store.set(key, {
        data: result,
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
      return result;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

/**
 * Invalidate all keys matching an optional prefix (or everything if no prefix given).
 */
export function invalidateCache(prefix?: string) {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}
