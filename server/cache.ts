/**
 * TTL cache that keeps expired entries as a stale fallback ("cached data with Last updated").
 * Concurrent requests for the same key share one in-flight promise.
 */
export interface CacheResult<T> {
  value: T;
  fetchedAt: number;
  stale: boolean;
}

export class TtlCache {
  private store = new Map<string, { value: unknown; fetchedAt: number; expires: number }>();
  private inflight = new Map<string, Promise<unknown>>();

  constructor(
    private maxEntries = 500,
    private now: () => number = Date.now,
  ) {}

  async getOrLoad<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<CacheResult<T>> {
    const hit = this.store.get(key);
    const t = this.now();
    if (hit && hit.expires > t)
      return { value: hit.value as T, fetchedAt: hit.fetchedAt, stale: false };
    try {
      let p = this.inflight.get(key) as Promise<T> | undefined;
      if (!p) {
        p = load();
        this.inflight.set(key, p);
      }
      const value = await p;
      this.set(key, value, ttlMs);
      return { value, fetchedAt: this.now(), stale: false };
    } catch (err) {
      if (hit) return { value: hit.value as T, fetchedAt: hit.fetchedAt, stale: true };
      throw err;
    } finally {
      this.inflight.delete(key);
    }
  }

  set(key: string, value: unknown, ttlMs: number): void {
    const t = this.now();
    this.store.delete(key);
    this.store.set(key, { value, fetchedAt: t, expires: t + ttlMs });
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  clear(): void {
    this.store.clear();
  }
}
