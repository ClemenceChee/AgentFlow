/**
 * Filesystem-based knowledge vault.
 *
 * Stores entities as Markdown files with YAML frontmatter in type-named directories.
 * Maintains a fast-lookup index and mutation log.
 *
 * Hardening features (soma-foundation-hardening):
 * - File-based write locking with O_EXCL, PID tracking, stale detection
 * - Disk space check before writes
 * - Temp file cleanup on init
 * - Index corruption recovery with spot-check validation
 * - Mutation log rotation at 10MB
 * - Layer field in index entries + listByLayer()
 * - vault.update() rejects layer field changes
 * - Atomic write cleanup on failure
 * - vaultFingerprint() export
 *
 * @module
 */

import {
  closeSync,
  constants,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statfsSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join, basename, dirname } from 'node:path';
import { parseEntity, serializeEntity } from './entity.js';
import type { Entity, KnowledgeLayer, QueryFilter, Vault, VaultConfig } from './types.js';

const DEFAULT_BASE_DIR = '.soma/vault';

/** Vault identity file — written once on init, stable across content changes. */
const VAULT_ID_FILE = '_vault_id.json';

/** Minimum available disk space in bytes before writes are rejected (10MB). */
const MIN_DISK_SPACE_BYTES = 10 * 1024 * 1024;

/** Maximum mutation log size in bytes before rotation (10MB). */
const MAX_MUTATION_LOG_BYTES = 10 * 1024 * 1024;

/** Lock acquisition timeout in milliseconds. */
const LOCK_TIMEOUT_MS = 5000;

/** Lock polling interval in milliseconds. */
const LOCK_POLL_MS = 50;

interface IndexEntry {
  id: string;
  type: string;
  name: string;
  status: string;
  tags: string[];
  related: string[];
  path: string;
  layer?: string;
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

// ---------------------------------------------------------------------------
// Vault fingerprint
// ---------------------------------------------------------------------------

/**
 * Compute a fingerprint (SHA-256 hash) of the vault's _index.json.
 * Returns an empty string if the index does not exist.
 *
 * Hash the vault identity file to produce a stable fingerprint.
 * Unlike the old index-based fingerprint, this only changes when the
 * vault is wiped and re-created (identity file is regenerated).
 */
export function vaultFingerprint(baseDir: string): string {
  const idPath = join(baseDir, VAULT_ID_FILE);
  if (!existsSync(idPath)) return '';
  try {
    const content = readFileSync(idPath, 'utf-8');
    return createHash('sha256').update(content).digest('hex');
  } catch {
    return '';
  }
}

/**
 * Count the total number of entity entries in the vault index.
 * Workers use this to detect vault restructuring (deletions/migrations)
 * without being invalidated by other workers' writes.
 *
 * State should only reset when entity count *decreases* (indicating
 * vault restructuring), not when new entities are added.
 */
export function vaultEntityCount(baseDir: string): number {
  const indexPath = join(baseDir, '_index.json');
  if (!existsSync(indexPath)) return 0;
  try {
    const content = readFileSync(indexPath, 'utf-8');
    const index = JSON.parse(content);
    if (typeof index === 'object' && index !== null) {
      return Object.keys(index).length;
    }
    return 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// File locking helpers
// ---------------------------------------------------------------------------

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireLock(lockPath: string): void {
  const startTime = Date.now();

  // Attempt stale lock recovery on first try
  if (existsSync(lockPath)) {
    try {
      const content = readFileSync(lockPath, 'utf-8');
      const pid = parseInt(content.trim(), 10);
      if (!isNaN(pid) && !isProcessAlive(pid)) {
        // Stale lock — owning process is dead
        try { unlinkSync(lockPath); } catch { /* race with another cleaner */ }
      }
    } catch {
      // Can't read lock file, try to remove it
      try { unlinkSync(lockPath); } catch { /* ignore */ }
    }
  }

  while (true) {
    try {
      // O_WRONLY | O_CREAT | O_EXCL — atomic create, fails if file exists
      const fd = openSync(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL);
      writeFileSync(fd, `${process.pid}\n`);
      closeSync(fd);
      return;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') throw err;

      // Lock exists — check for stale
      try {
        const content = readFileSync(lockPath, 'utf-8');
        const pid = parseInt(content.trim(), 10);
        if (!isNaN(pid) && !isProcessAlive(pid)) {
          try { unlinkSync(lockPath); } catch { /* race */ }
          continue; // Retry immediately after removing stale lock
        }
      } catch {
        // Can't read lock file, may have been released — retry
        continue;
      }

      if (Date.now() - startTime >= LOCK_TIMEOUT_MS) {
        throw new Error(`Vault lock timeout: could not acquire ${lockPath} within ${LOCK_TIMEOUT_MS}ms`);
      }

      // Busy-wait (synchronous context — no async available)
      const waitUntil = Date.now() + LOCK_POLL_MS;
      while (Date.now() < waitUntil) { /* spin */ }
    }
  }
}

function releaseLock(lockPath: string): void {
  try { unlinkSync(lockPath); } catch { /* already released */ }
}

// ---------------------------------------------------------------------------
// Disk space check
// ---------------------------------------------------------------------------

function checkDiskSpace(dirPath: string): void {
  try {
    const stats = statfsSync(dirPath);
    const available = stats.bavail * stats.bsize;
    if (available < MIN_DISK_SPACE_BYTES) {
      throw new Error(
        `Insufficient disk space: ${Math.round(available / 1024 / 1024)}MB available, ` +
        `minimum ${Math.round(MIN_DISK_SPACE_BYTES / 1024 / 1024)}MB required`,
      );
    }
  } catch (err: unknown) {
    // If it's our own error, rethrow
    if (err instanceof Error && err.message.startsWith('Insufficient disk space')) throw err;
    // Otherwise (e.g., statfsSync not supported on platform), skip the check
  }
}

// ---------------------------------------------------------------------------
// Temp file cleanup
// ---------------------------------------------------------------------------

function cleanupTempFiles(baseDir: string): number {
  let cleaned = 0;
  if (!existsSync(baseDir)) return cleaned;

  try {
    for (const entry of readdirSync(baseDir)) {
      if (entry.startsWith('_') || entry.startsWith('.')) continue;
      const typePath = join(baseDir, entry);
      try {
        const stat = statSync(typePath);
        if (!stat.isDirectory()) continue;
        for (const file of readdirSync(typePath)) {
          if (file.includes('.tmp.')) {
            try {
              unlinkSync(join(typePath, file));
              cleaned++;
            } catch { /* already gone */ }
          }
        }
      } catch { /* skip non-directories or unreadable entries */ }
    }
  } catch { /* base dir not readable */ }

  // Also clean tmp files in the base dir itself (e.g., _index.json.tmp.*)
  try {
    for (const file of readdirSync(baseDir)) {
      if (file.includes('.tmp.')) {
        try {
          unlinkSync(join(baseDir, file));
          cleaned++;
        } catch { /* already gone */ }
      }
    }
  } catch { /* ignore */ }

  return cleaned;
}

// ---------------------------------------------------------------------------
// createVault
// ---------------------------------------------------------------------------

/**
 * Create a filesystem-based knowledge vault.
 */
export function createVault(config?: VaultConfig): Vault {
  const baseDir = config?.baseDir ?? DEFAULT_BASE_DIR;
  const indexPath = join(baseDir, '_index.json');
  const mutationLogPath = join(baseDir, '_mutations.jsonl');
  const lockPath = join(baseDir, '_vault.lock');

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
    try {
      writeFileSync(tmpPath, content, 'utf-8');
      renameSync(tmpPath, filePath);
    } catch (err) {
      // Cleanup temp file on failure
      try { unlinkSync(tmpPath); } catch (cleanupErr) { console.warn(`[Vault] Failed to clean up temp file ${tmpPath}:`, (cleanupErr as Error).message); }
      throw err;
    }
  }

  function rotateMutationLog(): void {
    try {
      const stat = statSync(mutationLogPath);
      if (stat.size >= MAX_MUTATION_LOG_BYTES) {
        const rotatedPath = join(baseDir, `_mutations.${Date.now()}.jsonl`);
        renameSync(mutationLogPath, rotatedPath);
      }
    } catch {
      // File doesn't exist yet or can't stat — no rotation needed
    }
  }

  function logMutation(entry: MutationLogEntry): void {
    ensureDir(baseDir);
    rotateMutationLog();
    writeFileSync(mutationLogPath, `${JSON.stringify(entry)}\n`, { flag: 'a' });
  }

  function generateId(type: string, name: string): string {
    // Normalize name to create a filesystem-safe ID
    const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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
      layer: entity.layer,
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
    writeAtomic(indexPath, JSON.stringify(entries, null, 2));
  }

  function loadIndex(): void {
    if (existsSync(indexPath)) {
      try {
        const data = JSON.parse(readFileSync(indexPath, 'utf-8'));
        index = new Map(Object.entries(data));
      } catch {
        // Corrupt index — rebuild from disk
        rebuildIndex();
      }
    }
  }

  /**
   * Validate the loaded index by spot-checking that at least 10% of indexed
   * entries actually exist on disk. If validation fails, trigger a full rebuild.
   */
  function validateIndex(): boolean {
    if (index.size === 0) return true;

    const entries = Array.from(index.values());
    const sampleSize = Math.max(1, Math.ceil(entries.length * 0.1));

    // Deterministic sample: every Nth entry
    const step = Math.max(1, Math.floor(entries.length / sampleSize));
    let missingCount = 0;
    let checkedCount = 0;

    for (let i = 0; i < entries.length && checkedCount < sampleSize; i += step) {
      checkedCount++;
      const entry = entries[i]!;
      if (!existsSync(entry.path)) {
        missingCount++;
      }
    }

    // If more than half the sample is missing, index is stale — rebuild
    if (missingCount > checkedCount / 2) {
      rebuildIndex();
      return false;
    }
    return true;
  }

  function rebuildIndex(): void {
    index = new Map();
    if (!existsSync(baseDir)) return;

    for (const typeDir of readdirSync(baseDir)) {
      if (typeDir.startsWith('_') || typeDir.startsWith('.')) continue;
      const typePath = join(baseDir, typeDir);
      try {
        const stat = statSync(typePath);
        if (!stat.isDirectory()) continue;
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
              layer: entity.layer,
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

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  // Clean up orphaned temp files from previous crashes
  const cleanedCount = cleanupTempFiles(baseDir);
  if (cleanedCount > 0) {
    process.stderr.write(`[soma/vault] cleaned up ${cleanedCount} orphaned temp file(s)\n`);
  }

  // Recover stale locks left by crashed processes
  if (existsSync(lockPath)) {
    try {
      const content = readFileSync(lockPath, 'utf-8');
      const pid = parseInt(content.trim(), 10);
      if (!isNaN(pid) && !isProcessAlive(pid)) {
        try { unlinkSync(lockPath); } catch { /* race */ }
      }
    } catch {
      try { unlinkSync(lockPath); } catch { /* ignore */ }
    }
  }

  // Load or rebuild index
  loadIndex();
  if (index.size === 0 && existsSync(baseDir)) {
    rebuildIndex();
  } else if (index.size > 0) {
    // Spot-check validation on loaded index
    validateIndex();
  }

  // Ensure vault identity file exists (backfills existing vaults)
  const vaultIdPath = join(baseDir, VAULT_ID_FILE);
  if (existsSync(baseDir) && !existsSync(vaultIdPath)) {
    writeAtomic(vaultIdPath, JSON.stringify({
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    }, null, 2) + '\n');
  }

  // ---------------------------------------------------------------------------
  // onRead callback (wired post-construction via setOnRead)
  // ---------------------------------------------------------------------------

  let onReadCallback = config?.onRead;

  /** Internal read — no hooks, used by batch methods. */
  function _readRaw(type: string, id: string): Entity | null {
    const entry = index.get(id);
    if (entry && existsSync(entry.path)) {
      try {
        const content = readFileSync(entry.path, 'utf-8');
        return parseEntity(content, { type, id });
      } catch {
        return null;
      }
    }
    const fp = entityPath(type, id);
    if (!existsSync(fp)) return null;
    try {
      const content = readFileSync(fp, 'utf-8');
      return parseEntity(content, { type, id });
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Vault object
  // ---------------------------------------------------------------------------

  return {
    baseDir,

    setOnRead(callback: (entity: Entity) => void) {
      onReadCallback = callback;
    },

    create(partial) {
      ensureDir(baseDir);
      checkDiskSpace(baseDir);
      acquireLock(lockPath);
      try {
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
      } finally {
        releaseLock(lockPath);
      }
    },

    read(type, id) {
      const entity = _readRaw(type, id);
      if (entity && onReadCallback) {
        try { onReadCallback(entity); } catch { /* don't break reads */ }
      }
      return entity;
    },

    update(id, patch) {
      // Reject layer field changes — must go through writeToLayer / governance API
      if ('layer' in patch && patch.layer !== undefined) {
        const entry = index.get(id);
        if (entry && entry.layer !== undefined && patch.layer !== entry.layer) {
          throw new Error(
            `Cannot change layer via vault.update() — layer changes require writeToLayer or the governance API. ` +
            `Current layer: '${entry.layer}', attempted: '${patch.layer}'`,
          );
        }
      }

      ensureDir(baseDir);
      checkDiskSpace(baseDir);
      acquireLock(lockPath);
      try {
        const entry = index.get(id);
        if (!entry) return;

        const existing = _readRaw(entry.type, id);
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
      } finally {
        releaseLock(lockPath);
      }
    },

    remove(id) {
      acquireLock(lockPath);
      try {
        const entry = index.get(id);
        if (!entry) return;

        try { rmSync(entry.path); } catch { /* already gone */ }
        removeFromIndex(id);
        logMutation({ ts: Date.now(), op: 'delete', id, type: entry.type });
      } finally {
        releaseLock(lockPath);
      }
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

        const entity = _readRaw(type, entry.id);
        if (entity) results.push(entity);
        if (results.length >= limit) break;
      }

      return results;
    },

    listByLayer(layer: KnowledgeLayer, filter?: QueryFilter): Entity[] {
      const limit = filter?.limit ?? 1000;
      const results: Entity[] = [];

      for (const entry of index.values()) {
        if (entry.layer !== layer) continue;

        // Load entity from disk (needed for non-indexed fields like team_id)
        const entity = _readRaw(entry.type, entry.id);
        if (!entity) continue;

        // Apply additional filters on the full entity
        if (filter) {
          let match = true;
          for (const [key, value] of Object.entries(filter)) {
            if (key === 'limit' || key === 'offset' || key === 'layer') continue;
            if ((entity as Record<string, unknown>)[key] !== value) {
              match = false;
              break;
            }
          }
          if (!match) continue;
        }

        results.push(entity);
        if (results.length >= limit) break;
      }

      return results;
    },

    findByTag(tag) {
      const results: Entity[] = [];
      for (const entry of index.values()) {
        if (entry.tags.includes(tag)) {
          const entity = _readRaw(entry.type, entry.id);
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
        // Parse wikilink: "type/name" -> type, name
        const parts = link.split('/');
        if (parts.length >= 2) {
          const linkedType = parts[0]!;
          const linkedId = parts.slice(1).join('/');
          const entity = _readRaw(linkedType, linkedId);
          if (entity) results.push(entity);
        }
      }
      return results;
    },

    rebuildIndex,
  };
}
