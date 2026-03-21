import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AnalysisFn, ExecutionEvent } from 'agentflow-core';
import { createSoma } from 'soma';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir: string;

function freshDir(): string {
  const dir = join(tmpdir(), `soma-int-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

/** Simple mock analysisFn. */
const mockAnalysisFn: AnalysisFn = async (prompt: string) => {
  if (prompt.includes('suggest a guard policy')) {
    return JSON.stringify({ scope: 'test', conditions: 'always', enforcement: 'warn' });
  }
  return JSON.stringify([
    {
      type: 'decision',
      title: 'Test Decision',
      claim: 'We decided X',
      confidence: 'medium',
      evidence: ['test'],
    },
  ]);
};

/** Deterministic mock embed. */
async function mockEmbedFn(text: string): Promise<number[]> {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  return [Math.sin(h) * 0.5 + 0.5, Math.cos(h) * 0.5 + 0.5, Math.sin(h * 2) * 0.5 + 0.5];
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
// Full feedback loop
// ---------------------------------------------------------------------------

describe('Soma integration', () => {
  it('runs full pipeline: ingest → reconcile → synthesize → map', async () => {
    const inboxDir = join(testDir, 'inbox');
    mkdirSync(inboxDir, { recursive: true });

    const soma = createSoma({
      vaultDir: join(testDir, 'vault'),
      inboxDir,
      analysisFn: mockAnalysisFn,
      embedFn: mockEmbedFn,
      harvester: { stateFile: join(testDir, 'harv-state.json') },
      synthesizer: { stateFile: join(testDir, 'synth-state.json') },
      cartographer: { stateFile: join(testDir, 'carto-state.json') },
      reconciler: { stateFile: join(testDir, 'recon-state.json') },
    });

    // Drop events in inbox
    const events = [
      makeExecEvent({ agentId: 'agent-a', timestamp: 1000 }),
      makeExecEvent({ agentId: 'agent-b', timestamp: 2000 }),
      makeExecEvent({ agentId: 'agent-a', timestamp: 3000, eventType: 'execution.failed' }),
    ];
    writeFileSync(join(inboxDir, 'batch.json'), JSON.stringify(events));

    // Run pipeline
    const result = await soma.run();

    expect(result.harvested).toBe(1); // 1 file processed
    expect(typeof result.reconciled.issues).toBe('number');
    expect(typeof result.reconciled.fixed).toBe('number');
    expect(typeof result.synthesized).toBe('number');
    expect(typeof result.mapped).toBe('number');
  });

  it('traces → ingest → policy bridge reads vault data', async () => {
    const soma = createSoma({
      vaultDir: join(testDir, 'vault'),
      inboxDir: join(testDir, 'inbox'),
      harvester: { stateFile: join(testDir, 'harv-state.json') },
      reconciler: { stateFile: join(testDir, 'recon-state.json') },
      cartographer: { stateFile: join(testDir, 'carto-state.json') },
    });

    // Ingest directly via harvester
    await soma.harvester.ingest([
      makeExecEvent({ agentId: 'my-agent', timestamp: 1000 }),
      makeExecEvent({ agentId: 'my-agent', timestamp: 2000, eventType: 'execution.failed' }),
    ]);

    // Policy bridge should see the agent's failure rate
    const failRate = soma.policySource.recentFailureRate('my-agent');
    expect(failRate).toBeCloseTo(0.5);
  });

  it('semantic search works after embed', async () => {
    const soma = createSoma({
      vaultDir: join(testDir, 'vault'),
      inboxDir: join(testDir, 'inbox'),
      embedFn: mockEmbedFn,
      harvester: { stateFile: join(testDir, 'harv-state.json') },
      reconciler: { stateFile: join(testDir, 'recon-state.json') },
      cartographer: { stateFile: join(testDir, 'carto-state.json') },
    });

    await soma.harvester.ingest([makeExecEvent({ agentId: 'search-agent', timestamp: 1000 })]);

    await soma.cartographer.embed();
    const results = await soma.cartographer.search('search agent execution');
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('watch returns a cleanup function', () => {
    const soma = createSoma({
      vaultDir: join(testDir, 'vault'),
      inboxDir: join(testDir, 'inbox'),
      harvester: { stateFile: join(testDir, 'harv-state.json') },
      reconciler: { stateFile: join(testDir, 'recon-state.json') },
      cartographer: { stateFile: join(testDir, 'carto-state.json') },
    });

    const stop = soma.watch();
    expect(typeof stop).toBe('function');
    stop(); // cleanup
  });
});
