/**
 * Filesystem-based knowledge vault.
 *
 * Stores entities as Markdown files with YAML frontmatter in type-named directories.
 * Maintains a fast-lookup index and mutation log.
 *
 * @module
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { parseEntity, serializeEntity } from './entity.js';
import type { Entity, Vault, VaultConfig } from './types.js';

const DEFAULT_BASE_DIR = '.soma/vault';

interface IndexEntry {
  id: string;
  type: string;
  name: string;
  status: string;
  tags: string[];
  related: string[];
  path: string;
}

interface MutationLogEntry {
  ts: number;
  op: 'create' | 'update' | 'delete';
  id: string;
  type: string;
  fields?: string[];
}

/** Monotonic counter for unique IDs. */
let idCounter = 0;

/**
 * Create a filesystem-based knowledge vault.
 */
export function createVault(config?: VaultConfig): Vault {
  const baseDir = config?.baseDir ?? DEFAULT_BASE_DIR;
  const indexPath = join(baseDir, '_index.json');
  const mutationLogPath = join(baseDir, '_mutations.jsonl');

  let index = new Map<string, IndexEntry>();

  function ensureDir(dir: string): void {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  function entityPath(type: string, id: string): string {
    return join(baseDir, type, `${id}.md`);
  }

  function writeAtomic(filePath: string, content: string): void {
    ensureDir(dirname(filePath));
    const tmpPath = `${filePath}.tmp.${Date.now()}`;
    writeFileSync(tmpPath, content, 'utf-8');
    renameSync(tmpPath, filePath);
  }

  function logMutation(entry: MutationLogEntry): void {
    ensureDir(baseDir);
    writeFileSync(mutationLogPath, `${JSON.stringify(entry)}\n`, { flag: 'a' });
  }

  function generateId(type: string, name: string): string {
    // Normalize name to create a filesystem-safe ID
    const normalized = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return normalized || `${type}-${Date.now()}-${idCounter++}`;
  }

  function updateIndex(entity: Entity, filePath: string): void {
    index.set(entity.id, {
      id: entity.id,
      type: entity.type,
      name: entity.name,
      status: entity.status,
      tags: entity.tags,
      related: entity.related,
      path: filePath,
    });
    saveIndex();
  }

  function removeFromIndex(id: string): void {
    index.delete(id);
    saveIndex();
  }

  function saveIndex(): void {
    ensureDir(baseDir);
    const entries = Object.fromEntries(index);
    writeFileSync(indexPath, JSON.stringify(entries, null, 2), 'utf-8');
  }

  function loadIndex(): void {
    if (existsSync(indexPath)) {
      try {
        const data = JSON.parse(readFileSync(indexPath, 'utf-8'));
        index = new Map(Object.entries(data));
      } catch {
        index = new Map();
      }
    }
  }

  function rebuildIndex(): void {
    index = new Map();
    if (!existsSync(baseDir)) return;

    for (const typeDir of readdirSync(baseDir)) {
      if (typeDir.startsWith('_') || typeDir.startsWith('.')) continue;
      const typePath = join(baseDir, typeDir);
      try {
        const files = readdirSync(typePath).filter((f) => f.endsWith('.md'));
        for (const file of files) {
          const filePath = join(typePath, file);
          try {
            const content = readFileSync(filePath, 'utf-8');
            const entity = parseEntity(content, { type: typeDir, id: basename(file, '.md') });
            if (!entity.id) entity.id = basename(file, '.md');
            index.set(entity.id, {
              id: entity.id,
              type: entity.type,
              name: entity.name,
              status: entity.status,
              tags: entity.tags,
              related: entity.related,
              path: filePath,
            });
          } catch {
            // Skip unparseable files
          }
        }
      } catch {
        // Skip non-directories
      }
    }

    saveIndex();
  }

  // Initialize: load or rebuild index
  loadIndex();
  if (index.size === 0 && existsSync(baseDir)) {
    rebuildIndex();
  }

  return {
    baseDir,

    create(partial) {
      const now = new Date().toISOString();
      const id = partial.id ?? generateId(partial.type, partial.name);
      const entity: Entity = {
        ...partial,
        type: partial.type,
        id,
        name: partial.name,
        status: partial.status ?? 'active',
        created: partial.created ?? now,
        updated: now,
        tags: partial.tags ?? [],
        related: partial.related ?? [],
        body: partial.body ?? '',
      };

      const fp = entityPath(entity.type, entity.id);
      writeAtomic(fp, serializeEntity(entity));
      updateIndex(entity, fp);
      logMutation({ ts: Date.now(), op: 'create', id: entity.id, type: entity.type });

      return entity.id;
    },

    read(type, id) {
      // Try index first
      const entry = index.get(id);
      if (entry && existsSync(entry.path)) {
        try {
          const content = readFileSync(entry.path, 'utf-8');
          return parseEntity(content, { type, id });
        } catch {
          return null;
        }
      }

      // Fallback: try direct path
      const fp = entityPath(type, id);
      if (!existsSync(fp)) return null;
      try {
        const content = readFileSync(fp, 'utf-8');
        return parseEntity(content, { type, id });
      } catch {
        return null;
      }
    },

    update(id, patch) {
      const entry = index.get(id);
      if (!entry) return;

      const existing = this.read(entry.type, id);
      if (!existing) return;

      const updated: Entity = {
        ...existing,
        ...patch,
        updated: new Date().toISOString(),
      };

      writeAtomic(entry.path, serializeEntity(updated));
      updateIndex(updated, entry.path);
      logMutation({
        ts: Date.now(),
        op: 'update',
        id,
        type: entry.type,
        fields: Object.keys(patch),
      });
    },

    remove(id) {
      const entry = index.get(id);
      if (!entry) return;

      try {
        rmSync(entry.path);
      } catch {
        /* already gone */
      }
      removeFromIndex(id);
      logMutation({ ts: Date.now(), op: 'delete', id, type: entry.type });
    },

    list(type, filter?) {
      const limit = filter?.limit ?? 1000;
      const results: Entity[] = [];

      for (const entry of index.values()) {
        if (entry.type !== type) continue;

        // Apply filters
        if (filter) {
          let match = true;
          for (const [key, value] of Object.entries(filter)) {
            if (key === 'limit' || key === 'offset') continue;
            if ((entry as unknown as Record<string, unknown>)[key] !== value) {
              // Also check by reading the full entity for non-indexed fields
              match = false;
              break;
            }
          }
          if (!match) continue;
        }

        const entity = this.read(type, entry.id);
        if (entity) results.push(entity);
        if (results.length >= limit) break;
      }

      return results;
    },

    findByTag(tag) {
      const results: Entity[] = [];
      for (const entry of index.values()) {
        if (entry.tags.includes(tag)) {
          const entity = this.read(entry.type, entry.id);
          if (entity) results.push(entity);
        }
      }
      return results;
    },

    findLinked(id) {
      const entry = index.get(id);
      if (!entry) return [];

      const results: Entity[] = [];
      for (const link of entry.related) {
        // Parse wikilink: "type/name" → type, name
        const parts = link.split('/');
        if (parts.length >= 2) {
          const linkedType = parts[0]!;
          const linkedId = parts.slice(1).join('/');
          const entity = this.read(linkedType, linkedId);
          if (entity) results.push(entity);
        }
      }
      return results;
    },

    rebuildIndex,
  };
}
