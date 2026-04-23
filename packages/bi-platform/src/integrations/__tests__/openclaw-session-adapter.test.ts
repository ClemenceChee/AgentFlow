import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenClawSessionAdapter } from '../openclaw-session-adapter.js';

// Mock fs operations
vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual('node:fs/promises');
  return {
    ...actual,
    readdir: vi.fn(),
    readFile: vi.fn(),
    stat: vi.fn(),
    lstat: vi.fn(),
    readlink: vi.fn(),
  };
});

const { readdir, readFile, stat, lstat, readlink } = await import('node:fs/promises');

describe('OpenClawSessionAdapter', () => {
  let adapter: OpenClawSessionAdapter;

  beforeEach(() => {
    vi.resetAllMocks();
    adapter = new OpenClawSessionAdapter({ agentsDir: '/mock/agents' });
  });

  it('discovers agents from directory listing', async () => {
    (readdir as any).mockImplementation(async (path: string, _opts?: any) => {
      if (path === '/mock/agents') {
        return [
          { name: 'main', isDirectory: () => true, isSymbolicLink: () => false },
          { name: 'test-agent', isDirectory: () => true, isSymbolicLink: () => false },
        ];
      }
      return [];
    });
    (lstat as any).mockResolvedValue({ isSymbolicLink: () => false, isDirectory: () => true });
    (stat as any).mockResolvedValue({ size: 100, mtime: new Date() });
    (readFile as any).mockRejectedValue(new Error('not found'));

    const agents = await adapter.getAgentData();
    expect(agents.length).toBe(2);
    expect(agents.map((a) => a.agentId)).toContain('main');
    expect(agents.map((a) => a.agentId)).toContain('test-agent');
  });

  it('deduplicates symlinks', async () => {
    (readdir as any).mockImplementation(async (path: string, _opts?: any) => {
      if (path === '/mock/agents') {
        return [
          { name: 'soma-harvester', isDirectory: () => true, isSymbolicLink: () => false },
          { name: 'vault-curator', isDirectory: () => false, isSymbolicLink: () => true },
        ];
      }
      return [];
    });
    (lstat as any).mockImplementation(async (path: string) => {
      if (path.includes('vault-curator'))
        return { isSymbolicLink: () => true, isDirectory: () => false };
      return { isSymbolicLink: () => false, isDirectory: () => true };
    });
    (readlink as any).mockResolvedValue('soma-harvester');
    (stat as any).mockResolvedValue({ size: 100, mtime: new Date() });
    (readFile as any).mockRejectedValue(new Error('not found'));

    const agents = await adapter.getAgentData();
    // Should deduplicate — only one agent for soma-harvester
    expect(agents.length).toBe(1);
    expect(agents[0].agentId).toBe('soma-harvester');
  });

  it('extracts token usage from JSONL', async () => {
    const jsonlContent = [
      '{"type":"session","id":"abc"}',
      '{"type":"model_change","modelId":"gpt-4o","provider":"openai"}',
      '{"type":"message","usage":{"input":1000,"output":200,"totalTokens":1200,"cost":{"total":0.05}}}',
      '{"type":"message","usage":{"input":500,"output":100,"totalTokens":600,"cost":{"total":0.02}}}',
    ].join('\n');

    (readdir as any).mockImplementation(async (path: string, _opts?: any) => {
      if (path === '/mock/agents')
        return [{ name: 'main', isDirectory: () => true, isSymbolicLink: () => false }];
      if (path.includes('sessions')) return ['test.jsonl'];
      return [];
    });
    (lstat as any).mockResolvedValue({ isSymbolicLink: () => false, isDirectory: () => true });
    (stat as any).mockResolvedValue({ size: 500, mtime: new Date() });
    (readFile as any).mockImplementation(async (path: string) => {
      if (path.includes('sessions.json')) throw new Error('not found');
      return jsonlContent;
    });

    const agents = await adapter.getAgentData();
    expect(agents.length).toBe(1);
    expect(agents[0].totalMessages).toBe(2);
    expect(agents[0].totalTokens).toBe(1800);
    expect(agents[0].totalCost).toBeCloseTo(0.07);
    expect(agents[0].activeModel).toBe('gpt-4o');
  });

  it('derives healthy status for recent activity', async () => {
    (readdir as any).mockImplementation(async (path: string, _opts?: any) => {
      if (path === '/mock/agents')
        return [{ name: 'main', isDirectory: () => true, isSymbolicLink: () => false }];
      return [];
    });
    (lstat as any).mockResolvedValue({ isSymbolicLink: () => false, isDirectory: () => true });
    (readFile as any).mockImplementation(async (path: string) => {
      if (path.includes('sessions.json')) {
        return JSON.stringify({
          'agent:main:main': { sessionId: 'abc', updatedAt: Date.now() - 3600_000 }, // 1 hour ago
        });
      }
      throw new Error('not found');
    });

    const agents = await adapter.getAgentData();
    expect(agents[0].status).toBe('healthy');
  });

  it('derives critical status for old activity', async () => {
    (readdir as any).mockImplementation(async (path: string, _opts?: any) => {
      if (path === '/mock/agents')
        return [{ name: 'old', isDirectory: () => true, isSymbolicLink: () => false }];
      return [];
    });
    (lstat as any).mockResolvedValue({ isSymbolicLink: () => false, isDirectory: () => true });
    (readFile as any).mockImplementation(async (path: string) => {
      if (path.includes('sessions.json')) {
        return JSON.stringify({
          'agent:old:old': { sessionId: 'abc', updatedAt: Date.now() - 30 * 86400_000 }, // 30 days ago
        });
      }
      throw new Error('not found');
    });

    const agents = await adapter.getAgentData();
    expect(agents[0].status).toBe('critical');
  });

  it('health() returns healthy when agents exist', async () => {
    (stat as any).mockResolvedValue({ size: 100, mtime: new Date() });
    (readdir as any).mockImplementation(async (path: string, _opts?: any) => {
      if (path === '/mock/agents')
        return [{ name: 'main', isDirectory: () => true, isSymbolicLink: () => false }];
      return [];
    });
    (lstat as any).mockResolvedValue({ isSymbolicLink: () => false, isDirectory: () => true });
    (readFile as any).mockRejectedValue(new Error('not found'));

    const health = await adapter.health();
    expect(health.status).toBe('healthy');
    expect(health.recordCount).toBe(1);
  });
});
