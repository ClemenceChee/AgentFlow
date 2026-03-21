import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AnalysisFn } from 'agentflow-core';
import { createSynthesizer, createVault } from 'soma';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir: string;
let vaultDir: string;

function freshDir(): string {
  const dir = join(
    tmpdir(),
    `soma-synth-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Mock analysis function that returns learnings from any prompt. */
function mockAnalysisFn(specs: Array<{ type: string; title: string; claim: string }>): AnalysisFn {
  return async (_prompt: string) => JSON.stringify(specs);
}

beforeEach(() => {
  testDir = freshDir();
  vaultDir = join(testDir, 'vault');
});

afterEach(() => {
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {
    /* ok */
  }
});

// ---------------------------------------------------------------------------
// Candidate scoring
// ---------------------------------------------------------------------------

describe('Synthesizer scoring', () => {
  it('scores entity with decision keywords higher', () => {
    const vault = createVault({ baseDir: vaultDir });
    const analysisFn = mockAnalysisFn([]);
    const synth = createSynthesizer(vault, analysisFn, {
      stateFile: join(testDir, 'synth-state.json'),
    });

    const highScore = synth.scoreCandidate({
      type: 'execution',
      id: 'e1',
      name: 'test',
      status: 'completed',
      created: '',
      updated: '',
      tags: [],
      related: [],
      body: 'We decided to use the new API because it was required. The constraint was that we must not exceed the rate limit. We assumed the service would scale. However, this contradicts our earlier plan.',
    });

    const lowScore = synth.scoreCandidate({
      type: 'execution',
      id: 'e2',
      name: 'test',
      status: 'completed',
      created: '',
      updated: '',
      tags: [],
      related: [],
      body: 'ok',
    });

    expect(highScore).toBeGreaterThan(lowScore);
    expect(highScore).toBeGreaterThan(0.4); // above default threshold
  });

  it('structural markers boost score', () => {
    const vault = createVault({ baseDir: vaultDir });
    const analysisFn = mockAnalysisFn([]);
    const synth = createSynthesizer(vault, analysisFn, {
      stateFile: join(testDir, 'synth-state.json'),
    });

    const withMarkers = synth.scoreCandidate({
      type: 'execution',
      id: 'e1',
      name: 'test',
      status: 'completed',
      created: '',
      updated: '',
      tags: [],
      related: [],
      body: '## Context\nSome background.\n\n## Outcome\nIt worked.',
    });

    const without = synth.scoreCandidate({
      type: 'execution',
      id: 'e2',
      name: 'test',
      status: 'completed',
      created: '',
      updated: '',
      tags: [],
      related: [],
      body: 'Some background. It worked.',
    });

    expect(withMarkers).toBeGreaterThan(without);
  });
});

// ---------------------------------------------------------------------------
// Full pipeline
// ---------------------------------------------------------------------------

describe('Synthesizer pipeline', () => {
  it('creates learning records from high-scoring candidates', async () => {
    const vault = createVault({ baseDir: vaultDir });

    // Seed an execution entity that should score well
    vault.create({
      type: 'execution',
      id: 'exec-rich',
      name: 'Rich Exec',
      status: 'completed',
      tags: [],
      body: 'We decided to refactor the auth module because it was required by the compliance team. We assumed the migration would take 2 days. The constraint was that we must maintain backward compatibility. However, this contradicts our original timeline.\n\n## Context\nLong discussion about architecture.\n\n## Outcome\nSuccessfully migrated.',
    });

    const specs = [
      {
        type: 'decision',
        title: 'Refactor Auth Module',
        claim: 'Decided to refactor auth for compliance',
        confidence: 'high',
        evidence: ['compliance requirement'],
      },
    ];
    const analysisFn = mockAnalysisFn(specs);
    const synth = createSynthesizer(vault, analysisFn, {
      stateFile: join(testDir, 'synth-state.json'),
    });

    const created = await synth.synthesize();
    expect(created).toBeGreaterThanOrEqual(1);

    const decisions = vault.list('decision');
    expect(decisions.length).toBeGreaterThanOrEqual(1);
  });

  it('skips unchanged entities on re-run (MD5 change detection)', async () => {
    const vault = createVault({ baseDir: vaultDir });

    vault.create({
      type: 'execution',
      id: 'exec-stable',
      name: 'Stable',
      status: 'completed',
      tags: [],
      body: 'We decided to keep the old approach. We assumed this was the right call. The constraint was time.\n\n## Context\nDecision meeting.',
    });

    const analysisFn = mockAnalysisFn([
      {
        type: 'decision',
        title: 'Keep Old Approach',
        claim: 'Kept old approach due to time constraints',
      },
    ]);
    const stateFile = join(testDir, 'synth-state.json');
    const synth = createSynthesizer(vault, analysisFn, { stateFile });

    const first = await synth.synthesize();
    expect(first).toBeGreaterThanOrEqual(1);

    // Second run — same content, should skip
    const synth2 = createSynthesizer(vault, analysisFn, { stateFile });
    const second = await synth2.synthesize();
    expect(second).toBe(0);
  });

  it('deduplicates similar titles via overlap coefficient', async () => {
    const vault = createVault({ baseDir: vaultDir });

    // Two executions that would produce similar learnings
    vault.create({
      type: 'execution',
      id: 'e1',
      name: 'Exec A',
      status: 'completed',
      tags: [],
      body: 'We decided to use the new API because we believed it would be faster. We assumed the migration path was clear. The team must not break backward compatibility. However, this contradicts our earlier assumptions about the timeline.\n\n## Context\nArchitecture review meeting with the infrastructure team about the upcoming API migration.',
    });
    vault.create({
      type: 'execution',
      id: 'e2',
      name: 'Exec B',
      status: 'completed',
      tags: [],
      body: 'We decided to switch the API endpoint because we expected better throughput. The team must not exceed rate limits. Although this contradicts our original deployment plan, we chose to proceed.\n\n## Outcome\nMigration completed successfully with improved latency numbers.',
    });

    // Both return the same learning
    const analysisFn: AnalysisFn = async () =>
      JSON.stringify([
        {
          type: 'decision',
          title: 'Use New API Endpoint',
          claim: 'Switched to new API',
          confidence: 'medium',
          evidence: ['perf'],
        },
      ]);

    const synth = createSynthesizer(vault, analysisFn, {
      stateFile: join(testDir, 'synth-state.json'),
      dedupThreshold: 0.7,
    });

    const created = await synth.synthesize();
    // Should dedup the two identical learnings into one
    expect(created).toBe(1);
  });

  it('creates policy entities from high-confidence constraints', async () => {
    const vault = createVault({ baseDir: vaultDir });

    vault.create({
      type: 'execution',
      id: 'exec-policy',
      name: 'Policy Source',
      status: 'completed',
      tags: [],
      body: 'We decided that the system must not exceed 100 requests per second. The team assumed the previous limit was sufficient but that belief was invalidated by the outage. We cannot allow this to happen again. However, this contradicts our throughput goals.\n\n## Context\nIncident review with the operations team after the production outage caused by rate limiting failures.',
    });

    let _callCount = 0;
    const analysisFn: AnalysisFn = async (prompt: string) => {
      _callCount++;
      if (prompt.includes('suggest a guard policy')) {
        return JSON.stringify({
          scope: 'api-gateway',
          conditions: 'rate > 100 rps',
          enforcement: 'error',
          thresholds: { maxRps: 100 },
        });
      }
      return JSON.stringify([
        {
          type: 'constraint',
          title: 'Rate Limit 100 RPS',
          claim: 'Must not exceed 100 rps',
          confidence: 'high',
          evidence: ['outage report'],
        },
      ]);
    };

    const synth = createSynthesizer(vault, analysisFn, {
      stateFile: join(testDir, 'synth-state.json'),
    });
    await synth.synthesize();

    const policies = vault.list('policy');
    expect(policies.length).toBeGreaterThanOrEqual(1);
    const policy = policies[0]! as Record<string, unknown>;
    expect(policy.enforcement).toBe('error');
  });

  it('handles LLM returning empty array gracefully', async () => {
    const vault = createVault({ baseDir: vaultDir });

    vault.create({
      type: 'execution',
      id: 'exec-empty',
      name: 'Nothing Here',
      status: 'completed',
      tags: [],
      body: 'We decided this had useful keywords but actually the analysis found nothing.\n\n## Context\nFalse positive.',
    });

    const analysisFn: AnalysisFn = async () => '[]';
    const synth = createSynthesizer(vault, analysisFn, {
      stateFile: join(testDir, 'synth-state.json'),
    });

    const created = await synth.synthesize();
    expect(created).toBe(0);
  });
});
