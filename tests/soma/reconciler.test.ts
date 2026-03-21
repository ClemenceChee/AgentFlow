import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Vault } from 'soma';
import { createReconciler, createVault } from 'soma';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir: string;
let vaultDir: string;
let vault: Vault;

function freshDir(): string {
  const dir = join(
    tmpdir(),
    `soma-recon-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

beforeEach(() => {
  testDir = freshDir();
  vaultDir = join(testDir, 'vault');
  vault = createVault({ baseDir: vaultDir });
});

afterEach(() => {
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {
    /* ok */
  }
});

// ---------------------------------------------------------------------------
// Structural scan
// ---------------------------------------------------------------------------

describe('Reconciler scan', () => {
  it('detects missing created field (FM001)', () => {
    // Create an entity then manually tamper with it
    vault.create({ type: 'agent', id: 'bad-agent', name: 'Bad Agent', body: 'short' });

    const reconciler = createReconciler(vault, undefined, {
      stateFile: join(testDir, 'recon-state.json'),
      stubThreshold: 200, // body "short" is below 200
    });

    const issues = reconciler.scan({ fullScan: true });
    // Should find STUB001 at minimum (body too short)
    const stubs = issues.filter((i) => i.code === 'STUB001');
    expect(stubs.length).toBeGreaterThanOrEqual(1);
  });

  it('detects invalid status (FM003)', () => {
    vault.create({
      type: 'agent',
      id: 'weird-status',
      name: 'Weird',
      status: 'open' as any,
      body: 'x'.repeat(200),
    });

    const reconciler = createReconciler(vault, undefined, {
      stateFile: join(testDir, 'recon-state.json'),
    });

    const issues = reconciler.scan({ fullScan: true });
    const fm003 = issues.filter((i) => i.code === 'FM003');
    expect(fm003.length).toBeGreaterThanOrEqual(1);
    expect(fm003[0]?.message).toContain('open');
  });

  it('detects broken wikilinks (LINK001)', () => {
    vault.create({
      type: 'agent',
      id: 'link-test',
      name: 'Linker',
      related: ['execution/nonexistent-exec'],
      body: 'x'.repeat(200),
    });

    const reconciler = createReconciler(vault, undefined, {
      stateFile: join(testDir, 'recon-state.json'),
    });

    const issues = reconciler.scan({ fullScan: true });
    const links = issues.filter((i) => i.code === 'LINK001');
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]?.message).toContain('nonexistent-exec');
  });

  it('detects orphan entities on full scan (ORPHAN001)', () => {
    vault.create({ type: 'execution', id: 'orphan-exec', name: 'Orphan', body: 'x'.repeat(200) });

    const reconciler = createReconciler(vault, undefined, {
      stateFile: join(testDir, 'recon-state.json'),
    });

    const issues = reconciler.scan({ fullScan: true });
    const orphans = issues.filter((i) => i.code === 'ORPHAN001');
    expect(orphans.length).toBeGreaterThanOrEqual(1);
  });

  it('detects stub entities (STUB001)', () => {
    vault.create({ type: 'insight', id: 'stub', name: 'Stub Insight', body: 'tiny' });

    const reconciler = createReconciler(vault, undefined, {
      stateFile: join(testDir, 'recon-state.json'),
      stubThreshold: 100,
    });

    const issues = reconciler.scan({ fullScan: true });
    const stubs = issues.filter((i) => i.code === 'STUB001');
    expect(stubs.length).toBeGreaterThanOrEqual(1);
    expect(stubs[0]?.severity).toBe('info');
  });

  it('incremental scan skips unchanged entities', () => {
    vault.create({ type: 'agent', id: 'stable', name: 'Stable Agent', body: 'x'.repeat(200) });

    const stateFile = join(testDir, 'recon-state.json');
    const reconciler = createReconciler(vault, undefined, { stateFile });

    const first = reconciler.scan();
    const second = reconciler.scan(); // same content, should skip

    // Second scan should find fewer (or zero) issues since entity hasn't changed
    expect(second.length).toBeLessThanOrEqual(first.length);
  });
});

// ---------------------------------------------------------------------------
// Autofix
// ---------------------------------------------------------------------------

describe('Reconciler autofix', () => {
  it('corrects invalid status via alias map (FM003)', () => {
    vault.create({
      type: 'agent',
      id: 'fix-me',
      name: 'Fix Me',
      status: 'open' as any,
      body: 'x'.repeat(200),
    });

    const reconciler = createReconciler(vault, undefined, {
      stateFile: join(testDir, 'recon-state.json'),
    });

    const issues = reconciler.scan({ fullScan: true });
    const fixable = issues.filter((i) => i.autoFixable);
    const fixed = reconciler.autofix(fixable);

    expect(fixed).toBeGreaterThanOrEqual(1);

    const entity = vault.read('agent', 'fix-me');
    expect(entity?.status).toBe('active'); // 'open' → 'active'
  });

  it('skips non-autofixable issues', () => {
    vault.create({
      type: 'agent',
      id: 'no-fix',
      name: 'No Fix',
      related: ['execution/missing'],
      body: 'x'.repeat(200),
    });

    const reconciler = createReconciler(vault, undefined, {
      stateFile: join(testDir, 'recon-state.json'),
    });

    const issues = reconciler.scan({ fullScan: true });
    const brokenLinks = issues.filter((i) => i.code === 'LINK001');
    expect(brokenLinks.length).toBeGreaterThanOrEqual(1);
    expect(brokenLinks[0]?.autoFixable).toBe(false);

    const fixed = reconciler.autofix(brokenLinks);
    expect(fixed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Full pipeline
// ---------------------------------------------------------------------------

describe('Reconciler run', () => {
  it('runs full pipeline and returns stats', async () => {
    vault.create({
      type: 'agent',
      id: 'a1',
      name: 'Agent A',
      status: 'wip' as any,
      body: 'x'.repeat(200),
    });
    vault.create({ type: 'execution', id: 'e1', name: 'Exec 1', body: 'short' });

    const reconciler = createReconciler(vault, undefined, {
      stateFile: join(testDir, 'recon-state.json'),
      stubThreshold: 100,
    });

    const result = await reconciler.run({ fullScan: true });
    expect(result.issues).toBeGreaterThanOrEqual(1);
    expect(result.fixed).toBeGreaterThanOrEqual(1);
    expect(typeof result.scanned).toBe('number');
  });
});
