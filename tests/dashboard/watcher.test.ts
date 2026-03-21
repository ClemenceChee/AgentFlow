import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WatchedTrace } from '../../packages/dashboard/src/watcher.js';
import { TraceWatcher } from '../../packages/dashboard/src/watcher.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TRACE_JSON = {
  id: 'test-trace-1',
  agentId: 'test-agent',
  trigger: 'cron',
  nodes: {
    root: {
      id: 'root',
      type: 'agent',
      name: 'test',
      startTime: 1000,
      endTime: 2000,
      status: 'completed',
      children: [],
      parentId: null,
      metadata: {},
      state: {},
    },
  },
  rootId: 'root',
  startTime: 1000,
  edges: [],
  events: [],
  metadata: {},
};

const SESSION_JSONL = [
  '{"type":"session","version":3,"id":"test-session","timestamp":"2026-03-19T00:00:00Z","cwd":"/tmp"}',
  '{"type":"model_change","id":"mc1","parentId":null,"timestamp":"2026-03-19T00:00:00Z","provider":"openrouter","modelId":"test-model"}',
  '{"type":"message","id":"m1","parentId":"mc1","timestamp":"2026-03-19T00:00:01Z","message":{"role":"user","content":[{"type":"text","text":"Hello agent"}]}}',
  '{"type":"message","id":"m2","parentId":"m1","timestamp":"2026-03-19T00:00:05Z","message":{"role":"assistant","content":[{"type":"text","text":"Hello! How can I help?"}],"usage":{"input":100,"output":50,"totalTokens":150},"stopReason":"end_turn"}}',
].join('\n');

const OPENCLAW_LOG = JSON.stringify({
  payloads: [{ text: 'Agent response here', mediaUrl: null }],
  meta: {
    durationMs: 5000,
    agentMeta: {
      sessionId: 'janitor-test-abc123',
      provider: 'openrouter',
      model: 'test-model',
      usage: { input: 100, output: 50, total: 150 },
    },
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agentflow-watcher-test-'));
}

function writeFixture(dir: string, relativePath: string, content: string) {
  const fullPath = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
  return fullPath;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TraceWatcher', () => {
  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('loadTraceFile (JSON traces)', () => {
    it('correctly parses a valid JSON trace', () => {
      writeFixture(tmpDir, 'trace1.json', JSON.stringify(TRACE_JSON));
      const watcher = new TraceWatcher(tmpDir);
      try {
        const traces = watcher.getAllTraces();
        expect(traces.length).toBe(1);
        expect(traces[0].id).toBe('test-trace-1');
        expect(traces[0].agentId).toBe('test-agent');
        expect(traces[0].trigger).toBe('cron');
        expect(traces[0].sourceType).toBe('trace');
      } finally {
        watcher.stop();
      }
    });

    it('nodes are Map instances, not plain objects', () => {
      writeFixture(tmpDir, 'trace1.json', JSON.stringify(TRACE_JSON));
      const watcher = new TraceWatcher(tmpDir);
      try {
        const trace = watcher.getAllTraces()[0];
        expect(trace.nodes).toBeInstanceOf(Map);
        expect(trace.nodes.get('root')).toBeDefined();
        expect(trace.nodes.get('root')?.name).toBe('test');
      } finally {
        watcher.stop();
      }
    });

    it('skips malformed JSON files silently', () => {
      writeFixture(tmpDir, 'bad.json', '{ this is not valid json }}}');
      writeFixture(tmpDir, 'good.json', JSON.stringify(TRACE_JSON));
      const watcher = new TraceWatcher(tmpDir);
      try {
        const traces = watcher.getAllTraces();
        expect(traces.length).toBe(1);
        expect(traces[0].id).toBe('test-trace-1');
      } finally {
        watcher.stop();
      }
    });

    it('handles empty JSON file', () => {
      writeFixture(tmpDir, 'empty.json', '');
      const watcher = new TraceWatcher(tmpDir);
      try {
        expect(watcher.getAllTraces().length).toBe(0);
      } finally {
        watcher.stop();
      }
    });
  });

  describe('loadSessionFile (JSONL sessions)', () => {
    it('correctly parses a JSONL session', () => {
      writeFixture(tmpDir, 'session.jsonl', SESSION_JSONL);
      const watcher = new TraceWatcher(tmpDir);
      try {
        const traces = watcher.getAllTraces();
        expect(traces.length).toBe(1);
        expect(traces[0].sourceType).toBe('session');
        expect(traces[0].id).toBe('test-session');
      } finally {
        watcher.stop();
      }
    });

    it('extracts agentId from path .../agents/main/sessions/', () => {
      const sessionsDir = path.join(tmpDir, 'agents', 'main', 'sessions');
      writeFixture(tmpDir, 'agents/main/sessions/test.jsonl', SESSION_JSONL);

      const watcher = new TraceWatcher({ tracesDir: tmpDir, dataDirs: [sessionsDir] });
      try {
        const traces = watcher.getAllTraces();
        const sessionTrace = traces.find((t) => t.sourceType === 'session');
        expect(sessionTrace).toBeDefined();
        // The agentId should be extracted from the agents/AGENT_NAME path
        // The exact prefix depends on whether path contains '.openclaw/'
        expect(sessionTrace?.agentId).toContain('main');
      } finally {
        watcher.stop();
      }
    });

    it('extracts agentId from OpenClaw path with .openclaw in path', () => {
      // Simulate the real .openclaw directory structure
      const openclawDir = path.join(tmpDir, '.openclaw', 'agents', 'main', 'sessions');
      writeFixture(tmpDir, '.openclaw/agents/main/sessions/test.jsonl', SESSION_JSONL);

      // Hidden dirs are skipped by scanDirectoryRecursive, so use dataDirs
      const watcher = new TraceWatcher({ tracesDir: tmpDir, dataDirs: [openclawDir] });
      try {
        const traces = watcher.getAllTraces();
        const sessionTrace = traces.find((t) => t.sourceType === 'session');
        expect(sessionTrace).toBeDefined();
        // loadSessionFile extracts agentId from directory structure:
        // .../agents/{agentName}/sessions/file.jsonl -> agentId = agentName
        // The openclaw- prefix is NOT added in loadSessionFile (only in extractAgentFromPath for logs)
        expect(sessionTrace?.agentId).toBe('main');
      } finally {
        watcher.stop();
      }
    });

    it('extracts agentId from path .../agents/vault-curator/sessions/', () => {
      const sessionsDir = path.join(tmpDir, 'agents', 'vault-curator', 'sessions');
      writeFixture(tmpDir, 'agents/vault-curator/sessions/abc.jsonl', SESSION_JSONL);

      const watcher = new TraceWatcher({ tracesDir: tmpDir, dataDirs: [sessionsDir] });
      try {
        const traces = watcher.getAllTraces();
        const sessionTrace = traces.find((t) => t.sourceType === 'session');
        expect(sessionTrace).toBeDefined();
        expect(sessionTrace?.agentId).toContain('vault-curator');
      } finally {
        watcher.stop();
      }
    });

    it('session events are correctly parsed', () => {
      writeFixture(tmpDir, 'session.jsonl', SESSION_JSONL);
      const watcher = new TraceWatcher(tmpDir);
      try {
        const trace = watcher.getAllTraces()[0] as WatchedTrace;
        expect(trace.sessionEvents).toBeDefined();
        const events = trace.sessionEvents;

        expect(events.length).toBeGreaterThan(0);

        const systemEvent = events.find((e) => e.type === 'system');
        expect(systemEvent).toBeDefined();
        expect(systemEvent?.name).toBe('Session Started');

        const modelChange = events.find((e) => e.type === 'model_change');
        expect(modelChange).toBeDefined();
        expect(modelChange?.model).toBe('test-model');
        expect(modelChange?.provider).toBe('openrouter');

        const userEvent = events.find((e) => e.type === 'user');
        expect(userEvent).toBeDefined();
        expect(userEvent?.content).toBe('Hello agent');

        const assistantEvent = events.find((e) => e.type === 'assistant');
        expect(assistantEvent).toBeDefined();
        expect(assistantEvent?.content).toBe('Hello! How can I help?');
      } finally {
        watcher.stop();
      }
    });

    it('token usage is correctly aggregated', () => {
      writeFixture(tmpDir, 'session.jsonl', SESSION_JSONL);
      const watcher = new TraceWatcher(tmpDir);
      try {
        const trace = watcher.getAllTraces()[0] as WatchedTrace;
        expect(trace.tokenUsage).toBeDefined();
        expect(trace.tokenUsage?.input).toBe(100);
        expect(trace.tokenUsage?.output).toBe(50);
        expect(trace.tokenUsage?.total).toBe(150);
      } finally {
        watcher.stop();
      }
    });

    it('nodes are Map instances in JSONL sessions', () => {
      writeFixture(tmpDir, 'session.jsonl', SESSION_JSONL);
      const watcher = new TraceWatcher(tmpDir);
      try {
        const trace = watcher.getAllTraces()[0];
        expect(trace.nodes).toBeInstanceOf(Map);
      } finally {
        watcher.stop();
      }
    });

    it('skips empty JSONL file', () => {
      writeFixture(tmpDir, 'empty.jsonl', '');
      const watcher = new TraceWatcher(tmpDir);
      try {
        expect(watcher.getAllTraces().length).toBe(0);
      } finally {
        watcher.stop();
      }
    });

    it('skips JSONL with only malformed lines', () => {
      writeFixture(tmpDir, 'bad.jsonl', 'not json\nalso not json\n');
      const watcher = new TraceWatcher(tmpDir);
      try {
        expect(watcher.getAllTraces().length).toBe(0);
      } finally {
        watcher.stop();
      }
    });

    it('handles JSONL with tool_call and tool_result events', () => {
      const sessionWithTools = [
        '{"type":"session","version":3,"id":"tool-session","timestamp":"2026-03-19T00:00:00Z","cwd":"/tmp"}',
        '{"type":"message","id":"u1","parentId":null,"timestamp":"2026-03-19T00:00:01Z","message":{"role":"user","content":[{"type":"text","text":"Read a file"}]}}',
        '{"type":"message","id":"a1","parentId":"u1","timestamp":"2026-03-19T00:00:02Z","message":{"role":"assistant","content":[{"type":"toolCall","id":"tc1","name":"Read","arguments":{"path":"/tmp/test"}}],"usage":{"input":50,"output":30,"totalTokens":80}}}',
        '{"type":"message","id":"tr1","parentId":"a1","timestamp":"2026-03-19T00:00:03Z","message":{"role":"toolResult","content":[{"type":"text","text":"file contents here","toolCallId":"tc1"}]}}',
        '{"type":"message","id":"a2","parentId":"tr1","timestamp":"2026-03-19T00:00:04Z","message":{"role":"assistant","content":[{"type":"text","text":"I read the file."}],"usage":{"input":80,"output":20,"totalTokens":100},"stopReason":"end_turn"}}',
      ].join('\n');

      writeFixture(tmpDir, 'tools.jsonl', sessionWithTools);
      const watcher = new TraceWatcher(tmpDir);
      try {
        const trace = watcher.getAllTraces()[0] as WatchedTrace;
        expect(trace.sessionEvents).toBeDefined();
        const events = trace.sessionEvents;

        const toolCalls = events.filter((e) => e.type === 'tool_call');
        expect(toolCalls.length).toBe(1);
        expect(toolCalls[0].toolName).toBe('Read');

        const toolResults = events.filter((e) => e.type === 'tool_result');
        expect(toolResults.length).toBe(1);
        expect(toolResults[0].toolResult).toContain('file contents');

        // Token usage aggregated across both assistant messages
        expect(trace.tokenUsage?.input).toBe(130);
        expect(trace.tokenUsage?.output).toBe(50);
      } finally {
        watcher.stop();
      }
    });

    it('handles JSONL with thinking blocks', () => {
      const sessionWithThinking = [
        '{"type":"session","version":3,"id":"think-session","timestamp":"2026-03-19T00:00:00Z","cwd":"/tmp"}',
        '{"type":"message","id":"u1","parentId":null,"timestamp":"2026-03-19T00:00:01Z","message":{"role":"user","content":[{"type":"text","text":"Think about this"}]}}',
        '{"type":"message","id":"a1","parentId":"u1","timestamp":"2026-03-19T00:00:02Z","message":{"role":"assistant","content":[{"type":"thinking","thinking":"Let me consider..."},{"type":"text","text":"Here is my answer."}],"usage":{"input":50,"output":30,"totalTokens":80},"stopReason":"end_turn"}}',
      ].join('\n');

      writeFixture(tmpDir, 'thinking.jsonl', sessionWithThinking);
      const watcher = new TraceWatcher(tmpDir);
      try {
        const trace = watcher.getAllTraces()[0] as WatchedTrace;
        expect(trace.sessionEvents).toBeDefined();
        const events = trace.sessionEvents;

        const thinkingEvents = events.filter((e) => e.type === 'thinking');
        expect(thinkingEvents.length).toBe(1);
        expect(thinkingEvents[0].content).toBe('Let me consider...');

        // Should also create a decision node
        const decisionNodes = Array.from(trace.nodes.values()).filter((n) => n.type === 'decision');
        expect(decisionNodes.length).toBe(1);
      } finally {
        watcher.stop();
      }
    });
  });

  describe('loadLogFile (OpenClaw log format)', () => {
    it('handles OpenClaw log format with JSON payloads', () => {
      writeFixture(tmpDir, 'openclaw.log', OPENCLAW_LOG);
      const watcher = new TraceWatcher(tmpDir);
      try {
        const traces = watcher.getAllTraces();
        expect(traces.length).toBeGreaterThanOrEqual(1);
        // Log file should be loaded and assigned a sourceType
        expect(['trace', 'session']).toContain(traces[0].sourceType);
        // Verify the trace has a filename matching the log file
        expect(traces[0].filename).toBe('openclaw.log');
      } finally {
        watcher.stop();
      }
    });

    it('handles log files with structured timestamp lines', () => {
      const logContent = [
        '{"timestamp":"2026-03-19T00:00:00Z","level":"info","action":"daemon.starting","run_id":"run-1"}',
        '{"timestamp":"2026-03-19T00:00:01Z","level":"info","action":"daemon.complete","run_id":"run-1"}',
      ].join('\n');

      writeFixture(tmpDir, 'structured.log', logContent);
      const watcher = new TraceWatcher(tmpDir);
      try {
        const traces = watcher.getAllTraces();
        expect(traces.length).toBeGreaterThanOrEqual(1);
      } finally {
        watcher.stop();
      }
    });
  });

  describe('getAllTraces', () => {
    it('returns traces sorted by lastModified descending', () => {
      // Write files with slight delay to get different mtimes
      const trace1 = { ...TRACE_JSON, id: 'trace-old', startTime: 1000 };
      const trace2 = { ...TRACE_JSON, id: 'trace-new', startTime: 2000 };

      writeFixture(tmpDir, 'old.json', JSON.stringify(trace1));

      // Touch the second file to make it newer
      const newPath = writeFixture(tmpDir, 'new.json', JSON.stringify(trace2));
      const now = new Date();
      fs.utimesSync(newPath, now, now);

      const watcher = new TraceWatcher(tmpDir);
      try {
        const traces = watcher.getAllTraces();
        expect(traces.length).toBe(2);
        // The newer file should come first
        const firstModified = traces[0].lastModified || traces[0].startTime;
        const secondModified = traces[1].lastModified || traces[1].startTime;
        expect(firstModified).toBeGreaterThanOrEqual(secondModified);
      } finally {
        watcher.stop();
      }
    });
  });

  describe('getTracesByAgent', () => {
    it('filters traces by agentId', () => {
      const traceA = { ...TRACE_JSON, id: 'a1', agentId: 'agent-a' };
      const traceB = { ...TRACE_JSON, id: 'b1', agentId: 'agent-b' };
      const traceA2 = { ...TRACE_JSON, id: 'a2', agentId: 'agent-a' };

      writeFixture(tmpDir, 'a1.json', JSON.stringify(traceA));
      writeFixture(tmpDir, 'b1.json', JSON.stringify(traceB));
      writeFixture(tmpDir, 'a2.json', JSON.stringify(traceA2));

      const watcher = new TraceWatcher(tmpDir);
      try {
        const agentATraces = watcher.getTracesByAgent('agent-a');
        expect(agentATraces.length).toBe(2);
        expect(agentATraces.every((t) => t.agentId === 'agent-a')).toBe(true);

        const agentBTraces = watcher.getTracesByAgent('agent-b');
        expect(agentBTraces.length).toBe(1);
        expect(agentBTraces[0].agentId).toBe('agent-b');

        const noTraces = watcher.getTracesByAgent('nonexistent');
        expect(noTraces.length).toBe(0);
      } finally {
        watcher.stop();
      }
    });
  });

  describe('getAgentIds', () => {
    it('returns all unique agent IDs sorted', () => {
      const traceA = { ...TRACE_JSON, id: 'a1', agentId: 'charlie' };
      const traceB = { ...TRACE_JSON, id: 'b1', agentId: 'alpha' };
      const traceC = { ...TRACE_JSON, id: 'c1', agentId: 'bravo' };
      const traceD = { ...TRACE_JSON, id: 'd1', agentId: 'alpha' }; // duplicate

      writeFixture(tmpDir, 'a.json', JSON.stringify(traceA));
      writeFixture(tmpDir, 'b.json', JSON.stringify(traceB));
      writeFixture(tmpDir, 'c.json', JSON.stringify(traceC));
      writeFixture(tmpDir, 'd.json', JSON.stringify(traceD));

      const watcher = new TraceWatcher(tmpDir);
      try {
        const ids = watcher.getAgentIds();
        expect(ids).toEqual(['alpha', 'bravo', 'charlie']);
      } finally {
        watcher.stop();
      }
    });
  });

  describe('file watching', () => {
    it('detects new files added after construction', async () => {
      const watcher = new TraceWatcher(tmpDir);
      try {
        expect(watcher.getAllTraces().length).toBe(0);

        const addedPromise = new Promise<WatchedTrace>((resolve) => {
          watcher.on('trace-added', resolve);
        });

        // Wait a moment for chokidar to be ready, then write a file
        await new Promise((r) => setTimeout(r, 300));
        writeFixture(tmpDir, 'new-trace.json', JSON.stringify(TRACE_JSON));

        const addedTrace = await Promise.race([
          addedPromise,
          new Promise<null>((r) => setTimeout(() => r(null), 5000)),
        ]);

        expect(addedTrace).not.toBeNull();
        if (addedTrace) {
          expect(addedTrace.id).toBe('test-trace-1');
        }
      } finally {
        watcher.stop();
      }
    }, 10000);

    it('detects changes to existing files', async () => {
      writeFixture(tmpDir, 'mutable.json', JSON.stringify(TRACE_JSON));
      const watcher = new TraceWatcher(tmpDir);
      try {
        expect(watcher.getAllTraces().length).toBe(1);

        const updatedPromise = new Promise<WatchedTrace>((resolve) => {
          watcher.on('trace-updated', resolve);
        });

        // Wait for chokidar to be ready, then modify the file
        await new Promise((r) => setTimeout(r, 300));
        const updated = { ...TRACE_JSON, id: 'updated-trace' };
        writeFixture(tmpDir, 'mutable.json', JSON.stringify(updated));

        const updatedTrace = await Promise.race([
          updatedPromise,
          new Promise<null>((r) => setTimeout(() => r(null), 5000)),
        ]);

        expect(updatedTrace).not.toBeNull();
        if (updatedTrace) {
          expect(updatedTrace.id).toBe('updated-trace');
        }
      } finally {
        watcher.stop();
      }
    }, 10000);
  });

  describe('constructor options', () => {
    it('creates traces directory if it does not exist', () => {
      const nonExistent = path.join(tmpDir, 'new-dir', 'traces');
      const watcher = new TraceWatcher(nonExistent);
      try {
        expect(fs.existsSync(nonExistent)).toBe(true);
      } finally {
        watcher.stop();
      }
    });

    it('accepts TraceWatcherOptions with dataDirs', () => {
      const dataDir = path.join(tmpDir, 'data');
      fs.mkdirSync(dataDir, { recursive: true });
      writeFixture(dataDir, 'extra.json', JSON.stringify({ ...TRACE_JSON, id: 'extra' }));
      writeFixture(tmpDir, 'main.json', JSON.stringify({ ...TRACE_JSON, id: 'main' }));

      const watcher = new TraceWatcher({ tracesDir: tmpDir, dataDirs: [dataDir] });
      try {
        expect(watcher.getAllTraces().length).toBe(2);
        const ids = watcher.getAllTraces().map((t) => t.id);
        expect(ids).toContain('main');
        expect(ids).toContain('extra');
      } finally {
        watcher.stop();
      }
    });

    it('scans subdirectories recursively', () => {
      writeFixture(
        tmpDir,
        'level1/level2/deep.json',
        JSON.stringify({ ...TRACE_JSON, id: 'deep' }),
      );
      const watcher = new TraceWatcher(tmpDir);
      try {
        const traces = watcher.getAllTraces();
        expect(traces.length).toBe(1);
        expect(traces[0].id).toBe('deep');
      } finally {
        watcher.stop();
      }
    });
  });

  describe('getTrace', () => {
    it('finds trace by filename', () => {
      writeFixture(tmpDir, 'specific.json', JSON.stringify(TRACE_JSON));
      const watcher = new TraceWatcher(tmpDir);
      try {
        const trace = watcher.getTrace('specific.json');
        expect(trace).toBeDefined();
        expect(trace?.id).toBe('test-trace-1');
      } finally {
        watcher.stop();
      }
    });

    it('returns undefined for missing trace', () => {
      const watcher = new TraceWatcher(tmpDir);
      try {
        expect(watcher.getTrace('nope.json')).toBeUndefined();
      } finally {
        watcher.stop();
      }
    });
  });

  describe('getTraceStats', () => {
    it('returns correct statistics', () => {
      writeFixture(
        tmpDir,
        'a.json',
        JSON.stringify({ ...TRACE_JSON, id: '1', agentId: 'a', trigger: 'cron' }),
      );
      writeFixture(
        tmpDir,
        'b.json',
        JSON.stringify({ ...TRACE_JSON, id: '2', agentId: 'b', trigger: 'message' }),
      );
      writeFixture(
        tmpDir,
        'c.json',
        JSON.stringify({ ...TRACE_JSON, id: '3', agentId: 'a', trigger: 'cron' }),
      );

      const watcher = new TraceWatcher(tmpDir);
      try {
        const stats = watcher.getTraceStats();
        expect(stats.total).toBe(3);
        expect(stats.agentCount).toBe(2);
        expect(stats.triggers.cron).toBe(2);
        expect(stats.triggers.message).toBe(1);
      } finally {
        watcher.stop();
      }
    });
  });
});
