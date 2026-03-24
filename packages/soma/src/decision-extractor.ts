/**
 * Decision extractor — infers agent decisions from ExecutionGraph structure.
 *
 * Extracts tool choices, branch decisions, retry patterns, delegations,
 * and failure paths from graph nodes and edges without requiring
 * adapter-level instrumentation.
 *
 * @module
 */

import type { Entity } from './types.js';

// ---------------------------------------------------------------------------
// AgentFlow types (inline to avoid hard dependency on agentflow-core for this)
// ---------------------------------------------------------------------------

interface GraphNode {
  readonly id: string;
  readonly type: string; // 'agent' | 'tool' | 'subagent' | 'wait' | 'decision' | 'custom'
  readonly name: string;
  readonly startTime: number;
  readonly endTime: number | null;
  readonly status: string; // 'running' | 'completed' | 'failed' | 'hung' | 'timeout'
  readonly parentId: string | null;
  readonly children: readonly string[];
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly state?: Readonly<Record<string, unknown>>;
}

interface GraphEdge {
  readonly from: string;
  readonly to: string;
  readonly type: string; // 'spawned' | 'waited_on' | 'called' | 'retried' | 'branched'
}

interface TraceEvent {
  readonly timestamp: number;
  readonly eventType: string;
  readonly nodeId: string;
  readonly data: Readonly<Record<string, unknown>>;
}

/** Minimal ExecutionGraph shape for decision extraction. */
export interface GraphLike {
  readonly id: string;
  readonly agentId: string;
  readonly nodes: ReadonlyMap<string, GraphNode> | Record<string, GraphNode>;
  readonly edges: readonly GraphEdge[];
  readonly events?: readonly TraceEvent[];
  readonly status?: string;
  readonly rootNodeId?: string;
}

/** A decision extracted from a graph. */
export interface ExtractedDecision {
  decision_type: 'tool_choice' | 'branch' | 'retry' | 'delegation' | 'failure';
  choice: string;
  alternatives?: string[];
  rationale?: string;
  outcome: string;
  decision_context: Record<string, unknown>;
  agent_id: string;
  graph_id: string;
  node_id: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getNodes(graph: GraphLike): GraphNode[] {
  if (graph.nodes instanceof Map) {
    return [...graph.nodes.values()];
  }
  return Object.values(graph.nodes);
}

function getNode(graph: GraphLike, id: string): GraphNode | undefined {
  if (graph.nodes instanceof Map) {
    return graph.nodes.get(id);
  }
  return (graph.nodes as Record<string, GraphNode>)[id];
}

// ---------------------------------------------------------------------------
// Extraction functions
// ---------------------------------------------------------------------------

/**
 * Detect if an object looks like a full ExecutionGraph (has nodes and edges).
 */
export function isExecutionGraph(obj: unknown): obj is GraphLike {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return (
    ('nodes' in o && (o.nodes instanceof Map || (typeof o.nodes === 'object' && o.nodes !== null))) &&
    ('edges' in o && Array.isArray(o.edges)) &&
    ('agentId' in o && typeof o.agentId === 'string')
  );
}

/**
 * Extract all decisions from an ExecutionGraph.
 * Returns an empty array if the graph has no meaningful decisions
 * (e.g., only a root agent node with no tool calls).
 */
export function extractDecisionsFromGraph(graph: GraphLike): ExtractedDecision[] {
  const decisions: ExtractedDecision[] = [];
  const nodes = getNodes(graph);

  // Skip graphs with only a root agent node and no events
  const nonRootNodes = nodes.filter(n => n.parentId !== null);
  const hasExplicitDecisionEvents = graph.events?.some(e => e.eventType === 'decision' || e.eventType === 'subagent_spawn');
  if (nonRootNodes.length === 0 && !hasExplicitDecisionEvents) return decisions;

  // 1. Tool choice decisions
  for (const node of nodes) {
    if (node.type === 'tool') {
      decisions.push({
        decision_type: 'tool_choice',
        choice: node.name,
        outcome: node.status,
        decision_context: {
          ...node.metadata,
          ...(node.state ?? {}),
          duration: node.endTime != null && node.startTime ? node.endTime - node.startTime : undefined,
        },
        agent_id: graph.agentId,
        graph_id: graph.id,
        node_id: node.id,
      });
    }
  }

  // 2. Branch decisions
  for (const edge of graph.edges) {
    if (edge.type === 'branched') {
      const targetNode = getNode(graph, edge.to);
      const sourceNode = getNode(graph, edge.from);
      if (!targetNode || !sourceNode) continue;

      // Find sibling branches (other children of the same parent)
      const siblings = nodes.filter(n =>
        n.parentId === sourceNode.id && n.id !== targetNode.id,
      );

      decisions.push({
        decision_type: 'branch',
        choice: targetNode.name,
        alternatives: siblings.map(s => s.name),
        outcome: targetNode.status,
        decision_context: {
          source_node: sourceNode.name,
          ...targetNode.metadata,
        },
        agent_id: graph.agentId,
        graph_id: graph.id,
        node_id: targetNode.id,
      });
    }
  }

  // 3. Retry decisions
  const retryEdges = graph.edges.filter(e => e.type === 'retried');
  if (retryEdges.length > 0) {
    // Group retries by target
    const retryGroups = new Map<string, GraphEdge[]>();
    for (const edge of retryEdges) {
      const group = retryGroups.get(edge.to) ?? [];
      group.push(edge);
      retryGroups.set(edge.to, group);
    }

    for (const [targetId, edges] of retryGroups) {
      const targetNode = getNode(graph, targetId);
      if (!targetNode) continue;

      decisions.push({
        decision_type: 'retry',
        choice: targetNode.name,
        outcome: targetNode.status,
        decision_context: {
          retry_count: edges.length,
          ...targetNode.metadata,
        },
        agent_id: graph.agentId,
        graph_id: graph.id,
        node_id: targetNode.id,
      });
    }
  }

  // 4. Delegation decisions (subagent nodes or subagent_spawn events)
  for (const node of nodes) {
    if (node.type === 'subagent') {
      decisions.push({
        decision_type: 'delegation',
        choice: node.name,
        outcome: node.status,
        decision_context: {
          parent_agent: graph.agentId,
          ...node.metadata,
        },
        agent_id: graph.agentId,
        graph_id: graph.id,
        node_id: node.id,
      });
    }
  }

  // Also check trace events for subagent_spawn
  if (graph.events) {
    for (const event of graph.events) {
      if (event.eventType === 'subagent_spawn') {
        // Only add if not already captured as a subagent node
        const alreadyCaptured = decisions.some(d =>
          d.decision_type === 'delegation' && d.node_id === event.nodeId,
        );
        if (!alreadyCaptured) {
          decisions.push({
            decision_type: 'delegation',
            choice: String(event.data.name ?? event.data.agentId ?? `unattributed:node-${event.nodeId}`),
            outcome: 'spawned',
            decision_context: { ...event.data },
            agent_id: graph.agentId,
            graph_id: graph.id,
            node_id: event.nodeId,
          });
        }
      }
    }
  }

  // 5. Failure path decisions
  const failedNodes = nodes.filter(n => n.status === 'failed');
  for (const failedNode of failedNodes) {
    // Walk path from root to failure
    const path: string[] = [];
    let current: GraphNode | undefined = failedNode;
    while (current) {
      path.unshift(current.name);
      current = current.parentId ? getNode(graph, current.parentId) : undefined;
    }

    decisions.push({
      decision_type: 'failure',
      choice: failedNode.name,
      outcome: 'failed',
      decision_context: {
        error: failedNode.metadata.error ?? failedNode.metadata.errorMessage,
        error_stack: failedNode.metadata.errorStack,
        failure_path: path,
        ...failedNode.metadata,
      },
      agent_id: graph.agentId,
      graph_id: graph.id,
      node_id: failedNode.id,
    });
  }

  // 6. Extract node.state from custom trace events (updateState records)
  if (graph.events) {
    for (const event of graph.events) {
      if (event.eventType === 'custom' && event.data.action === 'state_update') {
        // Find matching decision and enrich its context
        const matchingDecision = decisions.find(d => d.node_id === event.nodeId);
        if (matchingDecision) {
          const { action, ...stateData } = event.data;
          Object.assign(matchingDecision.decision_context, stateData);
        }
      }
    }
  }

  // 7. Explicit decision trace events — create enriched entities
  if (graph.events) {
    for (const event of graph.events) {
      if (event.eventType === 'decision') {
        decisions.push({
          decision_type: (event.data.decision_type as any) ?? 'tool_choice',
          choice: String(event.data.choice ?? 'unattributed'),
          alternatives: Array.isArray(event.data.alternatives) ? event.data.alternatives.map(String) : undefined,
          rationale: event.data.rationale ? String(event.data.rationale) : undefined,
          outcome: String(event.data.outcome ?? 'unattributed'),
          decision_context: { ...event.data },
          agent_id: graph.agentId,
          graph_id: graph.id,
          node_id: event.nodeId,
        });
      }
    }
  }

  return decisions;
}

/**
 * Convert extracted decisions into entity partials ready for vault creation.
 */
export function decisionsToEntities(
  decisions: ExtractedDecision[],
): (Partial<Entity> & { type: string; name: string })[] {
  return decisions.map((d) => ({
    type: 'decision' as const,
    name: `${d.decision_type}: ${d.choice} (${d.agent_id})`,
    status: 'active',
    decision_type: d.decision_type,
    choice: d.choice,
    alternatives: d.alternatives,
    rationale: d.rationale ?? '',
    outcome: d.outcome,
    decision_context: d.decision_context,
    graph_id: d.graph_id,
    agent_id: d.agent_id,
    claim: `Agent ${d.agent_id} ${d.decision_type === 'tool_choice' ? 'used tool' : d.decision_type === 'branch' ? 'chose branch' : d.decision_type === 'retry' ? 'retried' : d.decision_type === 'delegation' ? 'delegated to' : 'failed at'} "${d.choice}"`,
    confidence: 'medium' as const,
    evidence: [],
    sourceIds: [d.graph_id],
    tags: ['graph-inferred', d.decision_type],
    related: [`execution/${d.graph_id}`],
    body: buildDecisionBody(d),
  }));
}

function buildDecisionBody(d: ExtractedDecision): string {
  const lines = [`## ${d.decision_type}: ${d.choice}\n`];
  lines.push(`Agent **${d.agent_id}** made a ${d.decision_type} decision.`);
  lines.push(`- **Choice:** ${d.choice}`);
  if (d.alternatives?.length) lines.push(`- **Alternatives:** ${d.alternatives.join(', ')}`);
  if (d.rationale) lines.push(`- **Rationale:** ${d.rationale}`);
  lines.push(`- **Outcome:** ${d.outcome}`);
  if (d.decision_context.error) lines.push(`- **Error:** ${d.decision_context.error}`);
  return lines.join('\n');
}
