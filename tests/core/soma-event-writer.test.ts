import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ExecutionGraph } from 'agentflow-core';
import {
  createEventEmitter,
  createExecutionEvent,
  createGraphBuilder,
  createPatternEvent,
  createSomaEventWriter,
  discoverProcess,
  findVariants,
  getBottlenecks,
} from 'agentflow-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function testIdGenerator(): () => string {
  let counter = 0;
  return () => {
    counter++;
    return `sv_${String(counter).padStart(3, '0')}`;
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

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `soma-writer-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helper to read all files from the test inbox
// ---------------------------------------------------------------------------

function readInboxFiles(): { name: string; content: string }[] {
  if (!existsSync(testDir)) return [];
  return readdirSync(testDir)
    .filter((f) => f.endsWith('.md'))
    .map((name) => ({ name, content: readFileSync(join(testDir, name), 'utf-8') }));
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fields: Record<string, string> = {};
  for (const line of match[1]?.split('\n') ?? []) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return fields;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SomaEventWriter', () => {
  describe('EventWriter interface', () => {
    it('returns an object with write and writeEvent methods', () => {
      const writer = createSomaEventWriter({ inboxDir: testDir });
      expect(typeof writer.write).toBe('function');
      expect(typeof writer.writeEvent).toBe('function');
    });

    it('write() is a no-op — creates no files', async () => {
      const writer = createSomaEventWriter({ inboxDir: testDir });
      await writer.write(buildCompletedGraph());
      const files = readInboxFiles();
      expect(files).toHaveLength(0);
    });
  });

  describe('ExecutionEvent — completed', () => {
    it('creates a Markdown file with correct frontmatter', async () => {
      const writer = createSomaEventWriter({ inboxDir: testDir });
      const graph = buildCompletedGraph();
      const event = createExecutionEvent(graph);

      await writer.writeEvent(event);

      const files = readInboxFiles();
      expect(files).toHaveLength(1);

      const fm = parseFrontmatter(files[0]?.content);
      expect(fm.type).toBe("'execution'");
      expect(fm.subtype).toBe("'completed'");
      expect(fm.source).toBe("'agentflow'");
      expect(fm.name).toContain('test-agent');
      expect(fm.name).toContain('completed');
      expect(fm.agentflow_graph_id).toBeDefined();
      expect(fm.duration_ms).toBeDefined();
      expect(fm.node_count).toBe('2');
    });

    it('body contains path signature and agent wikilink', async () => {
      const writer = createSomaEventWriter({ inboxDir: testDir });
      const event = createExecutionEvent(buildCompletedGraph());
      await writer.writeEvent(event);

      const content = readInboxFiles()[0]?.content;
      expect(content).toContain('agent:main');
      expect(content).toContain('[[agent/test-agent]]');
    });

    it('alfred_tags include agentflow/execution and status/completed', async () => {
      const writer = createSomaEventWriter({ inboxDir: testDir });
      const event = createExecutionEvent(buildCompletedGraph());
      await writer.writeEvent(event);

      const content = readInboxFiles()[0]?.content;
      expect(content).toContain('agentflow/execution');
      expect(content).toContain('status/completed');
      expect(content).toContain('agent/test-agent');
    });
  });

  describe('ExecutionEvent — failed', () => {
    it('creates a file with failed subtype and failure point details', async () => {
      const writer = createSomaEventWriter({ inboxDir: testDir });
      const graph = buildFailedGraph();
      const event = createExecutionEvent(graph);

      await writer.writeEvent(event);

      const files = readInboxFiles();
      expect(files).toHaveLength(1);

      const fm = parseFrontmatter(files[0]?.content);
      expect(fm.subtype).toBe("'failed'");

      const content = files[0]?.content;
      expect(content).toContain('status/failed');
      expect(content).toContain('Failure Point');
      expect(content).toContain('fetch-data');
      expect(content).toContain('connection timeout');
    });
  });

  describe('ExecutionEvent — with processContext', () => {
    it('includes conformance_score and is_anomaly in frontmatter', async () => {
      const writer = createSomaEventWriter({ inboxDir: testDir });
      const event = createExecutionEvent(buildCompletedGraph(), {
        processContext: { variant: 'A→B', conformanceScore: 0.85, isAnomaly: false },
      });

      await writer.writeEvent(event);

      const fm = parseFrontmatter(readInboxFiles()[0]?.content);
      expect(fm.conformance_score).toBe('0.85');
      expect(fm.is_anomaly).toBe('false');
    });

    it('adds agentflow/anomaly tag when isAnomaly is true', async () => {
      const writer = createSomaEventWriter({ inboxDir: testDir });
      const event = createExecutionEvent(buildCompletedGraph(), {
        processContext: { variant: 'A→B', conformanceScore: 0.3, isAnomaly: true },
      });

      await writer.writeEvent(event);

      const content = readInboxFiles()[0]?.content;
      expect(content).toContain('agentflow/anomaly');
    });
  });

  describe('PatternEvent', () => {
    it('creates a Markdown file with synthesis frontmatter', async () => {
      const writer = createSomaEventWriter({ inboxDir: testDir });
      const graphs = [buildCompletedGraph(), buildCompletedGraph()];
      const model = discoverProcess(graphs);
      const variants = findVariants(graphs);
      const bottlenecks = getBottlenecks(graphs);
      const event = createPatternEvent('test-agent', model, variants, bottlenecks);

      await writer.writeEvent(event);

      const files = readInboxFiles();
      expect(files).toHaveLength(1);

      const fm = parseFrontmatter(files[0]?.content);
      expect(fm.type).toBe("'synthesis'");
      expect(fm.subtype).toBe("'pattern-discovery'");
      expect(fm.variant_count).toBeDefined();
      expect(fm.total_graphs).toBe('2');
    });

    it('body contains variants table and bottlenecks table', async () => {
      const writer = createSomaEventWriter({ inboxDir: testDir });
      const graphs = [buildCompletedGraph(), buildCompletedGraph()];
      const model = discoverProcess(graphs);
      const variants = findVariants(graphs);
      const bottlenecks = getBottlenecks(graphs);
      const event = createPatternEvent('test-agent', model, variants, bottlenecks);

      await writer.writeEvent(event);

      const content = readInboxFiles()[0]?.content;
      expect(content).toContain('Top Variants');
      expect(content).toContain('Top Bottlenecks');
      expect(content).toContain('[[agent/test-agent]]');
    });
  });

  describe('file naming', () => {
    it('execution event files are named execution-{agentId}-{timestamp}.md', async () => {
      const writer = createSomaEventWriter({ inboxDir: testDir });
      const event = createExecutionEvent(buildCompletedGraph());
      await writer.writeEvent(event);

      const files = readInboxFiles();
      expect(files[0]?.name).toMatch(/^execution-test-agent-\d{4}-\d{2}-\d{2}T\d{6}\.md$/);
    });

    it('pattern event files are named synthesis-{agentId}-{timestamp}.md', async () => {
      const writer = createSomaEventWriter({ inboxDir: testDir });
      const graphs = [buildCompletedGraph()];
      const event = createPatternEvent(
        'test-agent',
        discoverProcess(graphs),
        findVariants(graphs),
        getBottlenecks(graphs),
      );
      await writer.writeEvent(event);

      const files = readInboxFiles();
      expect(files[0]?.name).toMatch(/^synthesis-test-agent-\d{4}-\d{2}-\d{2}T\d{6}\.md$/);
    });
  });

  describe('inbox directory auto-creation', () => {
    it('creates inbox directory if it does not exist', async () => {
      const nestedDir = join(testDir, 'deep', 'nested', 'inbox');
      const writer = createSomaEventWriter({ inboxDir: nestedDir });

      expect(existsSync(nestedDir)).toBe(false);
      await writer.writeEvent(createExecutionEvent(buildCompletedGraph()));
      expect(existsSync(nestedDir)).toBe(true);
    });
  });

  describe('EventEmitter integration', () => {
    it('emitter routes events to SomaEventWriter', async () => {
      const writer = createSomaEventWriter({ inboxDir: testDir });
      const emitter = createEventEmitter({ writers: [writer] });

      await emitter.emit(createExecutionEvent(buildCompletedGraph()));

      const files = readInboxFiles();
      expect(files).toHaveLength(1);
      expect(files[0]?.name).toMatch(/^execution-/);
    });
  });
});
