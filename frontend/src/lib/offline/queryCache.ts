const store = new Map<string, unknown>();
let epoch = 0;

export function peekQuery<T>(key: string): T | undefined {
  if (!store.has(key)) return undefined;
  return store.get(key) as T;
}

export async function cachedQuery<T>(
  key: string,
  load: () => Promise<T>,
  options?: { fresh?: boolean },
): Promise<T> {
  for (;;) {
    const start = epoch;
    if (!options?.fresh && store.has(key)) return store.get(key) as T;
    const value = await load();
    // A sync/hydration may have invalidated while we were reading IndexedDB.
    // Retry instead of caching a stale empty page over fresh data.
    if (start !== epoch) continue;
    store.set(key, value);
    return value;
  }
}

export function setQueryCache<T>(key: string, value: T) {
  store.set(key, value);
}

export function invalidateQuery(key: string) {
  store.delete(key);
}

export function invalidateQueryPrefix(prefix: string) {
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export function invalidateQueries() {
  epoch += 1;
  store.clear();
}
