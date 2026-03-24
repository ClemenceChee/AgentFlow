/**
 * Harvester — ingestion worker.
 *
 * Ingests events from AgentFlow and external signals into the vault.
 * Creates/updates agent entities, execution entities, and links them.
 *
 * @module
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { ExecutionEvent, PatternEvent } from 'agentflow-core';
import type { GraphLike } from './decision-extractor.js';
import {
  decisionsToEntities,
  extractDecisionsFromGraph,
  isExecutionGraph,
} from './decision-extractor.js';
import { writeToLayer } from './layers.js';
import {
  computePatternSignature,
  extractDecisionsFromNodes,
} from './ops-intel/decision-extraction.js';
import type { NormalizedDecision } from './ops-intel/types.js';
import type { Entity, HarvesterConfig, Vault } from './types.js';
import { vaultEntityCount } from './vault.js';

const DEFAULT_STATE_FILE = '.soma/harvester-state.json';

// ---------------------------------------------------------------------------
// Pluggable inbox parsers
// ---------------------------------------------------------------------------

/**
 * An inbox parser takes file content and returns either events to ingest
 * or entity partials to create directly in the vault.
 */
export interface InboxParseResult {
  events?: (ExecutionEvent | PatternEvent)[];
  entities?: (Partial<Entity> & { type: string; name: string })[];
}

export type InboxParser = (content: string, fileName: string) => InboxParseResult;

/** JSON parser — handles `.json` files (single event or array of events). */
const jsonParser: InboxParser = (content) => {
  const data = JSON.parse(content);
  const events = Array.isArray(data) ? data : [data];
  return { events };
};

/** JSONL parser — handles `.jsonl` files (one event per line). */
const jsonlParser: InboxParser = (content) => {
  const events = content
    .trim()
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
  return { events };
};

/** Markdown parser — handles `.md` files (creates note entities). */
const markdownParser: InboxParser = (content, fileName) => {
  return {
    entities: [
      {
        type: 'note' as any,
        name: basename(fileName, '.md'),
        body: content,
        tags: ['inbox'],
      },
    ],
  };
};

/** Default parser registry keyed by file extension. */
const DEFAULT_PARSERS: Record<string, InboxParser> = {
  '.json': jsonParser,
  '.jsonl': jsonlParser,
  '.md': markdownParser,
};

interface HarvesterState {
  processedEventIds: Set<string>;
  lastProcessedTimestamp: number;
  entityCount?: number;
}

/**
 * Create a Harvester worker.
 *
 * @param vault - The vault to write entities to.
 * @param config - Optional configuration.
 */
export function createHarvester(vault: Vault, config?: HarvesterConfig) {
  void config?.concurrency; // Reserved for future concurrent processing
  const stateFile = config?.stateFile ?? DEFAULT_STATE_FILE;
  const parsers: Record<string, InboxParser> = { ...DEFAULT_PARSERS, ...config?.parsers };

  // Load state with entity count check
  let state: HarvesterState = { processedEventIds: new Set(), lastProcessedTimestamp: 0 };
  try {
    if (existsSync(stateFile)) {
      const raw = JSON.parse(readFileSync(stateFile, 'utf-8'));
      const currentCount = vaultEntityCount(vault.baseDir);
      if (raw.entityCount == null && raw.vaultFingerprint) {
        // Migrate from old vaultFingerprint format
        console.log('[Harvester] Migrating state from vaultFingerprint to entityCount');
        state = {
          processedEventIds: new Set(),
          lastProcessedTimestamp: 0,
          entityCount: currentCount,
        };
      } else if (raw.entityCount != null && currentCount < raw.entityCount) {
        console.log(
          `[Harvester] Vault entity count decreased (${raw.entityCount} → ${currentCount}) — resetting state`,
        );
        state = {
          processedEventIds: new Set(),
          lastProcessedTimestamp: 0,
          entityCount: currentCount,
        };
      } else {
        state = {
          processedEventIds: new Set(raw.processedEventIds ?? []),
          lastProcessedTimestamp: raw.lastProcessedTimestamp ?? 0,
          entityCount: currentCount,
        };
      }
    }
  } catch {
    /* fresh state */
  }

  function saveState(): void {
    const dir = join(stateFile, '..');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const raw = {
      processedEventIds: [...state.processedEventIds].slice(-10000), // Keep last 10K
      lastProcessedTimestamp: state.lastProcessedTimestamp,
      entityCount: state.entityCount ?? vaultEntityCount(vault.baseDir),
    };
    writeFileSync(stateFile, JSON.stringify(raw, null, 2), 'utf-8');
  }

  function eventId(event: ExecutionEvent | PatternEvent): string {
    return `${event.agentId}-${event.timestamp}`;
  }

  function normalizeId(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function ensureAgentEntity(agentId: string): void {
    const id = normalizeId(agentId);
    const existing = vault.read('agent', id);
    if (!existing) {
      writeToLayer(vault, 'harvester', 'archive', {
        type: 'agent',
        id,
        name: agentId,
        agentId,
        status: 'active',
        tags: ['agent-layer'],
      } as Partial<Entity> & { type: string; name: string });
    }
  }

  /** Check for duplicate trace by trace_id in vault. */
  function isDuplicateTrace(traceId: string): boolean {
    if (state.processedEventIds.has(traceId)) return true;
    // Also check vault for trace_id field
    const existing = vault.list('execution', { limit: 5000 });
    return existing.some((e) => (e as Record<string, unknown>).trace_id === traceId);
  }

  function createExecutionEntity(event: ExecutionEvent, decisions?: NormalizedDecision[]): void {
    const agentNormId = normalizeId(event.agentId);
    const execId = `exec-${event.agentId}-${event.timestamp}`;
    const traceId = `${event.agentId}-${event.timestamp}`;

    // Duplicate trace detection by trace_id
    if (isDuplicateTrace(traceId)) {
      console.log(`[Harvester] Duplicate trace skipped: ${traceId}`);
      return;
    }

    // Detect AICP trace annotation and create guard_check decision
    const eventData = event as unknown as Record<string, unknown>;
    const metadata = eventData.metadata as Record<string, unknown> | undefined;
    const aicp = metadata?.aicp as
      | {
          consulted?: boolean;
          proceed?: boolean;
          warnings?: number;
          recommendations?: number;
          timestamp?: number;
        }
      | undefined;
    const allDecisions = decisions ? [...decisions] : [];
    if (aicp?.consulted) {
      allDecisions.push({
        action: 'aicp-preflight',
        outcome: aicp.proceed ? 'ok' : 'failed',
        reasoning: `AICP: ${aicp.warnings ?? 0} warnings, ${aicp.recommendations ?? 0} recommendations`,
        index: allDecisions.length,
      } as NormalizedDecision);
    }

    // Compute decision pattern if decisions available
    const decisionPattern =
      allDecisions.length > 0 ? computePatternSignature(allDecisions) : undefined;

    // Write to L1 via layer-enforced path
    writeToLayer(vault, 'harvester', 'archive', {
      type: 'execution',
      id: normalizeId(execId),
      name: `${event.agentId} execution at ${new Date(event.timestamp).toISOString()}`,
      agentId: event.agentId,
      agent_id: event.agentId,
      trace_id: traceId,
      source_system: 'agentflow',
      status:
        event.status === 'completed'
          ? 'completed'
          : event.status === 'failed'
            ? 'failed'
            : 'running',
      duration: event.duration,
      nodeCount: event.nodeCount,
      variant: event.pathSignature,
      conformanceScore: event.processContext?.conformanceScore,
      trigger: 'event',
      decisions: allDecisions.length > 0 ? allDecisions : undefined,
      decisionPattern,
      tags: ['agent-layer', event.agentId],
      related: [`agent/${agentNormId}`],
      body: `Execution of ${event.agentId}. Duration: ${event.duration}ms. Nodes: ${event.nodeCount}. Status: ${event.status}.`,
    } as Partial<Entity> & { type: string; name: string });

    // Add back-reference from agent to execution
    const agent = vault.read('agent', agentNormId);
    if (agent) {
      const execRef = `execution/${normalizeId(execId)}`;
      if (!agent.related.includes(execRef)) {
        const updatedRelated = [...agent.related, execRef].slice(-50); // Keep last 50
        vault.update(agentNormId, { related: updatedRelated });
      }
    }
  }

  function updateAgentProfile(event: ExecutionEvent): void {
    const id = normalizeId(event.agentId);
    const agent = vault.read('agent', id);
    if (!agent) return;

    const totalExec = (((agent as Record<string, unknown>).totalExecutions as number) ?? 0) + 1;
    const failCount = ((agent as Record<string, unknown>).failureCount as number) ?? 0;
    const newFails = event.eventType === 'execution.failed' ? failCount + 1 : failCount;

    vault.update(id, {
      totalExecutions: totalExec,
      failureCount: newFails,
      failureRate: totalExec > 0 ? newFails / totalExec : 0,
    } as Partial<Entity>);
  }

  return {
    /**
     * Ingest execution and pattern events from AgentFlow.
     * Returns the number of events ingested (skipping already-processed).
     */
    async ingest(events: (ExecutionEvent | PatternEvent)[]): Promise<number> {
      let ingested = 0;

      for (const event of events) {
        const eid = eventId(event);
        if (state.processedEventIds.has(eid)) continue;

        ensureAgentEntity(event.agentId);

        if (event.eventType === 'execution.completed' || event.eventType === 'execution.failed') {
          createExecutionEntity(event as ExecutionEvent);
          updateAgentProfile(event as ExecutionEvent);
        }
        // Pattern events update agent with bottleneck info
        if (event.eventType === 'pattern.discovered' || event.eventType === 'pattern.updated') {
          // Future: create archetype entities from patterns
        }

        state.processedEventIds.add(eid);
        state.lastProcessedTimestamp = Math.max(state.lastProcessedTimestamp, event.timestamp);
        ingested++;
      }

      if (ingested > 0) saveState();
      return ingested;
    },

    /**
     * Process files from an inbox directory.
     * Each file is parsed, entities created, then moved to processed/.
     */
    async processInbox(inboxDir: string): Promise<number> {
      if (!existsSync(inboxDir)) return 0;

      const processedDir = join(inboxDir, '..', 'processed');
      const errorsDir = join(inboxDir, '..', 'errors');
      if (!existsSync(processedDir)) mkdirSync(processedDir, { recursive: true });
      if (!existsSync(errorsDir)) mkdirSync(errorsDir, { recursive: true });

      const supportedExts = Object.keys(parsers);
      const files = readdirSync(inboxDir).filter((f) => supportedExts.includes(extname(f)));
      let processed = 0;

      for (const file of files) {
        const filePath = join(inboxDir, file);
        try {
          const content = readFileSync(filePath, 'utf-8');
          const ext = extname(file);
          const parser = parsers[ext];
          if (!parser) continue;

          const result = parser(content, file);

          if (result.events?.length) {
            // Detect full ExecutionGraph objects among events
            for (const event of result.events) {
              if (isExecutionGraph(event)) {
                await this.ingestGraph(event as unknown as GraphLike);
              }
            }
            // Ingest normal events
            await this.ingest(result.events.filter((e) => !isExecutionGraph(e)));
          }
          if (result.entities?.length) {
            for (const entity of result.entities) {
              writeToLayer(
                vault,
                'harvester',
                'archive',
                entity as Partial<Entity> & { type: string; name: string },
              );
            }
          }

          // Move to processed
          renameSync(filePath, join(processedDir, file));
          processed++;
        } catch (err) {
          // Move to errors
          try {
            renameSync(filePath, join(errorsDir, file));
          } catch (moveErr) {
            console.warn(
              `[Harvester] Failed to move ${file} to errors dir:`,
              (moveErr as Error).message,
            );
          }
          console.error(`Harvester error processing ${file}:`, err);
        }
      }

      return processed;
    },

    /**
     * Ingest a full ExecutionGraph, extracting decisions and writing them
     * to L1 with stable trace_id (decision-graphId-nodeId).
     * Returns the number of decision entities created.
     */
    async ingestGraph(graph: GraphLike): Promise<number> {
      // Extract NormalizedDecisions from graph nodes (for execution entity enrichment)
      const graphNodes = graph.nodes as Record<
        string,
        {
          id: string;
          type: string;
          name: string;
          status: string;
          startTime: number;
          endTime: number | null;
          metadata?: Record<string, unknown>;
          state?: Record<string, unknown>;
        }
      >;
      const normalizedDecisions = extractDecisionsFromNodes(graphNodes);
      const pattern =
        normalizedDecisions.length > 0 ? computePatternSignature(normalizedDecisions) : undefined;

      // Also create execution entity with decisions if graph has agentId
      if (graph.agentId && normalizedDecisions.length > 0) {
        const execTraceId = `exec-${graph.agentId}-${Date.now()}`;
        if (!isDuplicateTrace(execTraceId)) {
          try {
            writeToLayer(vault, 'harvester', 'archive', {
              type: 'execution',
              id: normalizeId(execTraceId),
              name: `${graph.agentId} execution`,
              agentId: graph.agentId,
              agent_id: graph.agentId,
              trace_id: execTraceId,
              source_system: 'agentflow-graph',
              status: (graph.status as string) ?? 'completed',
              decisions: normalizedDecisions,
              decisionPattern: pattern,
              tags: ['agent-layer', graph.agentId],
              related: [],
              body: '',
            } as Partial<Entity> & { type: string; name: string });
            state.processedEventIds.add(execTraceId);
          } catch {
            /* skip if exists */
          }
        }
      }

      // Extract decision entities from graph (existing behavior)
      const decisions = extractDecisionsFromGraph(graph);
      if (decisions.length === 0) return normalizedDecisions.length > 0 ? 1 : 0;

      const entities = decisionsToEntities(decisions);
      let created = 0;

      for (const entity of entities) {
        const traceId = `decision-${(entity as Record<string, unknown>).graph_id}-${entity.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;

        // Dedup by stable trace_id
        if (isDuplicateTrace(traceId)) continue;

        try {
          writeToLayer(vault, 'harvester', 'archive', {
            ...entity,
            trace_id: traceId,
            source_system: 'agentflow-graph',
          } as Partial<Entity> & { type: string; name: string });
          state.processedEventIds.add(traceId);
          created++;
        } catch {
          // Skip failed writes
        }
      }

      if (created > 0) saveState();
      return created;
    },

    /** Get current state for debugging. */
    getState() {
      return {
        processedCount: state.processedEventIds.size,
        lastTimestamp: state.lastProcessedTimestamp,
      };
    },
  };
}
