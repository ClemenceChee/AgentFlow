/**
 * Database module — exports pool, config, and migration utilities.
 */

export type { DbConfig } from './config.js';
export { loadDbConfig } from './config.js';
export { rollbackLastMigration, runMigrations } from './migrate.js';
export type { DbPool } from './pool.js';
export { createDbPool } from './pool.js';
