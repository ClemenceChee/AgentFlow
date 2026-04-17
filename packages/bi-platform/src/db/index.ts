/**
 * Database module — exports pool, config, and migration utilities.
 */

export { loadDbConfig } from './config.js';
export type { DbConfig } from './config.js';
export { createDbPool } from './pool.js';
export type { DbPool } from './pool.js';
export { runMigrations, rollbackLastMigration } from './migrate.js';
