import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ExecutionEvent } from 'agentflow-core';
import { createHarvester, createVault } from 'soma';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir: string;
let vaultDir: string;
let stateFile: string;

function freshDir(): string {
  const dir = join(tmpdir(), `soma-harv-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeExecEvent(overrides?: Partial<ExecutionEvent>): ExecutionEvent {
  return {
    eventType: 'execution.completed',
    graphId: 'g1',
    agentId: 'test-agent',
    timestamp: Date.now(),
    schemaVersion: 1,
    status: 'completed' as any,
    duration: 1000,
    nodeCount: 3,
    pathSignature: 'A→B→C',
    violations: [],
    ...overrides,
  } as ExecutionEvent;
}

beforeEach(() => {
  testDir = freshDir();
  vaultDir = join(testDir, 'vault');
  stateFile = join(testDir, 'harvester-state.json');
});

afterEach(() => {
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {
    /* ok */
  }
});

// ---------------------------------------------------------------------------
// Ingestion
// ---------------------------------------------------------------------------

describe('Harvester ingest', () => {
  it('ingests execution events and creates entities', async () => {
    const vault = createVault({ baseDir: vaultDir });
    const harvester = createHarvester(vault, { stateFile });

    const events = [makeExecEvent({ agentId: 'alpha', timestamp: 1000 })];
    const count = await harvester.ingest(events);

    expect(count).toBe(1);

    // Agent entity created
    const agent = vault.read('agent', 'alpha');
    expect(agent).not.toBeNull();
    expect(agent?.name).toBe('alpha');

    // Execution entity created
    const execs = vault.list('execution');
    expect(execs.length).toBeGreaterThanOrEqual(1);
  });

  it('creates bidirectional links between agent and execution', async () => {
    const vault = createVault({ baseDir: vaultDir });
    const harvester = createHarvester(vault, { stateFile });

    await harvester.ingest([makeExecEvent({ agentId: 'beta', timestamp: 2000 })]);

    const execs = vault.list('execution');
    const exec = execs[0]!;
    expect(exec.related).toEqual(expect.arrayContaining([expect.stringContaining('agent/')]));

    const agent = vault.read('agent', 'beta');
    expect(agent?.related.some((r) => r.startsWith('execution/'))).toBe(true);
  });

  it('updates agent profile (totalExecutions, failureRate)', async () => {
    const vault = createVault({ baseDir: vaultDir });
    const harvester = createHarvester(vault, { stateFile });

    await harvester.ingest([
      makeExecEvent({ agentId: 'gamma', timestamp: 1000 }),
      makeExecEvent({ agentId: 'gamma', timestamp: 2000, eventType: 'execution.failed' }),
    ]);

    const agent = vault.read('agent', 'gamma') as Record<string, unknown>;
    expect(agent.totalExecutions).toBe(2);
    expect(agent.failureRate).toBeCloseTo(0.5);
  });
});

// ---------------------------------------------------------------------------
// Dedup / state tracking
// ---------------------------------------------------------------------------

describe('Harvester deduplication', () => {
  it('skips already-processed events', async () => {
    const vault = createVault({ baseDir: vaultDir });
    const harvester = createHarvester(vault, { stateFile });

    const event = makeExecEvent({ agentId: 'delta', timestamp: 5000 });
    expect(await harvester.ingest([event])).toBe(1);
    expect(await harvester.ingest([event])).toBe(0); // duplicate
  });

  it('tracks processed count in state', async () => {
    const vault = createVault({ baseDir: vaultDir });
    const harvester = createHarvester(vault, { stateFile });

    await harvester.ingest([makeExecEvent({ timestamp: 100 })]);
    const state = harvester.getState();
    expect(state.processedCount).toBe(1);
    expect(state.lastTimestamp).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Inbox processing
// ---------------------------------------------------------------------------

describe('Harvester processInbox', () => {
  it('processes JSON event files from inbox', async () => {
    const vault = createVault({ baseDir: vaultDir });
    const harvester = createHarvester(vault, { stateFile });

    const inboxDir = join(testDir, 'inbox');
    mkdirSync(inboxDir, { recursive: true });

    const event = makeExecEvent({ agentId: 'inbox-agent', timestamp: 9000 });
    writeFileSync(join(inboxDir, 'batch.json'), JSON.stringify([event]));

    const count = await harvester.processInbox(inboxDir);
    expect(count).toBe(1);

    // File moved to processed/
    const processedDir = join(testDir, 'processed');
    const { existsSync } = require('node:fs');
    expect(existsSync(join(processedDir, 'batch.json'))).toBe(true);
    expect(existsSync(join(inboxDir, 'batch.json'))).toBe(false);
  });

  it('creates note entities from markdown files', async () => {
    const vault = createVault({ baseDir: vaultDir });
    const harvester = createHarvester(vault, { stateFile });

    const inboxDir = join(testDir, 'inbox');
    mkdirSync(inboxDir, { recursive: true });
    writeFileSync(join(inboxDir, 'observation.md'), '# My observation\n\nSomething important.');

    const count = await harvester.processInbox(inboxDir);
    expect(count).toBe(1);
  });

  it('moves errored files to errors/ directory', async () => {
    const vault = createVault({ baseDir: vaultDir });
    const harvester = createHarvester(vault, { stateFile });

    const inboxDir = join(testDir, 'inbox');
    mkdirSync(inboxDir, { recursive: true });
    writeFileSync(join(inboxDir, 'bad.json'), 'not valid json {{{');

    const count = await harvester.processInbox(inboxDir);
    expect(count).toBe(0);

    const { existsSync } = require('node:fs');
    expect(existsSync(join(testDir, 'errors', 'bad.json'))).toBe(true);
  });

  it('returns 0 for nonexistent inbox', async () => {
    const vault = createVault({ baseDir: vaultDir });
    const harvester = createHarvester(vault, { stateFile });
    expect(await harvester.processInbox(join(testDir, 'no-such-dir'))).toBe(0);
  });
});
