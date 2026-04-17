/**
 * Database configuration — reads from environment variables.
 * No hardcoded connection strings or credentials.
 */

export interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  maxConnections: number;
  idleTimeoutMs: number;
  connectionTimeoutMs: number;
}

export function loadDbConfig(): DbConfig {
  return {
    host: process.env.BI_DB_HOST ?? 'localhost',
    port: Number(process.env.BI_DB_PORT ?? 5432),
    database: process.env.BI_DB_NAME ?? 'bi_platform',
    user: process.env.BI_DB_USER ?? 'bi_platform',
    password: process.env.BI_DB_PASSWORD ?? '',
    ssl: process.env.BI_DB_SSL === 'true',
    maxConnections: Number(process.env.BI_DB_MAX_CONNECTIONS ?? 20),
    idleTimeoutMs: Number(process.env.BI_DB_IDLE_TIMEOUT_MS ?? 30_000),
    connectionTimeoutMs: Number(process.env.BI_DB_CONNECTION_TIMEOUT_MS ?? 5_000),
  };
}
