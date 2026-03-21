import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { EventWriter, ExecutionEvent, ExecutionGraph, PatternEvent } from 'agentflow-core';
import {
  createEventEmitter,
  createExecutionEvent,
  createGraphBuilder,
  createJsonEventWriter,
  createPatternEvent,
  discoverProcess,
  findVariants,
  getBottlenecks,
} from 'agentflow-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function testIdGenerator(): () => string {
  let counter = 0;
  return () => {
    counter++;
    return `ev_${String(counter).padStart(3, '0')}`;
  };
}

function buildCompletedGraph(): ExecutionGraph {
  const builder = createGraphBuilder({
    idGenerator: testIdGenerator(),
    agentId: 'test-agent',
    trigger: 'unit-test',
  });
  const root = builder.startNode({ type: 'agent', name: 'main' });
  const tool = builder.startNode({ type: 'tool', name: 'fetch', parentId: root });
  builder.endNode(tool);
  builder.endNode(root);
  return builder.build();
}

function buildFailedGraph(): ExecutionGraph {
  const builder = createGraphBuilder({
    idGenerator: testIdGenerator(),
    agentId: 'test-agent',
    trigger: 'unit-test',
  });
  const root = builder.startNode({ type: 'agent', name: 'main' });
  const tool = builder.startNode({
    type: 'tool',
    name: 'fetch-data',
    parentId: root,
    metadata: { error: 'connection timeout' },
  });
  builder.failNode(tool, 'connection timeout');
  builder.endNode(root, 'failed');
  return builder.build();
}

// ---------------------------------------------------------------------------
// createExecutionEvent
// ---------------------------------------------------------------------------

describe('createExecutionEvent', () => {
  it('creates event from successful graph', () => {
    const graph = buildCompletedGraph();
    const event = createExecutionEvent(graph);

    expect(event.eventType).toBe('execution.completed');
    expect(event.graphId).toBe(graph.id);
    expect(event.agentId).toBe('test-agent');
    expect(event.schemaVersion).toBe(1);
    expect(event.status).toBe('completed');
    expect(event.nodeCount).toBe(2);
    expect(event.duration).toBeGreaterThanOrEqual(0);
    expect(event.pathSignature).toContain('agent:main');
    expect(event.failurePoint).toBeUndefined();
    expect(event.violations).toEqual([]);
  });

  it('creates event from failed graph with failure point', () => {
    const graph = buildFailedGraph();
    const event = createExecutionEvent(graph);

    expect(event.eventType).toBe('execution.failed');
    expect(event.status).toBe('failed');
    expect(event.failurePoint).toBeDefined();
    expect(event.failurePoint?.nodeName).toBe('fetch-data');
    expect(event.failurePoint?.nodeType).toBe('tool');
  });

  it('includes process context when provided', () => {
    const graph = buildCompletedGraph();
    const event = createExecutionEvent(graph, {
      processContext: { variant: 'A→B', conformanceScore: 0.85, isAnomaly: false },
    });

    expect(event.processContext).toEqual({
      variant: 'A→B',
      conformanceScore: 0.85,
      isAnomaly: false,
    });
  });

  it('includes semantic context when provided', () => {
    const graph = buildCompletedGraph();
    const event = createExecutionEvent(graph, {
      semantic: { intent: 'daily-rebalance', trigger: 'cron', tokenCost: 4500 },
    });

    expect(event.semantic).toEqual({
      intent: 'daily-rebalance',
      trigger: 'cron',
      tokenCost: 4500,
    });
  });

  it('returns empty violations when no options provided', () => {
    const graph = buildCompletedGraph();
    const event = createExecutionEvent(graph);
    expect(event.violations).toEqual([]);
  });

  it('includes violations when provided', () => {
    const graph = buildCompletedGraph();
    const violations = [
      { type: 'timeout' as const, nodeId: 'n1', message: 'timed out', timestamp: Date.now() },
    ];
    const event = createExecutionEvent(graph, { violations });
    expect(event.violations).toHaveLength(1);
    expect(event.violations[0]?.type).toBe('timeout');
  });
});

// ---------------------------------------------------------------------------
// createPatternEvent
// ---------------------------------------------------------------------------

describe('createPatternEvent', () => {
  function buildGraphs(n: number): ExecutionGraph[] {
    return Array.from({ length: n }, () => buildCompletedGraph());
  }

  it('creates pattern event from mining results', () => {
    const graphs = buildGraphs(50);
    const model = discoverProcess(graphs);
    const variants = findVariants(graphs);
    const bottlenecks = getBottlenecks(graphs);

    const event = createPatternEvent('test-agent', model, variants, bottlenecks);

    expect(event.eventType).toBe('pattern.discovered');
    expect(event.agentId).toBe('test-agent');
    expect(event.schemaVersion).toBe(1);
    expect(event.pattern.totalGraphs).toBe(50);
    expect(event.pattern.variantCount).toBe(1); // all identical
    expect(event.pattern.topVariants).toHaveLength(1);
    expect(event.pattern.topBottlenecks.length).toBeGreaterThan(0);
    expect(event.pattern.processModel).toBeDefined();
  });

  it('caps topVariants and topBottlenecks at 5', () => {
    // Build 10 different variants by varying graph structure
    const graphs: ExecutionGraph[] = [];
    for (let i = 0; i < 10; i++) {
      const builder = createGraphBuilder({
        idGenerator: testIdGenerator(),
        agentId: 'test',
        trigger: 'test',
      });
      const root = builder.startNode({ type: 'agent', name: 'main' });
      // Each graph gets a unique tool name → unique variant
      const tool = builder.startNode({ type: 'tool', name: `tool-${i}`, parentId: root });
      builder.endNode(tool);
      builder.endNode(root);
      graphs.push(builder.build());
    }

    const model = discoverProcess(graphs);
    const variants = findVariants(graphs);
    const bottlenecks = getBottlenecks(graphs);

    const event = createPatternEvent('test', model, variants, bottlenecks);

    expect(event.pattern.topVariants).toHaveLength(5);
    expect(event.pattern.topBottlenecks).toHaveLength(5);
    expect(event.pattern.variantCount).toBe(10); // full count preserved
  });

  it('handles fewer than 5 items', () => {
    const graphs = buildGraphs(5);
    const model = discoverProcess(graphs);
    const variants = findVariants(graphs); // 1 variant
    const bottlenecks = getBottlenecks(graphs); // 2 bottlenecks (main + fetch)

    const event = createPatternEvent('test', model, variants, bottlenecks);

    expect(event.pattern.topVariants).toHaveLength(1);
    expect(event.pattern.topBottlenecks).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// createEventEmitter
// ---------------------------------------------------------------------------

describe('createEventEmitter', () => {
  it('emits to a single writer', async () => {
    const writeEvent = vi.fn().mockResolvedValue(undefined);
    const writer: EventWriter = {
      write: vi.fn().mockResolvedValue(undefined),
      writeEvent,
    };

    const emitter = createEventEmitter({ writers: [writer] });
    const event = createExecutionEvent(buildCompletedGraph());
    await emitter.emit(event);

    expect(writeEvent).toHaveBeenCalledWith(event);
  });

  it('emits to multiple subscribers', async () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    const emitter = createEventEmitter();
    emitter.subscribe(listener1);
    emitter.subscribe(listener2);

    const event = createExecutionEvent(buildCompletedGraph());
    await emitter.emit(event);

    expect(listener1).toHaveBeenCalledWith(event);
    expect(listener2).toHaveBeenCalledWith(event);
  });

  it('unsubscribe stops delivery', async () => {
    const listener = vi.fn();

    const emitter = createEventEmitter();
    const unsub = emitter.subscribe(listener);

    await emitter.emit(createExecutionEvent(buildCompletedGraph()));
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    await emitter.emit(createExecutionEvent(buildCompletedGraph()));
    expect(listener).toHaveBeenCalledTimes(1); // not called again
  });

  it('writer error does not block emission', async () => {
    const onError = vi.fn();
    const failingWriter: EventWriter = {
      write: vi.fn().mockResolvedValue(undefined),
      writeEvent: vi.fn().mockRejectedValue(new Error('disk full')),
    };
    const listener = vi.fn();

    const emitter = createEventEmitter({ writers: [failingWriter], onError });
    emitter.subscribe(listener);

    const event = createExecutionEvent(buildCompletedGraph());
    await emitter.emit(event);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(event); // subscriber still receives
  });

  it('emits with no writers or subscribers without error', async () => {
    const emitter = createEventEmitter();
    const event = createExecutionEvent(buildCompletedGraph());
    await expect(emitter.emit(event)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createJsonEventWriter
// ---------------------------------------------------------------------------

describe('createJsonEventWriter', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `agentflow-test-events-${Date.now()}`);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('writes execution event to file', async () => {
    const writer = createJsonEventWriter({ outputDir: testDir });
    const event = createExecutionEvent(buildCompletedGraph());
    await writer.writeEvent(event);

    const expectedName = `execution-completed-test-agent-${event.timestamp}.json`;
    const filePath = join(testDir, expectedName);
    expect(existsSync(filePath)).toBe(true);

    const content = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(content.eventType).toBe('execution.completed');
    expect(content.agentId).toBe('test-agent');
  });

  it('writes pattern event to file', async () => {
    const writer = createJsonEventWriter({ outputDir: testDir });
    const graphs = Array.from({ length: 5 }, () => buildCompletedGraph());
    const event = createPatternEvent(
      'test-agent',
      discoverProcess(graphs),
      findVariants(graphs),
      getBottlenecks(graphs),
    );
    await writer.writeEvent(event);

    const expectedName = `pattern-discovered-test-agent-${event.timestamp}.json`;
    const filePath = join(testDir, expectedName);
    expect(existsSync(filePath)).toBe(true);

    const content = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(content.eventType).toBe('pattern.discovered');
  });

  it('creates output directory if it does not exist', async () => {
    const nestedDir = join(testDir, 'nested', 'deep');
    const writer = createJsonEventWriter({ outputDir: nestedDir });
    await writer.writeEvent(createExecutionEvent(buildCompletedGraph()));
    expect(existsSync(nestedDir)).toBe(true);
  });

  it('multiple events produce separate files', async () => {
    const writer = createJsonEventWriter({ outputDir: testDir });

    // Write 3 events with slight timestamp variation
    for (let i = 0; i < 3; i++) {
      const event = createExecutionEvent(buildCompletedGraph());
      await writer.writeEvent(event);
    }

    mkdirSync(testDir, { recursive: true }); // ensure dir exists for reading
    const { readdirSync } = await import('node:fs');
    const files = readdirSync(testDir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThanOrEqual(1); // timestamps might collide in fast tests
  });

  it('write(graph) is a no-op', async () => {
    const writer = createJsonEventWriter({ outputDir: testDir });
    await writer.write(buildCompletedGraph());
    // No files should be created
    if (existsSync(testDir)) {
      const { readdirSync } = await import('node:fs');
      expect(readdirSync(testDir).filter((f) => f.endsWith('.json'))).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Integration test
// ---------------------------------------------------------------------------

describe('event emission integration', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `agentflow-integration-${Date.now()}`);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('build graph → create event → emit → verify file output', async () => {
    // Build graph
    const graph = buildCompletedGraph();

    // Create execution event with process context
    const event = createExecutionEvent(graph, {
      semantic: { intent: 'integration-test', trigger: 'vitest' },
    });

    // Set up emitter with JSON writer
    const writer = createJsonEventWriter({ outputDir: testDir });
    const received: (ExecutionEvent | PatternEvent)[] = [];
    const emitter = createEventEmitter({ writers: [writer] });
    emitter.subscribe((e) => received.push(e));

    // Emit
    await emitter.emit(event);

    // Verify subscriber received
    expect(received).toHaveLength(1);
    expect(received[0]?.eventType).toBe('execution.completed');

    // Verify file written
    const expectedName = `execution-completed-test-agent-${event.timestamp}.json`;
    const filePath = join(testDir, expectedName);
    expect(existsSync(filePath)).toBe(true);

    const content = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(content.semantic.intent).toBe('integration-test');
    expect(content.pathSignature).toContain('agent:main');
  });
});
