import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createVault } from 'soma';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir: string;

function freshDir(): string {
  const dir = join(
    tmpdir(),
    `soma-vault-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
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
// CRUD
// ---------------------------------------------------------------------------

describe('Vault CRUD', () => {
  it('creates and reads an entity', () => {
    const vault = createVault({ baseDir: testDir });
    const id = vault.create({
      type: 'agent',
      name: 'My Agent',
      tags: ['test'],
      body: 'Hello world',
    });

    expect(id).toBeTruthy();

    const entity = vault.read('agent', id);
    expect(entity).not.toBeNull();
    expect(entity?.type).toBe('agent');
    expect(entity?.name).toBe('My Agent');
    expect(entity?.tags).toEqual(['test']);
    expect(entity?.body).toContain('Hello world');
    expect(entity?.status).toBe('active');
    expect(entity?.created).toBeTruthy();
    expect(entity?.updated).toBeTruthy();
  });

  it('creates entity with explicit id', () => {
    const vault = createVault({ baseDir: testDir });
    const id = vault.create({ type: 'insight', id: 'custom-id', name: 'Custom' });
    expect(id).toBe('custom-id');
    expect(vault.read('insight', 'custom-id')).not.toBeNull();
  });

  it('generates filesystem-safe id from name', () => {
    const vault = createVault({ baseDir: testDir });
    const id = vault.create({ type: 'agent', name: 'My Cool Agent!!!' });
    expect(id).toBe('my-cool-agent');
  });

  it('updates an entity', () => {
    const vault = createVault({ baseDir: testDir });
    const id = vault.create({ type: 'agent', name: 'Agent', tags: ['a'] });

    vault.update(id, { tags: ['a', 'b'], status: 'inactive' });

    const entity = vault.read('agent', id);
    expect(entity?.tags).toEqual(['a', 'b']);
    expect(entity?.status).toBe('inactive');
  });

  it('removes an entity', () => {
    const vault = createVault({ baseDir: testDir });
    const id = vault.create({ type: 'agent', name: 'Doomed' });
    expect(vault.read('agent', id)).not.toBeNull();

    vault.remove(id);
    expect(vault.read('agent', id)).toBeNull();
  });

  it('returns null for missing entities', () => {
    const vault = createVault({ baseDir: testDir });
    expect(vault.read('agent', 'nonexistent')).toBeNull();
  });

  it('update on nonexistent id is a no-op', () => {
    const vault = createVault({ baseDir: testDir });
    // Should not throw
    vault.update('ghost', { status: 'inactive' });
  });

  it('remove on nonexistent id is a no-op', () => {
    const vault = createVault({ baseDir: testDir });
    vault.remove('ghost');
  });
});

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

describe('Vault queries', () => {
  it('lists entities by type', () => {
    const vault = createVault({ baseDir: testDir });
    vault.create({ type: 'agent', name: 'A1' });
    vault.create({ type: 'agent', name: 'A2' });
    vault.create({ type: 'insight', name: 'I1' });

    expect(vault.list('agent')).toHaveLength(2);
    expect(vault.list('insight')).toHaveLength(1);
    expect(vault.list('policy')).toHaveLength(0);
  });

  it('list respects limit', () => {
    const vault = createVault({ baseDir: testDir });
    for (let i = 0; i < 5; i++) vault.create({ type: 'agent', id: `a${i}`, name: `Agent ${i}` });

    expect(vault.list('agent', { limit: 2 })).toHaveLength(2);
  });

  it('finds entities by tag', () => {
    const vault = createVault({ baseDir: testDir });
    vault.create({ type: 'agent', name: 'Tagged', tags: ['special'] });
    vault.create({ type: 'agent', name: 'Not Tagged', tags: ['other'] });

    const results = vault.findByTag('special');
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe('Tagged');
  });

  it('finds linked entities', () => {
    const vault = createVault({ baseDir: testDir });
    vault.create({ type: 'agent', id: 'alpha', name: 'Alpha' });
    vault.create({ type: 'execution', id: 'exec-1', name: 'Exec 1', related: ['agent/alpha'] });

    const linked = vault.findLinked('exec-1');
    expect(linked).toHaveLength(1);
    expect(linked[0]?.id).toBe('alpha');
  });

  it('findLinked returns empty for entity with no links', () => {
    const vault = createVault({ baseDir: testDir });
    vault.create({ type: 'agent', id: 'lonely', name: 'Lonely' });
    expect(vault.findLinked('lonely')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------

describe('Vault index', () => {
  it('persists index to _index.json', () => {
    const vault = createVault({ baseDir: testDir });
    vault.create({ type: 'agent', name: 'Indexed' });

    expect(existsSync(join(testDir, '_index.json'))).toBe(true);
    const indexData = JSON.parse(readFileSync(join(testDir, '_index.json'), 'utf-8'));
    expect(Object.keys(indexData).length).toBe(1);
  });

  it('rebuilds index from disk', () => {
    const vault = createVault({ baseDir: testDir });
    vault.create({ type: 'agent', id: 'a1', name: 'Agent 1' });
    vault.create({ type: 'insight', id: 'i1', name: 'Insight 1' });

    // Wipe the index file
    writeFileSync(join(testDir, '_index.json'), '{}', 'utf-8');

    // Create new vault instance (should rebuild)
    const vault2 = createVault({ baseDir: testDir });
    expect(vault2.read('agent', 'a1')).not.toBeNull();
    expect(vault2.read('insight', 'i1')).not.toBeNull();
  });

  it('rebuildIndex explicitly re-scans', () => {
    const vault = createVault({ baseDir: testDir });
    vault.create({ type: 'agent', id: 'a1', name: 'A1' });

    // Manually write a file (bypassing vault)
    const agentDir = join(testDir, 'agent');
    writeFileSync(
      join(agentDir, 'sneaky.md'),
      '---\ntype: agent\nid: sneaky\nname: Sneaky\nstatus: active\ncreated: 2024-01-01\nupdated: 2024-01-01\ntags: []\nrelated: []\n---\n\nI was snuck in.\n',
    );

    vault.rebuildIndex();
    expect(vault.read('agent', 'sneaky')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Mutation log
// ---------------------------------------------------------------------------

describe('Vault mutation log', () => {
  it('logs create, update, and delete operations', () => {
    const vault = createVault({ baseDir: testDir });
    const id = vault.create({ type: 'agent', name: 'Tracked' });
    vault.update(id, { status: 'inactive' });
    vault.remove(id);

    const logPath = join(testDir, '_mutations.jsonl');
    expect(existsSync(logPath)).toBe(true);

    const lines = readFileSync(logPath, 'utf-8').trim().split('\n');
    expect(lines.length).toBe(3);

    const ops = lines.map((l) => JSON.parse(l));
    expect(ops[0].op).toBe('create');
    expect(ops[1].op).toBe('update');
    expect(ops[1].fields).toEqual(['status']);
    expect(ops[2].op).toBe('delete');
  });
});

// ---------------------------------------------------------------------------
// Atomic writes
// ---------------------------------------------------------------------------

describe('Vault atomic writes', () => {
  it('entity file exists on disk after create', () => {
    const vault = createVault({ baseDir: testDir });
    const id = vault.create({ type: 'agent', name: 'Persisted' });
    const fp = join(testDir, 'agent', `${id}.md`);
    expect(existsSync(fp)).toBe(true);

    const content = readFileSync(fp, 'utf-8');
    expect(content).toContain('name: Persisted');
    expect(content).toContain('type: agent');
  });
});
