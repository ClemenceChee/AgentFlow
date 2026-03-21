import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cosineSimilarity, createJsonVectorStore } from 'soma';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir: string;

function freshDir(): string {
  const dir = join(tmpdir(), `soma-vs-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

beforeEach(() => {
  testDir = freshDir();
});
afterEach(() => {
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {
    /* ok */
  }
});

// ---------------------------------------------------------------------------
// Cosine similarity
// ---------------------------------------------------------------------------

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it('returns 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('returns 0 for mismatched lengths', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it('returns 0 for zero vectors', () => {
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// JSON Vector Store — upsert / count / delete
// ---------------------------------------------------------------------------

describe('JsonVectorStore CRUD', () => {
  it('upserts and counts', async () => {
    const store = createJsonVectorStore(join(testDir, 'vectors.json'));
    await store.upsert('a', [1, 0, 0], { type: 'agent' });
    await store.upsert('b', [0, 1, 0], { type: 'insight' });
    expect(await store.count()).toBe(2);
  });

  it('upsert overwrites existing entry', async () => {
    const store = createJsonVectorStore(join(testDir, 'vectors.json'));
    await store.upsert('a', [1, 0], { v: 1 });
    await store.upsert('a', [0, 1], { v: 2 });
    expect(await store.count()).toBe(1);

    const results = await store.search([0, 1], { limit: 1 });
    expect(results[0]?.id).toBe('a');
    expect(results[0]?.metadata.v).toBe(2);
  });

  it('deletes an entry', async () => {
    const store = createJsonVectorStore(join(testDir, 'vectors.json'));
    await store.upsert('a', [1, 0], {});
    await store.delete('a');
    expect(await store.count()).toBe(0);
  });

  it('persists to disk', async () => {
    const path = join(testDir, 'vectors.json');
    const store = createJsonVectorStore(path);
    await store.upsert('a', [1, 0, 0], {});
    expect(existsSync(path)).toBe(true);

    // New instance should reload data
    const store2 = createJsonVectorStore(path);
    expect(await store2.count()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

describe('JsonVectorStore search', () => {
  it('returns nearest neighbors sorted by score', async () => {
    const store = createJsonVectorStore(join(testDir, 'vectors.json'));
    await store.upsert('exact', [1, 0, 0], {});
    await store.upsert('close', [0.9, 0.1, 0], {});
    await store.upsert('far', [0, 0, 1], {});

    const results = await store.search([1, 0, 0], { limit: 3 });
    expect(results).toHaveLength(3);
    expect(results[0]?.id).toBe('exact');
    expect(results[0]?.score).toBeCloseTo(1);
    expect(results[1]?.id).toBe('close');
  });

  it('respects limit', async () => {
    const store = createJsonVectorStore(join(testDir, 'vectors.json'));
    for (let i = 0; i < 10; i++) await store.upsert(`v${i}`, [Math.random(), Math.random()], {});

    const results = await store.search([1, 0], { limit: 3 });
    expect(results).toHaveLength(3);
  });

  it('returns empty for empty store', async () => {
    const store = createJsonVectorStore(join(testDir, 'vectors.json'));
    const results = await store.search([1, 0], { limit: 5 });
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Metadata filtering
// ---------------------------------------------------------------------------

describe('JsonVectorStore metadata filtering', () => {
  it('filters by equality', async () => {
    const store = createJsonVectorStore(join(testDir, 'vectors.json'));
    await store.upsert('a1', [1, 0], { type: 'agent' });
    await store.upsert('a2', [0.9, 0.1], { type: 'agent' });
    await store.upsert('i1', [0.8, 0.2], { type: 'insight' });

    const results = await store.search([1, 0], { filter: { type: 'agent' } });
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.metadata.type === 'agent')).toBe(true);
  });

  it('filters by in-list', async () => {
    const store = createJsonVectorStore(join(testDir, 'vectors.json'));
    await store.upsert('a1', [1, 0], { type: 'agent' });
    await store.upsert('i1', [0.9, 0.1], { type: 'insight' });
    await store.upsert('p1', [0.8, 0.2], { type: 'policy' });

    const results = await store.search([1, 0], { filter: { type: ['agent', 'insight'] } });
    expect(results).toHaveLength(2);
  });

  it('filters by range', async () => {
    const store = createJsonVectorStore(join(testDir, 'vectors.json'));
    await store.upsert('a', [1, 0], { score: 0.9 });
    await store.upsert('b', [0.9, 0.1], { score: 0.5 });
    await store.upsert('c', [0.8, 0.2], { score: 0.1 });

    const results = await store.search([1, 0], { filter: { score: { min: 0.4, max: 1.0 } } });
    expect(results).toHaveLength(2);
    expect(results.every((r) => (r.metadata.score as number) >= 0.4)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Stubs throw
// ---------------------------------------------------------------------------

describe('VectorStore stubs', () => {
  it('createLanceVectorStore throws not-implemented', async () => {
    const { createLanceVectorStore } = await import('soma');
    expect(() => createLanceVectorStore('/tmp/lance')).toThrow(/not yet implemented/i);
  });

  it('createMilvusVectorStore throws not-implemented', async () => {
    const { createMilvusVectorStore } = await import('soma');
    expect(() => createMilvusVectorStore('http://localhost:19530')).toThrow(/not yet implemented/i);
  });
});
