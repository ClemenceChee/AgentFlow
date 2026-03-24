/**
 * Vault migration — assigns existing flat entities to the four-layer system.
 *
 * Adds `layer: 'archive'` and `source_worker: 'migration'` to all entities
 * that lack a `layer` field. Non-destructive and idempotent.
 *
 * @module
 */

import type { Entity, Vault } from './types.js';

export interface MigrationResult {
  migrated: number;
  skipped: number;
  errors: number;
}

/**
 * Migrate existing vault entities to the four-layer system.
 * Assigns all entities without a `layer` field to L1 (archive).
 *
 * Idempotent: entities already having a `layer` field are skipped.
 */
export function migrateToLayers(vault: Vault): MigrationResult {
  const allTypes = [
    'agent',
    'execution',
    'archetype',
    'insight',
    'policy',
    'decision',
    'assumption',
    'constraint',
    'contradiction',
    'synthesis',
  ];

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const type of allTypes) {
    const entities = vault.list(type, { limit: 100000 });
    for (const entity of entities) {
      if (entity.layer) {
        skipped++;
        continue;
      }

      try {
        vault.update(entity.id, {
          layer: 'archive',
          source_worker: 'migration',
        } as Partial<Entity>);
        migrated++;
      } catch (err) {
        console.error(
          `[Migration] Failed to migrate ${type}/${entity.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
        errors++;
      }
    }
  }

  return { migrated, skipped, errors };
}
