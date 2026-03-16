/**
 * End-to-end integration test: guards + store + visualization round-trip.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createGraphBuilder } from '../../packages/core/src/graph-builder.js';
import { checkGuards, withGuards } from '../../packages/core/src/guards.js';
import { createTraceStore } from '../../packages/core/src/trace-store.js';
import { toAsciiTree, toTimeline } from '../../packages/core/src/visualize.js';

let globalCounter = 0;
function createTestIdGenerator(): () => string {
  return () => {
    globalCounter++;
    return `int_${String(globalCounter).padStart(3, '0')}`;
  };
}

describe('trace-integration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'agentflow-integration-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('should round-trip: build with guards -> save -> load -> visualize', async () => {
    // 1. Build a graph with guards
    const raw = createGraphBuilder({
      agentId: 'research',
      trigger: 'user',
      idGenerator: createTestIdGenerator(),
    });
    const builder = withGuards(raw, {
      maxDepth: 20,
      maxAgentSpawns: 100,
      onViolation: 'warn',
      logger: () => {}, // suppress warnings
    });

    const root = builder.startNode({ type: 'agent', name: 'Planner' });
    const search = builder.startNode({
      type: 'tool',
      name: 'WebSearch',
      parentId: root,
      metadata: {
        'gen_ai.request.model': 'gpt-4',
        'gen_ai.usage.prompt_tokens': 200,
        'gen_ai.usage.completion_tokens': 100,
      },
    });
    builder.endNode(search);
    const analyze = builder.startNode({ type: 'tool', name: 'Analyze', parentId: root });
    builder.endNode(analyze);
    builder.endNode(root);

    const graph = builder.build();

    // 2. Check guards (should have no violations)
    const violations = checkGuards(graph);
    expect(violations).toHaveLength(0);

    // 3. Save to store
    const store = createTraceStore(tmpDir);
    const filePath = await store.save(graph);
    expect(filePath).toContain('.json');

    // 4. Load from store
    const loaded = await store.get(graph.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(graph.id);
    expect(loaded!.nodes.size).toBe(graph.nodes.size);
    expect(loaded!.agentId).toBe('research');

    // 5. Visualize
    const tree = toAsciiTree(loaded!);
    expect(tree).toContain('Planner');
    expect(tree).toContain('WebSearch');
    expect(tree).toContain('Analyze');
    expect(tree).toContain('gpt-4');
    expect(tree).toContain('300 tok');

    // Patch times for timeline
    const now = Date.now();
    const patched = {
      ...loaded!,
      startTime: now - 5000,
      endTime: now,
      nodes: new Map(
        [...loaded!.nodes.entries()].map(([id, node]) => [
          id,
          { ...node, startTime: now - 5000, endTime: now },
        ]),
      ),
    };
    const timeline = toTimeline(patched);
    expect(timeline).toContain('Planner');
    expect(timeline).toContain('\u2588'); // bar character
  });

  it('should detect guard violations in stored traces', async () => {
    const store = createTraceStore(tmpDir);

    // Build a graph with many agents (will trigger spawn explosion at low threshold)
    const builder = createGraphBuilder({
      agentId: 'test',
      idGenerator: createTestIdGenerator(),
    });
    const root = builder.startNode({ type: 'agent', name: 'root' });
    for (let i = 0; i < 10; i++) {
      const id = builder.startNode({ type: 'agent', name: `worker_${i}`, parentId: root });
      builder.endNode(id);
    }
    builder.endNode(root);
    await store.save(builder.build());

    // Load and check with strict guards
    const graphs = await store.list();
    const violations = checkGuards(graphs[0], { maxAgentSpawns: 5 });
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.type === 'spawn-explosion')).toBe(true);
  });
});
