/**
 * Redis-backed cache for business intelligence queries.
 *
 * Provides get/set/invalidate with TTL support and key namespacing.
 * Falls back gracefully when Redis is unavailable.
 */

import type { CacheConfig } from './config.js';

export interface CacheClient {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  invalidatePattern(pattern: string): Promise<number>;
  getStats(): CacheStats;
  close(): Promise<void>;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  errors: number;
}

export async function createCacheClient(config: CacheConfig): Promise<CacheClient> {
  const { default: Redis } = await import('ioredis');

  const redis = new Redis({
    host: config.host,
    port: config.port,
    password: config.password || undefined,
    db: config.db,
    keyPrefix: config.keyPrefix,
    maxRetriesPerRequest: config.maxRetries,
    lazyConnect: true,
    retryStrategy(times) {
      if (times > config.maxRetries) return null;
      return Math.min(times * 200, 2000);
    },
  });

  await redis.connect();

  let hits = 0;
  let misses = 0;
  let errors = 0;

  return {
    async get<T = unknown>(key: string): Promise<T | null> {
      try {
        const raw = await redis.get(key);
        if (raw === null) {
          misses++;
          return null;
        }
        hits++;
        return JSON.parse(raw) as T;
      } catch {
        errors++;
        return null;
      }
    },

    async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
      try {
        const ttl = ttlSeconds ?? config.defaultTtlSeconds;
        await redis.set(key, JSON.stringify(value), 'EX', ttl);
      } catch {
        errors++;
      }
    },

    async del(key: string): Promise<void> {
      try {
        await redis.del(key);
      } catch {
        errors++;
      }
    },

    async invalidatePattern(pattern: string): Promise<number> {
      try {
        const keys = await redis.keys(pattern);
        if (keys.length === 0) return 0;
        // Keys already have prefix from ioredis, but keys() returns with prefix
        // We need to strip the prefix before deleting since del() adds it again
        const stripped = keys.map((k) =>
          k.startsWith(config.keyPrefix) ? k.slice(config.keyPrefix.length) : k,
        );
        return await redis.del(...stripped);
      } catch {
        errors++;
        return 0;
      }
    },

    getStats(): CacheStats {
      const total = hits + misses;
      return {
        hits,
        misses,
        hitRate: total > 0 ? hits / total : 0,
        errors,
      };
    },

    async close(): Promise<void> {
      await redis.quit();
    },
  };
}

/**
 * In-memory cache fallback when Redis is unavailable.
 */
export function createMemoryCache(defaultTtlSeconds = 300): CacheClient {
  const store = new Map<string, { value: string; expiresAt: number }>();
  let hits = 0;
  let misses = 0;

  function evictExpired() {
    const now = Date.now();
    for (const [k, v] of store) {
      if (v.expiresAt <= now) store.delete(k);
    }
  }

  return {
    async get<T = unknown>(key: string): Promise<T | null> {
      const entry = store.get(key);
      if (!entry || entry.expiresAt <= Date.now()) {
        if (entry) store.delete(key);
        misses++;
        return null;
      }
      hits++;
      return JSON.parse(entry.value) as T;
    },

    async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
      const ttl = ttlSeconds ?? defaultTtlSeconds;
      store.set(key, {
        value: JSON.stringify(value),
        expiresAt: Date.now() + ttl * 1000,
      });
      if (store.size > 10_000) evictExpired();
    },

    async del(key: string): Promise<void> {
      store.delete(key);
    },

    async invalidatePattern(pattern: string): Promise<number> {
      const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
      let count = 0;
      for (const key of store.keys()) {
        if (regex.test(key)) {
          store.delete(key);
          count++;
        }
      }
      return count;
    },

    getStats(): CacheStats {
      const total = hits + misses;
      return { hits, misses, hitRate: total > 0 ? hits / total : 0, errors: 0 };
    },

    async close(): Promise<void> {
      store.clear();
    },
  };
}
