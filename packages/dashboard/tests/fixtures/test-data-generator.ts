import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ExecutionGraph, ExecutionNode } from 'agentflow-core';
import type { SessionEvent, WatchedTrace } from '../../src/watcher.js';

export interface TestDataOptions {
  agentId?: string;
  nodeCount?: number;
  failureRate?: number;
  includeTimings?: boolean;
  trigger?: string;
  provider?: string;
  model?: string;
}

/**
 * Generate realistic AgentFlow trace data for testing
 */
export class TestDataGenerator {
  private static nodeIdCounter = 1;
  private static sessionIdCounter = 1;

  static resetCounters(): void {
    TestDataGenerator.nodeIdCounter = 1;
    TestDataGenerator.sessionIdCounter = 1;
  }

  /**
   * Create a realistic ExecutionGraph for testing
   */
  static createExecutionGraph(options: TestDataOptions = {}): ExecutionGraph {
    const {
      agentId = 'test-agent',
      nodeCount = 5,
      failureRate = 0.1,
      includeTimings = true,
      trigger = 'test',
    } = options;

    const startTime = Date.now() - nodeCount * 1000 + TestDataGenerator.sessionIdCounter * 100;
    const nodes = new Map<string, ExecutionNode>();

    // Create root node
    const rootId = `node-${TestDataGenerator.nodeIdCounter++}`;
    nodes.set(rootId, {
      id: rootId,
      type: 'agent',
      name: `${agentId}-execution`,
      status: 'completed',
      startTime,
      endTime: startTime + nodeCount * 1000,
      parentId: undefined,
      children: [],
      metadata: { trigger, agentId },
    });

    // Create child nodes
    const childIds: string[] = [];
    for (let i = 1; i < nodeCount; i++) {
      const nodeId = `node-${TestDataGenerator.nodeIdCounter++}`;
      const nodeStartTime = startTime + i * 800;
      const nodeEndTime = nodeStartTime + Math.random() * 1000;
      const shouldFail = Math.random() < failureRate;

      const nodeTypes = ['tool', 'decision', 'action', 'validation'];
      const nodeType = nodeTypes[Math.floor(Math.random() * nodeTypes.length)];

      nodes.set(nodeId, {
        id: nodeId,
        type: nodeType,
        name: `${nodeType}-${i}`,
        status: shouldFail ? 'failed' : 'completed',
        startTime: includeTimings ? nodeStartTime : startTime,
        endTime: includeTimings ? nodeEndTime : startTime + 1,
        parentId: rootId,
        children: [],
        metadata: {
          toolName: nodeType === 'tool' ? `tool-${i}` : undefined,
          error: shouldFail ? `Mock error in node ${nodeId}` : undefined,
        },
      });

      childIds.push(nodeId);
    }

    // Update root node children
    const rootNode = nodes.get(rootId)!;
    rootNode.children = childIds;

    return {
      id: `trace-${Date.now()}`,
      rootNodeId: rootId,
      nodes,
      edges: childIds.map((childId) => ({ from: rootId, to: childId })),
      startTime,
      endTime: Math.max(...Array.from(nodes.values()).map((n) => n.endTime || n.startTime)),
      status: Array.from(nodes.values()).some((n) => n.status === 'failed')
        ? 'failed'
        : 'completed',
      trigger,
      agentId,
      events: [],
      metadata: { generated: true, nodeCount },
    };
  }

  /**
   * Create a WatchedTrace with file metadata
   */
  static createWatchedTrace(options: TestDataOptions = {}): WatchedTrace {
    const graph = TestDataGenerator.createExecutionGraph(options);
    const seqId = TestDataGenerator.sessionIdCounter++;
    const filename = `trace-${Date.now()}-${seqId}-${options.agentId || 'test'}.json`;

    return {
      ...graph,
      filename,
      lastModified: Date.now(),
      sourceType: 'trace',
      sourceDir: '/tmp/test-traces',
    };
  }

  /**
   * Create JSONL session events for testing rich timeline rendering
   */
  static createSessionEvents(eventCount: number = 10): SessionEvent[] {
    const events: SessionEvent[] = [];
    let timestamp = Date.now() - eventCount * 5000;

    // Session start
    events.push({
      type: 'system',
      timestamp,
      name: 'Session Started',
      content: 'Version: test, CWD: /tmp/test',
      id: `session-${TestDataGenerator.sessionIdCounter}`,
    });

    // Model change
    timestamp += 100;
    events.push({
      type: 'model_change',
      timestamp,
      name: 'Model Change',
      model: 'claude-3-sonnet',
      provider: 'anthropic',
      content: 'anthropic/claude-3-sonnet',
      id: `model-${TestDataGenerator.sessionIdCounter}`,
    });

    // User message
    timestamp += 1000;
    events.push({
      type: 'user',
      timestamp,
      name: 'User Message',
      content: 'Please analyze this data and provide insights.',
      id: `user-${TestDataGenerator.sessionIdCounter}`,
    });

    // Thinking
    timestamp += 500;
    events.push({
      type: 'thinking',
      timestamp,
      name: 'Thinking',
      content: 'I need to process this request step by step...',
      id: `thinking-${TestDataGenerator.sessionIdCounter}`,
    });

    // Tool calls and results
    for (let i = 0; i < Math.min(3, eventCount - 5); i++) {
      timestamp += 1000;

      // Tool call
      events.push({
        type: 'tool_call',
        timestamp,
        name: `tool-${i + 1}`,
        toolName: `analysis_tool_${i + 1}`,
        toolArgs: { input: `test data ${i + 1}`, options: { verbose: true } },
        id: `tool-call-${TestDataGenerator.sessionIdCounter}-${i}`,
        duration: 2000,
      });

      // Tool result
      timestamp += 2000;
      events.push({
        type: 'tool_result',
        timestamp,
        name: 'Tool Result',
        toolResult: `Analysis complete for dataset ${i + 1}. Found ${Math.floor(Math.random() * 100)} patterns.`,
        id: `tool-result-${TestDataGenerator.sessionIdCounter}-${i}`,
        parentId: `tool-call-${TestDataGenerator.sessionIdCounter}-${i}`,
      });
    }

    // Assistant response
    timestamp += 1000;
    events.push({
      type: 'assistant',
      timestamp,
      name: 'Assistant',
      content: 'Based on my analysis, I found several interesting patterns in your data...',
      id: `assistant-${TestDataGenerator.sessionIdCounter}`,
      tokens: { input: 150, output: 300, total: 450, cost: 0.012 },
      model: 'claude-3-sonnet',
      provider: 'anthropic',
    });

    TestDataGenerator.sessionIdCounter++;
    return events;
  }

  /**
   * Create a WatchedTrace from JSONL session data
   */
  static createSessionTrace(options: TestDataOptions = {}): WatchedTrace {
    const {
      agentId = 'test-session-agent',
      provider = 'anthropic',
      model = 'claude-3-sonnet',
    } = options;

    const sessionId = `session-${TestDataGenerator.sessionIdCounter++}`;
    const sessionEvents = TestDataGenerator.createSessionEvents();
    const startTime = sessionEvents[0]?.timestamp || Date.now();
    const endTime = sessionEvents[sessionEvents.length - 1]?.timestamp || Date.now();

    // Create nodes from session events
    const nodes = new Map<string, ExecutionNode>();
    const rootId = `session-${sessionId.slice(-8)}`;

    nodes.set(rootId, {
      id: rootId,
      type: 'agent',
      name: 'Session Analysis',
      status: 'completed',
      startTime,
      endTime,
      parentId: undefined,
      children: [],
      metadata: {
        sessionId,
        provider,
        model,
        totalTokens: 450,
        inputTokens: 150,
        outputTokens: 300,
        cost: 0.012,
      },
    });

    // Add tool nodes
    const toolEvents = sessionEvents.filter((e) => e.type === 'tool_call');
    const toolIds: string[] = [];

    toolEvents.forEach((toolEvent, index) => {
      const toolId = `tool-${index + 1}`;
      const resultEvent = sessionEvents.find(
        (e) => e.type === 'tool_result' && e.parentId === toolEvent.id,
      );

      nodes.set(toolId, {
        id: toolId,
        type: 'tool',
        name: toolEvent.toolName || `tool-${index + 1}`,
        status: resultEvent?.toolError ? 'failed' : 'completed',
        startTime: toolEvent.timestamp,
        endTime: resultEvent?.timestamp || toolEvent.timestamp + (toolEvent.duration || 1000),
        parentId: rootId,
        children: [],
        metadata: {
          toolCallId: toolEvent.id,
          args: toolEvent.toolArgs,
          result: resultEvent?.toolResult,
          error: resultEvent?.toolError,
        },
      });

      toolIds.push(toolId);
    });

    // Update root children
    nodes.get(rootId)!.children = toolIds;

    return {
      id: sessionId,
      rootNodeId: rootId,
      nodes,
      edges: toolIds.map((toolId) => ({ from: rootId, to: toolId })),
      startTime,
      endTime,
      status: toolEvents.some(
        (e) =>
          sessionEvents.find((r) => r.type === 'tool_result' && r.parentId === e.id)?.toolError,
      )
        ? 'failed'
        : 'completed',
      trigger: 'session',
      agentId,
      events: [],
      metadata: { provider, model, sessionVersion: 'test' },
      filename: `${sessionId}.jsonl`,
      lastModified: Date.now(),
      sourceType: 'session',
      sourceDir: '/tmp/test-sessions',
      sessionEvents,
      tokenUsage: { input: 150, output: 300, total: 450, cost: 0.012 },
    };
  }

  /**
   * Create test files in a directory
   */
  static async createTestFiles(targetDir: string, count: number = 5): Promise<string[]> {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const filePaths: string[] = [];

    for (let i = 0; i < count; i++) {
      const shouldBeSession = i % 3 === 0;

      if (shouldBeSession) {
        // Create JSONL session file
        const sessionTrace = TestDataGenerator.createSessionTrace({
          agentId: `agent-${i}`,
        });

        const sessionFile = path.join(targetDir, `session-${i}.jsonl`);
        const jsonlContent = sessionTrace.sessionEvents
          ?.map((event) =>
            JSON.stringify({
              type:
                event.type === 'system'
                  ? 'session'
                  : event.type === 'model_change'
                    ? 'model_change'
                    : event.type === 'tool_call' || event.type === 'tool_result'
                      ? 'message'
                      : 'message',
              timestamp: new Date(event.timestamp).toISOString(),
              id: event.id,
              parentId: event.parentId,
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
                    cost: { total: event.tokens.cost },
                  },
                },
              }),
              ...(event.type === 'tool_call' && {
                message: {
                  role: 'assistant',
                  content: [
                    {
                      type: 'toolCall',
                      id: event.id,
                      name: event.toolName,
                      arguments: event.toolArgs,
                    },
                  ],
                },
              }),
              ...(event.type === 'tool_result' && {
                message: {
                  role: 'toolResult',
                  content: [
                    {
                      type: 'text',
                      text: event.toolResult,
                      toolCallId: event.parentId,
                      isError: !!event.toolError,
                    },
                  ],
                },
              }),
            }),
          )
          .join('\n');

        fs.writeFileSync(sessionFile, jsonlContent);
        filePaths.push(sessionFile);
      } else {
        // Create AgentFlow JSON trace file
        const trace = TestDataGenerator.createExecutionGraph({
          agentId: `agent-${i}`,
          nodeCount: Math.floor(Math.random() * 8) + 2,
          failureRate: Math.random() < 0.2 ? 0.3 : 0.0,
        });

        const traceFile = path.join(targetDir, `trace-${i}.json`);
        fs.writeFileSync(traceFile, JSON.stringify(trace, null, 2));
        filePaths.push(traceFile);
      }
    }

    return filePaths;
  }

  /**
   * Create OpenClaw-style log files for universal parsing tests
   */
  static createOpenClawLogs(targetDir: string): string[] {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const logFile = path.join(targetDir, 'openclaw.log');
    const logContent = [
      '[2m2026-03-19T10:30:00.123Z[0m [[32m[[1mINFO [0m] [1mgateway.starting[0m [36mport[0m=[35m8080[0m [36mversion[0m=[35m1.2.3[0m',
      '[2m2026-03-19T10:30:01.456Z[0m [[32m[[1mINFO [0m] [1mworker.spawn[0m [36mworkerId[0m=[35mworker-1[0m [36mpid[0m=[35m12345[0m',
      '[2m2026-03-19T10:30:02.789Z[0m [[32m[[1mINFO [0m] [1mrequest.incoming[0m [36mmethod[0m=[35mPOST[0m [36murl[0m=[35m/api/invoke[0m [36mrequestId[0m=[35mreq-abc123[0m',
      '[2m2026-03-19T10:30:03.012Z[0m [[31m[[1mERROR[0m] [1mworker.error[0m [36mworkerId[0m=[35mworker-1[0m [36merror[0m=[35m"Connection timeout"[0m [36mrequestId[0m=[35mreq-abc123[0m',
      '[2m2026-03-19T10:30:04.345Z[0m [[32m[[1mINFO [0m] [1mworker.completed[0m [36mworkerId[0m=[35mworker-2[0m [36mduration[0m=[35m1234[0m [36mrequestId[0m=[35mreq-def456[0m',
    ].join('\n');

    fs.writeFileSync(logFile, logContent);

    // Create Alfred-style systemd logs
    const alfredFile = path.join(targetDir, 'alfred-daemon.log');
    const alfredContent = [
      '2026-03-19T10:25:00.000Z INFO: daemon.starting pid=9876 version=2.1.0',
      '2026-03-19T10:25:01.100Z INFO: orchestrator.spawn pid=9877 workers=4',
      '2026-03-19T10:25:02.200Z INFO: worker.ready workerId=worker-1 pid=9878',
      '2026-03-19T10:25:03.300Z INFO: sweep.started sweepId=sweep-123 trigger=cron',
      '2026-03-19T10:25:04.400Z WARN: worker.timeout workerId=worker-2 pid=9879 duration=30000',
      '2026-03-19T10:25:05.500Z INFO: sweep.completed sweepId=sweep-123 duration=2100 success=true',
    ].join('\n');

    fs.writeFileSync(alfredFile, alfredContent);

    return [logFile, alfredFile];
  }

  /**
   * Create large dataset for performance testing
   */
  static createLargeDataset(targetDir: string, traceCount: number = 1000): Promise<void> {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const promises: Promise<void>[] = [];

    for (let i = 0; i < traceCount; i++) {
      const promise = new Promise<void>((resolve) => {
        setImmediate(() => {
          const trace = TestDataGenerator.createExecutionGraph({
            agentId: `perf-agent-${i % 50}`, // 50 different agents
            nodeCount: Math.floor(Math.random() * 20) + 5, // 5-25 nodes
            failureRate: Math.random() < 0.1 ? 0.2 : 0.0, // 10% chance of failures
          });

          const filePath = path.join(targetDir, `perf-trace-${i}.json`);
          fs.writeFileSync(filePath, JSON.stringify(trace));
          resolve();
        });
      });

      promises.push(promise);
    }

    return Promise.all(promises).then(() => {});
  }
}
