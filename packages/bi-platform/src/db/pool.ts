/**
 * PostgreSQL connection pool — thin wrapper around pg.Pool.
 */

import type { Pool as PgPool, PoolConfig, QueryResult } from 'pg';
import type { DbConfig } from './config.js';

export interface DbPool {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
  end(): Promise<void>;
  readonly raw: PgPool;
}

export async function createDbPool(config: DbConfig): Promise<DbPool> {
  // Dynamic import so pg remains a peer dependency
  const { default: pg } = await import('pg');

  const poolConfig: PoolConfig = {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    max: config.maxConnections,
    idleTimeoutMillis: config.idleTimeoutMs,
    connectionTimeoutMillis: config.connectionTimeoutMs,
  };

  const pool = new pg.Pool(poolConfig);

  // Verify connectivity
  const client = await pool.connect();
  client.release();

  return {
    query: <T extends Record<string, unknown>>(text: string, params?: unknown[]) =>
      pool.query<T>(text, params),
    end: () => pool.end(),
    get raw() {
      return pool;
    },
  };
}
