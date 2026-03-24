/**
 * Pluggable vector store for semantic search.
 *
 * Default: JSON file backend with brute-force cosine similarity.
 * Optional: LanceDB (embedded ANN) or Milvus (enterprise).
 *
 * @module
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { VectorSearchResult, VectorStore } from './types.js';

// ---------------------------------------------------------------------------
// Cosine similarity (pure TypeScript)
// ---------------------------------------------------------------------------

/**
 * Compute cosine similarity between two vectors.
 * Returns a value between -1 and 1 (1 = identical direction).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

// ---------------------------------------------------------------------------
// JSON file backend (zero deps, default)
// ---------------------------------------------------------------------------

interface StoredVector {
  id: string;
  vector: number[];
  metadata: Record<string, unknown>;
}

/**
 * Create a JSON file-backed vector store.
 *
 * Stores all vectors in a single JSON file. Search is brute-force O(n)
 * cosine similarity. Good for up to ~5,000 vectors.
 *
 * @param filePath - Path to the JSON file. Created if it doesn't exist.
 */
export function createJsonVectorStore(filePath: string): VectorStore {
  let vectors: Map<string, StoredVector> = new Map();
  let dirty = false;

  function load(): void {
    if (existsSync(filePath)) {
      try {
        const data = JSON.parse(readFileSync(filePath, 'utf-8')) as StoredVector[];
        vectors = new Map(data.map((v) => [v.id, v]));
      } catch {
        vectors = new Map();
      }
    }
  }

  function save(): void {
    if (!dirty) return;
    const dir = dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, JSON.stringify([...vectors.values()]), 'utf-8');
    dirty = false;
  }

  function matchesFilter(
    metadata: Record<string, unknown>,
    filter: Record<string, unknown>,
  ): boolean {
    for (const [key, value] of Object.entries(filter)) {
      const actual = metadata[key];
      if (Array.isArray(value)) {
        // In-list filter
        if (!value.includes(actual)) return false;
      } else if (typeof value === 'object' && value !== null) {
        // Range filter: { min?, max? }
        const range = value as { min?: number; max?: number };
        const num = typeof actual === 'number' ? actual : Number.NaN;
        if (range.min !== undefined && num < range.min) return false;
        if (range.max !== undefined && num > range.max) return false;
      } else {
        // Equality filter
        if (actual !== value) return false;
      }
    }
    return true;
  }

  // Load on init
  load();

  return {
    async upsert(id, vector, metadata) {
      vectors.set(id, { id, vector, metadata });
      dirty = true;
      save();
    },

    async delete(id) {
      vectors.delete(id);
      dirty = true;
      save();
    },

    async search(queryVector, options?) {
      const limit = options?.limit ?? 10;
      const filter = options?.filter;

      const scored: VectorSearchResult[] = [];

      for (const stored of vectors.values()) {
        if (filter && !matchesFilter(stored.metadata, filter)) continue;

        const score = cosineSimilarity(queryVector, stored.vector);
        scored.push({ id: stored.id, score, metadata: stored.metadata });
      }

      // Sort by score descending, take top N
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, limit);
    },

    async count() {
      return vectors.size;
    },
  };
}

// ---------------------------------------------------------------------------
// LanceDB backend (optional — stub)
// ---------------------------------------------------------------------------

/**
 * Create a LanceDB-backed vector store (optional dependency).
 *
 * Requires: `npm install @lancedb/lancedb`
 *
 * @param dirPath - Directory for LanceDB data files.
 */
export function createLanceVectorStore(_dirPath: string): VectorStore {
  throw new Error(
    'LanceDB vector store not yet implemented. Install @lancedb/lancedb and check back. ' +
      'For now, use createJsonVectorStore() as the default.',
  );
}

// ---------------------------------------------------------------------------
// Milvus backend (optional — stub)
// ---------------------------------------------------------------------------

/**
 * Create a Milvus-backed vector store (optional dependency).
 *
 * Connects to an existing Milvus instance via HTTP API.
 *
 * @param url - Milvus HTTP endpoint (e.g., `http://localhost:19530`).
 */
export function createMilvusVectorStore(_url: string): VectorStore {
  throw new Error(
    'Milvus vector store not yet implemented. ' +
      'For now, use createJsonVectorStore() as the default.',
  );
}
