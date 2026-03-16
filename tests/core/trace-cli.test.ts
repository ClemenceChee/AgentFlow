/**
 * Tests for trace CLI command handlers.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createGraphBuilder } from '../../packages/core/src/graph-builder.js';
import { handleTrace } from '../../packages/core/src/trace-cli.js';
import { createTraceStore } from '../../packages/core/src/trace-store.js';

let globalCounter = 0;
function createTestIdGenerator(): () => string {
  return () => {
    globalCounter++;
    return `test_${String(globalCounter).padStart(3, '0')}`;
  };
}

describe('trace-cli', () => {
  let tmpDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'agentflow-cli-test-'));
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Save a test trace
    const store = createTraceStore(tmpDir);
    const builder = createGraphBuilder({
      agentId: 'test-agent',
      idGenerator: createTestIdGenerator(),
    });
    const root = builder.startNode({ type: 'agent', name: 'main' });
    const tool = builder.startNode({ type: 'tool', name: 'search', parentId: root });
    builder.endNode(tool);
    builder.endNode(root);
    await store.save(builder.build());
  });

  afterEach(async () => {
    consoleSpy.mockRestore();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('should handle trace list', async () => {
    await handleTrace(['trace', 'list', '--traces-dir', tmpDir]);
    expect(consoleSpy).toHaveBeenCalled();
    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('trace');
  });

  it('should handle trace show with valid ID', async () => {
    // Get the stored graph ID
    const store = createTraceStore(tmpDir);
    const graphs = await store.list();
    const graphId = graphs[0].id;

    await handleTrace(['trace', 'show', graphId, '--traces-dir', tmpDir]);
    expect(consoleSpy).toHaveBeenCalled();
    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('main');
  });

  it('should handle trace stuck', async () => {
    await handleTrace(['trace', 'stuck', '--traces-dir', tmpDir]);
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should handle trace loops', async () => {
    await handleTrace(['trace', 'loops', '--traces-dir', tmpDir]);
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should show help with --help', async () => {
    await handleTrace(['trace', '--help']);
    expect(consoleSpy).toHaveBeenCalled();
    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Usage');
  });

  it('should show help for unknown subcommand', async () => {
    await handleTrace(['trace', 'unknown']);
    expect(consoleSpy).toHaveBeenCalled();
    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Usage');
  });
});
