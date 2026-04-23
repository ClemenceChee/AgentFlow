/**
 * Database migration runner — applies SQL migrations in order.
 * Tracks applied migrations in the bi_migrations table.
 */

import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DbPool } from './pool.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

export async function runMigrations(pool: DbPool): Promise<string[]> {
  // Ensure migrations table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bi_migrations (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Get already-applied migrations
  const { rows: applied } = await pool.query<{ name: string }>(
    'SELECT name FROM bi_migrations ORDER BY id',
  );
  const appliedSet = new Set(applied.map((r) => r.name));

  // Read migration files
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

  const newlyApplied: string[] = [];

  for (const file of files) {
    const name = basename(file, '.sql');
    if (appliedSet.has(name)) continue;

    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf-8');
    await pool.query(sql);
    await pool.query('INSERT INTO bi_migrations (name) VALUES ($1)', [name]);
    newlyApplied.push(name);
  }

  return newlyApplied;
}

export async function rollbackLastMigration(pool: DbPool): Promise<string | null> {
  const { rows } = await pool.query<{ name: string }>(
    'SELECT name FROM bi_migrations ORDER BY id DESC LIMIT 1',
  );
  if (rows.length === 0) return null;

  const name = rows[0].name;
  const rollbackFile = join(MIGRATIONS_DIR, `${name}_rollback.sql`);

  try {
    const sql = await readFile(rollbackFile, 'utf-8');
    await pool.query(sql);
  } catch {
    // No rollback file — just remove from tracking
  }

  await pool.query('DELETE FROM bi_migrations WHERE name = $1', [name]);
  return name;
}

// CLI entry point
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/.*\//, ''))) {
  const { loadDbConfig } = await import('./config.js');
  const { createDbPool } = await import('./pool.js');

  const pool = await createDbPool(loadDbConfig());
  try {
    const applied = await runMigrations(pool);
    if (applied.length === 0) {
      console.log('No new migrations to apply.');
    } else {
      console.log(`Applied ${applied.length} migration(s): ${applied.join(', ')}`);
    }
  } finally {
    await pool.end();
  }
}
