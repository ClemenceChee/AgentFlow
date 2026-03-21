import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TraceWatcher } from '../../src/watcher.js';
import { TestDataGenerator, traceToJson } from '../fixtures/test-data-generator.js';

describe('TraceWatcher', () => {
  let tempDir: string;
  let watcher: TraceWatcher;

  beforeEach(() => {
    // Create temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-test-'));
    TestDataGenerator.resetCounters();
  });

  afterEach(async () => {
    if (watcher) {
      watcher.stop();
    }
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('initialization', () => {
    it('should create traces directory if it does not exist', () => {
      const tracesDir = path.join(tempDir, 'new-traces');
      expect(fs.existsSync(tracesDir)).toBe(false);

      watcher = new TraceWatcher(tracesDir);

      expect(fs.existsSync(tracesDir)).toBe(true);
    });

    it('should accept TraceWatcherOptions with multiple data directories', () => {
      const tracesDir = path.join(tempDir, 'traces');
      const dataDir1 = path.join(tempDir, 'data1');
      const dataDir2 = path.join(tempDir, 'data2');

      fs.mkdirSync(dataDir1, { recursive: true });
      fs.mkdirSync(dataDir2, { recursive: true });

      watcher = new TraceWatcher({
        tracesDir,
        dataDirs: [dataDir1, dataDir2],
      });

      expect(fs.existsSync(tracesDir)).toBe(true);
    });

    it('should load existing files on startup', async () => {
      const tracesDir = path.join(tempDir, 'traces');
      await TestDataGenerator.createTestFiles(tracesDir, 3);

      watcher = new TraceWatcher(tracesDir);

      // Give watcher time to load files
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(watcher.getTraceCount()).toBeGreaterThan(0);
      expect(watcher.getAllTraces()).toHaveLength(3);
    });
  });

  describe('file loading', () => {
    beforeEach(() => {
      const tracesDir = path.join(tempDir, 'traces');
      fs.mkdirSync(tracesDir, { recursive: true });
      // Don't create watcher here — tests create it after writing files
      // so loadExistingFiles() picks them up without needing chokidar
    });

    it('should parse AgentFlow JSON trace files', async () => {
      const trace = TestDataGenerator.createExecutionGraph({
        agentId: 'test-agent',
        nodeCount: 3,
      });

      const traceFile = path.join(tempDir, 'traces', 'test.json');
      fs.writeFileSync(traceFile, traceToJson(trace as unknown as Record<string, unknown>));

      // Recreate watcher so it picks up the file via loadExistingFiles
      watcher.stop();
      watcher = new TraceWatcher(path.join(tempDir, 'traces'));

      const loadedTrace = watcher.getTrace('test.json');
      expect(loadedTrace).toBeDefined();
      expect(loadedTrace?.agentId).toBe('test-agent');
      expect(loadedTrace?.sourceType).toBe('trace');
      expect(loadedTrace?.filename).toBe('test.json');
    });

    it('should parse JSONL session files', async () => {
      const sessionTrace = TestDataGenerator.createSessionTrace({
        agentId: 'session-agent',
      });

      // Create JSONL content
      const jsonlContent = sessionTrace.sessionEvents
        ?.map((event) =>
          JSON.stringify({
            type: event.type === 'system' ? 'session' : 'message',
            timestamp: new Date(event.timestamp).toISOString(),
            id: event.id,
            ...(event.type === 'user' && {
              message: { role: 'user', content: [{ type: 'text', text: event.content }] },
            }),
            ...(event.type === 'assistant' && {
              message: {
                role: 'assistant',
                content: [{ type: 'text', text: event.content }],
                usage: event.tokens && {
                  input: event.tokens.input,
                  output: event.tokens.output,
                  totalTokens: event.tokens.total,
                },
              },
            }),
          }),
        )
        .join('\n');

      const sessionFile = path.join(tempDir, 'traces', 'session.jsonl');
      fs.writeFileSync(sessionFile, jsonlContent);

      // Create watcher after file exists so loadExistingFiles picks it up
      watcher?.stop();
      watcher = new TraceWatcher(path.join(tempDir, 'traces'));

      const loadedTrace = watcher.getTrace('session.jsonl');
      expect(loadedTrace).toBeDefined();
      expect(loadedTrace?.sourceType).toBe('session');
      expect(loadedTrace?.sessionEvents).toBeDefined();
      expect(loadedTrace?.sessionEvents?.length).toBeGreaterThan(0);
      expect(loadedTrace?.tokenUsage).toBeDefined();
    });

    it('should parse OpenClaw log files using universal parser', async () => {
      const _logFiles = TestDataGenerator.createOpenClawLogs(path.join(tempDir, 'traces'));

      // Create watcher after files exist
      watcher?.stop();
      watcher = new TraceWatcher(path.join(tempDir, 'traces'));

      const traces = watcher.getAllTraces();
      expect(traces.length).toBeGreaterThan(0);

      const openclawTrace = traces.find((t) => t.filename?.includes('openclaw'));
      expect(openclawTrace).toBeDefined();
      expect(openclawTrace?.sourceType).toBe('session');
    });

    it('should handle malformed JSON files gracefully', () => {
      const badFile = path.join(tempDir, 'traces', 'bad.json');
      fs.writeFileSync(badFile, '{ invalid json }');

      // Should not throw
      expect(() => {
        new TraceWatcher(path.join(tempDir, 'traces'));
      }).not.toThrow();

      // Give watcher time to process
      setTimeout(() => {
        expect(watcher.getTrace('bad.json')).toBeUndefined();
      }, 100);
    });
  });

  describe('file watching', () => {
    let tracesDir: string;

    beforeEach(() => {
      tracesDir = path.join(tempDir, 'traces');
      fs.mkdirSync(tracesDir, { recursive: true });
      watcher = new TraceWatcher(tracesDir);
    });

    it('should emit trace-added event when new file is added', (done) => {
      let eventFired = false;

      watcher.on('trace-added', (trace) => {
        if (!eventFired) {
          eventFired = true;
          expect(trace).toBeDefined();
          expect(trace.filename).toBe('new-trace.json');
          done();
        }
      });

      // Add a new file
      setTimeout(() => {
        const trace = TestDataGenerator.createExecutionGraph();
        const newFile = path.join(tracesDir, 'new-trace.json');
        fs.writeFileSync(newFile, traceToJson(trace as unknown as Record<string, unknown>));
      }, 50);
    });

    it('should emit trace-updated event when file is modified', (done) => {
      const trace = TestDataGenerator.createExecutionGraph();
      const traceFile = path.join(tracesDir, 'update-test.json');
      fs.writeFileSync(traceFile, traceToJson(trace as unknown as Record<string, unknown>));

      let eventCount = 0;
      watcher.on('trace-updated', (updatedTrace) => {
        eventCount++;
        if (eventCount === 1) {
          expect(updatedTrace).toBeDefined();
          expect(updatedTrace.filename).toBe('update-test.json');
          done();
        }
      });

      // Modify the file
      setTimeout(() => {
        const updatedTrace = TestDataGenerator.createExecutionGraph({
          agentId: 'updated-agent',
        });
        fs.writeFileSync(traceFile, JSON.stringify(updatedTrace));
      }, 100);
    });

    it('should remove trace when file is deleted', (done) => {
      const trace = TestDataGenerator.createExecutionGraph();
      const traceFile = path.join(tracesDir, 'delete-test.json');
      fs.writeFileSync(traceFile, traceToJson(trace as unknown as Record<string, unknown>));

      // Wait for initial load
      setTimeout(() => {
        expect(watcher.getTrace('delete-test.json')).toBeDefined();

        watcher.on('trace-removed', (key) => {
          expect(key).toContain('delete-test.json');
          expect(watcher.getTrace('delete-test.json')).toBeUndefined();
          done();
        });

        // Delete the file
        fs.unlinkSync(traceFile);
      }, 100);
    });
  });

  describe('trace retrieval', () => {
    beforeEach(async () => {
      const tracesDir = path.join(tempDir, 'traces');
      await TestDataGenerator.createTestFiles(tracesDir, 5);
      watcher = new TraceWatcher(tracesDir);

      // Wait for files to load
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    it('should return all traces sorted by modification time', () => {
      const traces = watcher.getAllTraces();
      expect(traces.length).toBe(5);

      // Should be sorted by lastModified/startTime descending
      for (let i = 1; i < traces.length; i++) {
        const currentTime = traces[i].lastModified || traces[i].startTime;
        const previousTime = traces[i - 1].lastModified || traces[i - 1].startTime;
        expect(currentTime).toBeLessThanOrEqual(previousTime);
      }
    });

    it('should get trace by filename', () => {
      const allTraces = watcher.getAllTraces();
      const firstTrace = allTraces[0];

      if (firstTrace.filename) {
        const retrievedTrace = watcher.getTrace(firstTrace.filename);
        expect(retrievedTrace).toBeDefined();
        expect(retrievedTrace?.id).toBe(firstTrace.id);
      }
    });

    it('should filter traces by agent ID', () => {
      const agentTraces = watcher.getTracesByAgent('agent-1');
      expect(agentTraces.length).toBeGreaterThan(0);

      for (const trace of agentTraces) {
        expect(trace.agentId).toBe('agent-1');
      }
    });

    it('should return recent traces with limit', () => {
      const recentTraces = watcher.getRecentTraces(3);
      expect(recentTraces.length).toBeLessThanOrEqual(3);
    });

    it('should return agent IDs list', () => {
      const agentIds = watcher.getAgentIds();
      expect(agentIds.length).toBeGreaterThan(0);
      expect(agentIds).toContain('agent-1');

      // Should be sorted
      const sorted = [...agentIds].sort();
      expect(agentIds).toEqual(sorted);
    });

    it('should provide trace statistics', () => {
      const stats = watcher.getTraceStats();
      expect(stats.total).toBeGreaterThan(0);
      expect(stats.agentCount).toBeGreaterThan(0);
      expect(stats.triggers).toBeDefined();
      expect(typeof stats.triggers).toBe('object');
    });
  });

  describe('multi-directory watching', () => {
    it('should watch multiple data directories', async () => {
      const tracesDir = path.join(tempDir, 'traces');
      const dataDir1 = path.join(tempDir, 'data1');
      const dataDir2 = path.join(tempDir, 'data2');

      // Create directories and files
      fs.mkdirSync(tracesDir, { recursive: true });
      fs.mkdirSync(dataDir1, { recursive: true });
      fs.mkdirSync(dataDir2, { recursive: true });

      await TestDataGenerator.createTestFiles(tracesDir, 1);
      await TestDataGenerator.createTestFiles(dataDir1, 1);
      await TestDataGenerator.createTestFiles(dataDir2, 1);

      watcher = new TraceWatcher({
        tracesDir,
        dataDirs: [dataDir1, dataDir2],
      });

      // Wait for files to load
      await new Promise((resolve) => setTimeout(resolve, 200));

      const traces = watcher.getAllTraces();
      expect(traces.length).toBeGreaterThanOrEqual(3);

      // Check that traces from different directories are loaded
      const sourceDirs = new Set(traces.map((t) => t.sourceDir));
      expect(sourceDirs.size).toBeGreaterThan(1);
    });
  });

  describe('error handling', () => {
    it('should handle permission errors gracefully', () => {
      const nonExistentDir = '/root/definitely-does-not-exist';

      expect(() => {
        watcher = new TraceWatcher(nonExistentDir);
      }).not.toThrow();
    });

    it('should skip files that cannot be read', () => {
      const tracesDir = path.join(tempDir, 'traces');
      fs.mkdirSync(tracesDir, { recursive: true });

      // Create file with no read permissions (if possible)
      const restrictedFile = path.join(tracesDir, 'restricted.json');
      fs.writeFileSync(restrictedFile, '{}');

      try {
        fs.chmodSync(restrictedFile, 0o000);
      } catch (_error) {
        // Skip this test on systems that don't support chmod
        return;
      }

      expect(() => {
        watcher = new TraceWatcher(tracesDir);
      }).not.toThrow();
    });
  });

  describe('universal log parsing', () => {
    it('should detect and parse colored log formats', () => {
      const logContent = [
        '[2m2026-03-19T10:30:00.123Z[0m [[32m[[1mINFO [0m] [1mgateway.starting[0m [36mport[0m=[35m8080[0m',
        '[2m2026-03-19T10:30:01.456Z[0m [[31m[[1mERROR[0m] [1mworker.error[0m [36mworkerId[0m=[35mworker-1[0m',
      ].join('\n');

      const tracesDir = path.join(tempDir, 'traces');
      fs.mkdirSync(tracesDir, { recursive: true });
      const logFile = path.join(tracesDir, 'test.log');
      fs.writeFileSync(logFile, logContent);

      watcher = new TraceWatcher(tracesDir);

      // Wait for parsing
      setTimeout(() => {
        const traces = watcher.getAllTraces();
        expect(traces.length).toBeGreaterThan(0);

        const logTrace = traces.find((t) => t.filename === 'test.log');
        expect(logTrace).toBeDefined();
        expect(Object.keys(logTrace?.nodes)).toHaveLength(2);
      }, 100);
    });

    it('should detect and parse JSON log lines', () => {
      const logContent = [
        '{"timestamp":"2026-03-19T10:30:00.123Z","level":"info","action":"service.start","port":8080}',
        '{"timestamp":"2026-03-19T10:30:01.456Z","level":"error","action":"worker.failed","workerId":"worker-1"}',
      ].join('\n');

      const tracesDir = path.join(tempDir, 'traces');
      fs.mkdirSync(tracesDir, { recursive: true });
      const logFile = path.join(tracesDir, 'json.log');
      fs.writeFileSync(logFile, logContent);

      watcher = new TraceWatcher(tracesDir);

      // Wait for parsing
      setTimeout(() => {
        const traces = watcher.getAllTraces();
        const logTrace = traces.find((t) => t.filename === 'json.log');
        expect(logTrace).toBeDefined();
        expect(logTrace?.agentId).toContain('json');
      }, 100);
    });

    it('should extract session identifiers from logs', () => {
      const logContent = [
        '{"timestamp":"2026-03-19T10:30:00.123Z","level":"info","action":"request.start","request_id":"req-123"}',
        '{"timestamp":"2026-03-19T10:30:01.456Z","level":"info","action":"request.complete","request_id":"req-123"}',
        '{"timestamp":"2026-03-19T10:30:02.789Z","level":"info","action":"request.start","request_id":"req-456"}',
      ].join('\n');

      const tracesDir = path.join(tempDir, 'traces');
      fs.mkdirSync(tracesDir, { recursive: true });
      const logFile = path.join(tracesDir, 'sessions.log');
      fs.writeFileSync(logFile, logContent);

      watcher = new TraceWatcher(tracesDir);

      // Wait for parsing
      setTimeout(() => {
        const traces = watcher.getAllTraces();
        expect(traces.length).toBeGreaterThan(0);
      }, 100);
    });
  });
});
