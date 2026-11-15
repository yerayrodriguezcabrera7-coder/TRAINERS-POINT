// Optimized query cache with LRU-like eviction
class QueryCache {
  private cache: Map<string, { value: unknown; expires: number }> = new Map();
  private maxSize: number;
  private ttlMs: number;
  private order: string[] = [];

  constructor(maxSize = 100, ttlMs = 60000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return undefined;
    }
    this.order = this.order.filter(k => k !== key);
    this.order.push(key);
    return entry.value as T;
  }

  set(key: string, value: unknown): void {
    this.cache.set(key, { value, expires: Date.now() + this.ttlMs });
    this.order.push(key);
    while (this.cache.size > this.maxSize) {
      const oldest = this.order.shift();
      if (oldest) this.cache.delete(oldest);
    }
  }

  clear(): void {
    this.cache.clear();
    this.order = [];
  }
}

export const queryCache = new QueryCache(100, 60000);