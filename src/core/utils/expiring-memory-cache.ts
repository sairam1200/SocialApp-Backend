export class ExpiringMemoryCache<K, V> {
  private store = new Map<K, { value: V; expiresAt: number }>();
  private defaultTTL: number;

  constructor(defaultTTLMs: number = 12 * 60 * 60 * 1000) {
    this.defaultTTL = defaultTTLMs;
  }

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V, ttl?: number): void {
    const ttlMs = ttl ?? this.defaultTTL;
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: K): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }
}
