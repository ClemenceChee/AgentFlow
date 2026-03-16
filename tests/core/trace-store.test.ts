/**
 * Tests for JSON trace store.
 */

import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGraphBuilder } from '../../packages/core/src/graph-builder.js';
import { loadGraph } from '../../packages/core/src/loader.js';
import { createTraceStore } from '../../packages/core/src/trace-store.js';

let globalCounter = 0;
function createTestIdGenerator(): () => string {
  return () => {
    globalCounter++;
    return `test_${String(globalCounter).padStart(3, '0')}`;
  };
}

describe('trace-store', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'agentflow-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('should save and load a graph (round-trip)', async () => {
    const store = createTraceStore(tmpDir);
    const builder = createGraphBuilder({
      agentId: 'test',
      idGenerator: createTestIdGenerator(),
    });
    const root = builder.startNode({ type: 'agent', name: 'main' });
    builder.endNode(root);
    const graph = builder.build();

    const filePath = await store.save(graph);
    expect(filePath).toContain('.json');

    const loaded = await store.get(graph.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(graph.id);
    expect(loaded!.nodes.size).toBe(graph.nodes.size);
    expect(loaded!.status).toBe(graph.status);
  });

  it('should return null for non-existent graph', async () => {
    const store = createTraceStore(tmpDir);
    const result = await store.get('nonexistent');
    expect(result).toBeNull();
  });

  it('should list all stored graphs', async () => {
    const store = createTraceStore(tmpDir);

    // Save 3 graphs
    for (let i = 0; i < 3; i++) {
      const gen = createTestIdGenerator();
      const builder = createGraphBuilder({ agentId: `test-${i}`, idGenerator: gen });
      const root = builder.startNode({ type: 'agent', name: `agent-${i}` });
      builder.endNode(root);
      await store.save(builder.build());
    }

    const all = await store.list();
    expect(all).toHaveLength(3);
  });

  it('should list with status filter', async () => {
    const store = createTraceStore(tmpDir);

    // Completed graph
    const b1 = createGraphBuilder({ agentId: 'ok', idGenerator: createTestIdGenerator() });
    const r1 = b1.startNode({ type: 'agent', name: 'ok' });
    b1.endNode(r1);
    await store.save(b1.build());

    // Failed graph
    const b2 = createGraphBuilder({ agentId: 'bad', idGenerator: createTestIdGenerator() });
    const r2 = b2.startNode({ type: 'agent', name: 'bad' });
    b2.failNode(r2, 'broke');
    await store.save(b2.build());

    const failed = await store.list({ status: 'failed' });
    expect(failed).toHaveLength(1);
    expect(failed[0].status).toBe('failed');

    const completed = await store.list({ status: 'completed' });
    expect(completed).toHaveLength(1);
    expect(completed[0].status).toBe('completed');
  });

  it('should list with limit', async () => {
    const store = createTraceStore(tmpDir);

    for (let i = 0; i < 5; i++) {
      const gen = createTestIdGenerator();
      const builder = createGraphBuilder({ agentId: `test-${i}`, idGenerator: gen });
      const root = builder.startNode({ type: 'agent', name: `agent-${i}` });
      builder.endNode(root);
      await store.save(builder.build());
    }

    const limited = await store.list({ limit: 2 });
    expect(limited).toHaveLength(2);
  });

  it('should find stuck spans', async () => {
    const store = createTraceStore(tmpDir);

    // Graph with a running node (simulate by patching)
    const builder = createGraphBuilder({
      agentId: 'test',
      idGenerator: createTestIdGenerator(),
    });
    const root = builder.startNode({ type: 'agent', name: 'main' });
    const tool = builder.startNode({ type: 'tool', name: 'stuck-tool', parentId: root });
    // Don't end the tool — graph will be 'running'
    builder.endNode(root);
    const graph = builder.build();
    await store.save(graph);

    const stuck = await store.getStuckSpans();
    expect(stuck.length).toBeGreaterThan(0);
    expect(stuck.some((n) => n.name === 'stuck-tool')).toBe(true);
  });

  it('should detect reasoning loops', async () => {
    const store = createTraceStore(tmpDir);

    const builder = createGraphBuilder({
      agentId: 'test',
      idGenerator: createTestIdGenerator(),
    });
    const root = builder.startNode({ type: 'agent', name: 'main' });
    const ids: string[] = [root];
    let parentId = root;

    // Create a chain of 10 consecutive tool nodes
    for (let i = 0; i < 10; i++) {
      const id = builder.startNode({ type: 'tool', name: `step_${i}`, parentId });
      ids.push(id);
      parentId = id;
    }

    // End in reverse
    for (let i = ids.length - 1; i >= 0; i--) {
      builder.endNode(ids[i]);
    }
    await store.save(builder.build());

    // Threshold of 5 should detect the loop
    const loops = await store.getReasoningLoops(5);
    expect(loops.length).toBeGreaterThan(0);
    expect(loops[0].nodes.length).toBeGreaterThan(0);
  });

  it('should handle empty directory', async () => {
    const store = createTraceStore(tmpDir);
    const all = await store.list();
    expect(all).toHaveLength(0);

    const stuck = await store.getStuckSpans();
    expect(stuck).toHaveLength(0);
  });

  it('should produce files compatible with loadGraph', async () => {
    const store = createTraceStore(tmpDir);
    const builder = createGraphBuilder({
      agentId: 'test',
      idGenerator: createTestIdGenerator(),
    });
    const root = builder.startNode({ type: 'agent', name: 'main' });
    builder.endNode(root);
    const graph = builder.build();

    const filePath = await store.save(graph);
    const raw = await readFile(filePath, 'utf-8');
    const loaded = loadGraph(raw);
    expect(loaded.id).toBe(graph.id);
  });
});
