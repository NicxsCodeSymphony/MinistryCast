const store = new Map<string, unknown>();

export function peekQuery<T>(key: string): T | undefined {
  if (!store.has(key)) return undefined;
  return store.get(key) as T;
}

export async function cachedQuery<T>(
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  if (store.has(key)) return store.get(key) as T;
  const value = await load();
  store.set(key, value);
  return value;
}

export function invalidateQueries() {
  store.clear();
}
