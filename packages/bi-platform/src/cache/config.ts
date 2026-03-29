/**
 * Redis cache configuration — reads from environment variables.
 */

export interface CacheConfig {
  host: string;
  port: number;
  password: string;
  db: number;
  keyPrefix: string;
  defaultTtlSeconds: number;
  maxRetries: number;
}

export function loadCacheConfig(): CacheConfig {
  return {
    host: process.env.BI_REDIS_HOST ?? 'localhost',
    port: Number(process.env.BI_REDIS_PORT ?? 6379),
    password: process.env.BI_REDIS_PASSWORD ?? '',
    db: Number(process.env.BI_REDIS_DB ?? 0),
    keyPrefix: process.env.BI_REDIS_KEY_PREFIX ?? 'bi:',
    defaultTtlSeconds: Number(process.env.BI_CACHE_TTL_SECONDS ?? 300),
    maxRetries: Number(process.env.BI_REDIS_MAX_RETRIES ?? 3),
  };
}
