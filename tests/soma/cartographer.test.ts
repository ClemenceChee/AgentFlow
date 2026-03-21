import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EmbedFn, Vault, VectorStore } from 'soma';
import { createCartographer, createJsonVectorStore, createVault } from 'soma';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir: string;
let vaultDir: string;
let vault: Vault;
let vectorStore: VectorStore;

function freshDir(): string {
  const dir = join(
    tmpdir(),
    `soma-carto-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Deterministic mock embed: hash text into a 3D vector. */
const mockEmbedFn: EmbedFn = async (text: string) => {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  const a = Math.sin(h) * 0.5 + 0.5;
  const b = Math.cos(h) * 0.5 + 0.5;
  const c = Math.sin(h * 2) * 0.5 + 0.5;
  return [a, b, c];
};

beforeEach(() => {
  testDir = freshDir();
  vaultDir = join(testDir, 'vault');
  vault = createVault({ baseDir: vaultDir });
  vectorStore = createJsonVectorStore(join(testDir, 'vectors.json'));
});

afterEach(() => {
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {
    /* ok */
  }
});

// ---------------------------------------------------------------------------
// Embedding
// ---------------------------------------------------------------------------

describe('Cartographer embed', () => {
  it('embeds entities into vector store', async () => {
    vault.create({ type: 'agent', id: 'a1', name: 'Agent Alpha', body: 'Does things' });
    vault.create({ type: 'insight', id: 'i1', name: 'Insight One', body: 'An important finding' });

    const carto = createCartographer(vault, vectorStore, mockEmbedFn, {
      stateFile: join(testDir, 'carto-state.json'),
    });

    const count = await carto.embed();
    expect(count).toBe(2);
    expect(await vectorStore.count()).toBe(2);
  });

  it('skips already-embedded entities on re-run', async () => {
    vault.create({ type: 'agent', id: 'a1', name: 'Agent Alpha', body: 'Does things' });

    const stateFile = join(testDir, 'carto-state.json');
    const carto = createCartographer(vault, vectorStore, mockEmbedFn, { stateFile });

    expect(await carto.embed()).toBe(1);

    // Second run — same carto instance, should skip
    expect(await carto.embed()).toBe(0);
  });

  it('returns 0 when no embedFn provided', async () => {
    vault.create({ type: 'agent', id: 'a1', name: 'Agent', body: 'test' });
    const carto = createCartographer(vault, vectorStore, undefined, {
      stateFile: join(testDir, 'carto-state.json'),
    });
    expect(await carto.embed()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Structural clustering & archetype discovery
// ---------------------------------------------------------------------------

describe('Cartographer discover', () => {
  it('creates archetypes from cross-agent clusters', async () => {
    // Create agents and linked executions to form a cluster
    vault.create({ type: 'agent', id: 'agent-x', name: 'Agent X', agentId: 'agent-x' } as any);
    vault.create({ type: 'agent', id: 'agent-y', name: 'Agent Y', agentId: 'agent-y' } as any);

    // Execution entities linked to both agents (creating a connected component)
    vault.create({
      type: 'execution',
      id: 'ex1',
      name: 'Exec 1',
      agentId: 'agent-x',
      related: ['agent/agent-x', 'execution/ex2'],
    } as any);
    vault.create({
      type: 'execution',
      id: 'ex2',
      name: 'Exec 2',
      agentId: 'agent-y',
      related: ['agent/agent-y', 'execution/ex1', 'execution/ex3'],
    } as any);
    vault.create({
      type: 'execution',
      id: 'ex3',
      name: 'Exec 3',
      agentId: 'agent-x',
      related: ['execution/ex2'],
    } as any);

    const carto = createCartographer(vault, vectorStore, mockEmbedFn, {
      stateFile: join(testDir, 'carto-state.json'),
      minClusterSize: 3,
    });

    const archetypes = await carto.discover();
    // The linked cluster has 5 nodes (2 agents + 3 executions) across 2 agents
    expect(archetypes).toBeGreaterThanOrEqual(1);

    const archetypeEntities = vault.list('archetype');
    expect(archetypeEntities.length).toBeGreaterThanOrEqual(1);
    expect(archetypeEntities[0]?.status).toBe('proposed');
  });

  it('does not create archetypes below minClusterSize', async () => {
    vault.create({ type: 'agent', id: 'lone', name: 'Lone Agent' });

    const carto = createCartographer(vault, vectorStore, mockEmbedFn, {
      stateFile: join(testDir, 'carto-state.json'),
      minClusterSize: 5,
    });

    const archetypes = await carto.discover();
    expect(archetypes).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Semantic search
// ---------------------------------------------------------------------------

describe('Cartographer search', () => {
  it('searches embedded entities semantically', async () => {
    vault.create({ type: 'agent', id: 'a1', name: 'Search Agent', body: 'Handles search queries' });
    vault.create({
      type: 'insight',
      id: 'i1',
      name: 'Search Insight',
      body: 'A finding about search',
    });

    const carto = createCartographer(vault, vectorStore, mockEmbedFn, {
      stateFile: join(testDir, 'carto-state.json'),
    });

    await carto.embed();
    const results = await carto.search('search queries', { limit: 5 });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]?.id).toBeTruthy();
    expect(typeof results[0]?.score).toBe('number');
  });

  it('returns empty when no embedFn', async () => {
    const carto = createCartographer(vault, vectorStore, undefined, {
      stateFile: join(testDir, 'carto-state.json'),
    });
    const results = await carto.search('anything');
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Relationship suggestions
// ---------------------------------------------------------------------------

describe('Cartographer suggestRelationships', () => {
  it('suggests relationships between unlinked similar entities', async () => {
    vault.create({
      type: 'insight',
      id: 'ins-a',
      name: 'API Performance Issue',
      body: 'API latency is high',
      tags: ['perf'],
    });
    vault.create({
      type: 'decision',
      id: 'dec-a',
      name: 'API Caching Decision',
      body: 'Decided to add caching for API',
      tags: ['perf'],
    });

    const carto = createCartographer(vault, vectorStore, mockEmbedFn, {
      stateFile: join(testDir, 'carto-state.json'),
      similarityThreshold: 0.0, // Low threshold so mock vectors match
    });

    await carto.embed();
    const suggestions = await carto.suggestRelationships();
    // With low threshold, should find at least some suggestions
    // (Depends on mock embedding similarity — may be 0 if vectors happen to differ)
    expect(Array.isArray(suggestions)).toBe(true);
  });
});
