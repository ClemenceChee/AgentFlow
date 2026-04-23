/**
 * Closure-based factory for constructing execution graphs.
 *
 * Zero dependencies. Counter-based IDs by default, injectable for testing.
 *
 * @example
 * ```ts
 * const builder = createGraphBuilder({ agentId: 'main', trigger: 'user-request' });
 * const rootId = builder.startNode({ type: 'agent', name: 'main' });
 * const toolId = builder.startNode({ type: 'tool', name: 'search', parentId: rootId });
 * builder.endNode(toolId);
 * builder.endNode(rootId);
 * const graph = builder.build();
 * ```
 * @module
 */

import { randomUUID } from 'node:crypto';

import type {
  AgentFlowConfig,
  EdgeType,
  ExecutionEdge,
  ExecutionGraph,
  GraphBuilder,
  GraphStatus,
  MutableExecutionNode,
  NodeStatus,
  OperatorContext,
  StartNodeOptions,
  TraceEvent,
} from './types.js';

// Organizational context briefing interfaces
interface OrganizationalBriefing {
  readonly status: 'available' | 'limited' | 'unavailable';
  readonly summary: string;
  readonly insights: readonly OrganizationalInsight[];
  readonly warnings: readonly string[];
  readonly recommendations: readonly string[];
  readonly relatedSessions: readonly RelatedSessionInfo[];
  readonly teamContext?: TeamBriefingContext;
  readonly timestamp: number;
  readonly source: 'soma_vault' | 'cache' | 'fallback';
}

interface OrganizationalInsight {
  readonly type: 'pattern' | 'performance' | 'collaboration' | 'workflow' | 'decision';
  readonly title: string;
  readonly description: string;
  readonly confidence: number;
  readonly actionable: boolean;
  readonly relatedEntities: readonly string[];
  readonly timestamp: number;
}

interface RelatedSessionInfo {
  readonly sessionId: string;
  readonly operatorId: string;
  readonly timestamp: number;
  readonly similarity: number;
  readonly context: string;
  readonly outcome?: 'success' | 'failure' | 'partial';
}

interface TeamBriefingContext {
  readonly teamId: string;
  readonly recentActivity: {
    readonly sessionsLastWeek: number;
    readonly activeOperators: number;
    readonly commonPatterns: readonly string[];
    readonly performanceScore?: number;
  };
  readonly currentFocus: readonly string[];
  readonly knowledgeGaps: readonly string[];
  readonly collaboration: {
    readonly crossTeamSessions: number;
    readonly externalTeams: readonly string[];
    readonly knowledgeSharing: number;
  };
}

// ---------------------------------------------------------------------------
// Organizational Briefing Service
// ---------------------------------------------------------------------------

/**
 * Generate organizational context briefing for the execution environment.
 * Attempts to connect to SOMA vault for rich intelligence, falls back to basic briefing.
 */
async function generateOrganizationalBriefing(
  operatorContext?: import('./types.js').OperatorContext,
  agentId?: string,
  trigger?: string
): Promise<OrganizationalBriefing> {
  const timestamp = Date.now();

  // If no operator context, provide minimal briefing
  if (!operatorContext?.operatorId) {
    return {
      status: 'unavailable',
      summary: 'No organizational context available - running in standalone mode',
      insights: [],
      warnings: [],
      recommendations: [
        'Consider setting OPERATOR_ID and CLAUDE_CODE_SESSION_ID environment variables for organizational intelligence',
        'Enable team context with TEAM_ID for collaborative insights'
      ],
      relatedSessions: [],
      timestamp,
      source: 'fallback'
    };
  }

  try {
    // Attempt dynamic SOMA vault integration
    const briefing = await generateSOMABriefing(operatorContext, agentId, trigger);
    if (briefing) return briefing;
  } catch (error) {
    // SOMA integration failed - fall back to environment-based briefing
  }

  // Fallback: Generate basic briefing from available context
  return generateFallbackBriefing(operatorContext, timestamp, agentId, trigger);
}

/**
 * Attempt to generate briefing using SOMA vault integration.
 */
async function generateSOMABriefing(
  _operatorContext: import('./types.js').OperatorContext,
  _agentId?: string,
  _trigger?: string,
): Promise<OrganizationalBriefing | null> {
  // The SOMA package lives in a separate private repo. Per the
  // AgentFlow↔SOMA contract, integration is filesystem-only via `.soma/`
  // (see packages/bi-platform/src/integrations/soma-adapter.ts).
  // Module imports from this package are intentionally not present.
  // Callers fall back to generateFallbackBriefing when this returns null.
  return null;
}

/**
 * Generate fallback briefing using only operator context.
 */
function generateFallbackBriefing(
  operatorContext: import('./types.js').OperatorContext,
  timestamp: number,
  _agentId?: string,
  _trigger?: string,
): OrganizationalBriefing {
  const insights: OrganizationalInsight[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  // Basic context validation insights
  if (operatorContext.operatorId && operatorContext.sessionId) {
    insights.push({
      type: 'workflow',
      title: 'Operator Context Available',
      description: `Session ${operatorContext.sessionId} authenticated for operator ${operatorContext.operatorId}`,
      confidence: 1.0,
      actionable: false,
      relatedEntities: [operatorContext.operatorId],
      timestamp
    });
  }

  if (operatorContext.teamId) {
    insights.push({
      type: 'collaboration',
      title: 'Team Context Detected',
      description: `Running in team context: ${operatorContext.teamId}`,
      confidence: 0.8,
      actionable: true,
      relatedEntities: [operatorContext.teamId],
      timestamp
    });
    recommendations.push('Team-scoped insights available - consider enabling SOMA integration for enhanced team intelligence');
  }

  if (operatorContext.instanceId) {
    insights.push({
      type: 'workflow',
      title: 'Instance Context Available',
      description: `Running on instance: ${operatorContext.instanceId}`,
      confidence: 0.7,
      actionable: false,
      relatedEntities: [],
      timestamp
    });
  }

  // Check for potential issues
  if (!operatorContext.timestamp || Date.now() - operatorContext.timestamp > 24 * 60 * 60 * 1000) {
    warnings.push('Operator context may be stale - consider refreshing session');
  }

  recommendations.push('Enable SOMA integration for comprehensive organizational intelligence');
  recommendations.push('Set up team-scoped memory for collaborative insights');

  const summary = operatorContext.teamId
    ? `Basic organizational context available for team ${operatorContext.teamId}`
    : 'Basic organizational context available - individual operator mode';

  return {
    status: 'limited',
    summary,
    insights,
    warnings,
    recommendations,
    relatedSessions: [],
    teamContext: operatorContext.teamId ? {
      teamId: operatorContext.teamId,
      recentActivity: {
        sessionsLastWeek: 0,
        activeOperators: 1,
        commonPatterns: [],
      },
      currentFocus: [],
      knowledgeGaps: ['SOMA integration needed for comprehensive team insights'],
      collaboration: {
        crossTeamSessions: 0,
        externalTeams: [],
        knowledgeSharing: 0
      }
    } : undefined,
    timestamp,
    source: 'fallback'
  };
}

/**
 * Recursively freeze an object, array, or Map and all nested values.
 * Returns the same reference, now deeply frozen.
 */
function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;

  // Handle Map: freeze the Map object, then freeze each value
  if (obj instanceof Map) {
    Object.freeze(obj);
    for (const value of obj.values()) {
      deepFreeze(value);
    }
    return obj;
  }

  Object.freeze(obj);
  const record = obj as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const value = record[key];
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return obj;
}

/** Create a counter-based ID generator: node_001, node_002, etc. */
function createCounterIdGenerator(): () => string {
  let counter = 0;
  return () => {
    counter++;
    return `node_${String(counter).padStart(3, '0')}`;
  };
}

/**
 * Create a new execution graph builder.
 *
 * @param config - Optional configuration (agentId, trigger, custom ID generator, etc.).
 * @returns A `GraphBuilder` with methods to construct the graph incrementally.
 *
 * @example
 * ```ts
 * const builder = createGraphBuilder({ agentId: 'portfolio-recon', trigger: 'cron' });
 * const rootId = builder.startNode({ type: 'agent', name: 'recon' });
 * builder.endNode(rootId);
 * const graph = builder.build();
 * ```
 */
export function createGraphBuilder(config?: AgentFlowConfig): GraphBuilder {
  const generateId = config?.idGenerator ?? createCounterIdGenerator();
  const agentId = config?.agentId ?? 'unknown';
  const trigger = config?.trigger ?? 'manual';
  const spanId = randomUUID();
  const traceId =
    config?.traceId ??
    (typeof process !== 'undefined' ? process.env?.AGENTFLOW_TRACE_ID : undefined) ??
    randomUUID();
  const parentSpanId =
    config?.parentSpanId ??
    (typeof process !== 'undefined' ? process.env?.AGENTFLOW_PARENT_SPAN_ID : undefined) ??
    null;

  // Read Claude Code session context from environment variables if not provided in config
  // Environment variables expected:
  //   OPERATOR_ID - Unique identifier for the operator/user
  //   CLAUDE_CODE_SESSION_ID - Session identifier for the Claude Code instance
  //   TEAM_ID - Team identifier for organizational context
  //   CLAUDE_CODE_INSTANCE_ID - Instance identifier (CLI, desktop, web, etc.)
  //   CLAUDE_CODE_USER_AGENT - User agent string for the Claude Code instance
  const operatorContext: OperatorContext | undefined =
    config?.operatorContext ??
    (typeof process !== 'undefined' &&
    process.env?.OPERATOR_ID &&
    process.env?.CLAUDE_CODE_SESSION_ID
      ? {
          operatorId: process.env.OPERATOR_ID,
          sessionId: process.env.CLAUDE_CODE_SESSION_ID,
          teamId: process.env.TEAM_ID,
          instanceId: process.env.CLAUDE_CODE_INSTANCE_ID,
          timestamp: Date.now(),
          userAgent: process.env.CLAUDE_CODE_USER_AGENT,
        }
      : undefined);

  // Validate operator authentication if organizational context is enabled
  function validateOperatorAuthentication(context: OperatorContext | undefined): {
    valid: boolean;
    warnings?: string[];
    auditEvent?: { action: string; operatorId?: string; reason: string; timestamp: number };
  } {
    if (!context) {
      return { valid: true }; // No organizational context required
    }

    const warnings: string[] = [];
    const timestamp = Date.now();

    // Check required fields
    if (!context.operatorId || !context.sessionId) {
      const auditEvent = {
        action: 'auth_validation_failed',
        operatorId: context.operatorId || 'unknown',
        reason: 'Missing required operator context fields (operatorId, sessionId)',
        timestamp
      };
      return { valid: false, auditEvent };
    }

    // Validate operator ID format (should be UUID or similar)
    if (!/^[a-zA-Z0-9-_]{8,}$/.test(context.operatorId)) {
      warnings.push('Operator ID format may be invalid');
    }

    // Validate session ID format
    if (!/^[a-zA-Z0-9-_]{8,}$/.test(context.sessionId)) {
      warnings.push('Session ID format may be invalid');
    }

    // Log successful authentication for audit
    const auditEvent = {
      action: 'auth_validation_success',
      operatorId: context.operatorId,
      reason: `Operator authenticated with${context.teamId ? ` team ${context.teamId}` : ' no team'}`,
      timestamp
    };

    return { valid: true, warnings, auditEvent };
  }

  // --- Mutable internal state (closure scope) ---
  const graphId = generateId();
  const startTime = Date.now();
  const nodes = new Map<string, MutableExecutionNode>();
  const edges: ExecutionEdge[] = [];
  const events: TraceEvent[] = [];
  const parentStack: string[] = [];
  let rootNodeId: string | null = null;
  let built = false;

  // --- Session initialization hooks ---
  const sessionHooks = config?.sessionHooks;
  let sessionInitialized = false;
  let organizationalBriefing: OrganizationalBriefing | null = null;

  // Perform operator authentication validation
  const authValidation = validateOperatorAuthentication(operatorContext);
  if (!authValidation.valid) {
    // Log security audit event for failed authentication
    if (authValidation.auditEvent) {
      events.push({
        eventType: 'custom',
        nodeId: '',
        timestamp: authValidation.auditEvent.timestamp,
        data: { category: 'security_audit', ...authValidation.auditEvent },
      });
    }
    throw new Error(`Operator authentication failed: ${authValidation.auditEvent?.reason}`);
  }

  // Log successful authentication audit event
  if (authValidation.auditEvent) {
    events.push({
      eventType: 'custom',
      nodeId: '',
      timestamp: authValidation.auditEvent.timestamp,
      data: { category: 'security_audit', ...authValidation.auditEvent },
    });
  }

  // Log authentication warnings if any
  if (authValidation.warnings && authValidation.warnings.length > 0) {
    for (const warning of authValidation.warnings) {
      events.push({
        eventType: 'custom',
        nodeId: '',
        timestamp: Date.now(),
        data: { category: 'operator_auth', level: 'warning', message: warning },
      });
    }
  }


  function assertNotBuilt(): void {
    if (built) {
      throw new Error('GraphBuilder: cannot mutate after build() has been called');
    }
  }

  function getNode(nodeId: string): MutableExecutionNode {
    const node = nodes.get(nodeId);
    if (!node) {
      throw new Error(`GraphBuilder: node "${nodeId}" does not exist`);
    }
    return node;
  }

  function recordEvent(
    nodeId: string,
    eventType: TraceEvent['eventType'],
    data: Record<string, unknown> = {},
  ): void {
    events.push({
      timestamp: Date.now(),
      eventType,
      nodeId,
      data,
    });
  }

  /** Build an ExecutionGraph from the current state (shared by build and getSnapshot). */
  function buildGraph(): ExecutionGraph {
    if (rootNodeId === null) {
      throw new Error('GraphBuilder: cannot build a graph with no nodes');
    }

    // Determine aggregate graph status
    let graphStatus: GraphStatus = 'completed';
    for (const node of nodes.values()) {
      if (node.status === 'failed' || node.status === 'timeout' || node.status === 'hung') {
        graphStatus = 'failed';
        break;
      }
      if (node.status === 'running') {
        graphStatus = 'running';
        // Don't break — a failed node takes priority over running
      }
    }

    // Determine endTime: null if any node is still running
    const endTime = graphStatus === 'running' ? null : Date.now();

    // Build a frozen Map<string, ExecutionNode> from the mutable map
    const frozenNodes = new Map(
      [...nodes.entries()].map(([id, mNode]) => [
        id,
        {
          id: mNode.id,
          type: mNode.type,
          name: mNode.name,
          startTime: mNode.startTime,
          endTime: mNode.endTime,
          status: mNode.status,
          parentId: mNode.parentId,
          children: [...mNode.children],
          metadata: { ...mNode.metadata },
          state: { ...mNode.state },
        },
      ]),
    );

    const graph: ExecutionGraph = {
      id: graphId,
      rootNodeId,
      nodes: frozenNodes,
      edges: [...edges],
      startTime,
      endTime,
      status: graphStatus,
      trigger,
      agentId,
      events: [...events],
      traceId,
      spanId,
      parentSpanId,
      operatorContext: operatorContext?.operatorId && operatorContext?.sessionId ? {
        operatorId: operatorContext.operatorId,
        sessionId: operatorContext.sessionId,
        teamId: operatorContext.teamId,
        instanceId: operatorContext.instanceId,
        timestamp: operatorContext.timestamp,
        userAgent: operatorContext.userAgent,
      } : undefined,
      metadata: {
        organizationalBriefing: organizationalBriefing ? {
          status: organizationalBriefing.status,
          summary: organizationalBriefing.summary,
          insightCount: organizationalBriefing.insights.length,
          warningCount: organizationalBriefing.warnings.length,
          recommendationCount: organizationalBriefing.recommendations.length,
          teamContextAvailable: organizationalBriefing.teamContext !== undefined,
          relatedSessionCount: organizationalBriefing.relatedSessions.length,
          source: organizationalBriefing.source,
          timestamp: organizationalBriefing.timestamp,
          // Include key insights for execution environment
          keyInsights: organizationalBriefing.insights.slice(0, 3).map(insight => ({
            type: insight.type,
            title: insight.title,
            description: insight.description,
            confidence: insight.confidence,
            actionable: insight.actionable
          })),
          // Include warnings and recommendations
          warnings: organizationalBriefing.warnings,
          recommendations: organizationalBriefing.recommendations.slice(0, 3),
          // Team context summary if available
          teamSummary: organizationalBriefing.teamContext ? {
            teamId: organizationalBriefing.teamContext.teamId,
            recentActivity: organizationalBriefing.teamContext.recentActivity,
            currentFocus: organizationalBriefing.teamContext.currentFocus
          } : undefined
        } : {
          status: 'unavailable',
          summary: 'No organizational briefing generated',
          insightCount: 0,
          warningCount: 0,
          recommendationCount: 0,
          teamContextAvailable: false,
          relatedSessionCount: 0,
          source: 'none',
          timestamp: Date.now(),
          keyInsights: [],
          warnings: [],
          recommendations: ['Enable organizational context for intelligent briefings'],
          teamSummary: undefined
        }
      }
    };

    return deepFreeze(graph);
  }

  const builder: GraphBuilder = {
    get graphId() {
      return graphId;
    },

    get traceContext() {
      return { traceId, spanId };
    },

    /** Get organizational briefing if available (may return null if briefing hasn't been generated yet). */
    getOrganizationalBriefing(): OrganizationalBriefing | null {
      return organizationalBriefing;
    },

    /** Get organizational context summary for execution environment. */
    getOrganizationalContext(): {
      operatorContext?: import('./types.js').OperatorContext;
      briefingAvailable: boolean;
      briefingSummary?: string;
      teamContext?: string;
      insightCount: number;
      warningCount: number;
    } {
      return {
        operatorContext,
        briefingAvailable: organizationalBriefing !== null,
        briefingSummary: organizationalBriefing?.summary,
        teamContext: organizationalBriefing?.teamContext?.teamId,
        insightCount: organizationalBriefing?.insights.length || 0,
        warningCount: organizationalBriefing?.warnings.length || 0
      };
    },

    startNode(opts: StartNodeOptions): string {
      assertNotBuilt();

      const id = generateId();
      const parentId = opts.parentId ?? parentStack[parentStack.length - 1] ?? null;

      // Execute session start hook for the first (root) node
      if (rootNodeId === null && sessionHooks?.onSessionStart) {
        try {
          // Generate organizational briefing asynchronously
          const briefingPromise = generateOrganizationalBriefing(operatorContext, agentId, trigger);

          // For sync hooks, wait for briefing if it's fast
          if (typeof sessionHooks.onSessionStart !== 'function' || sessionHooks.onSessionStart.constructor.name !== 'AsyncFunction') {
            // Synchronous hook - try to get briefing quickly
            Promise.race([
              briefingPromise,
              new Promise(resolve => setTimeout(() => resolve(null), 100)) // 100ms timeout for sync hooks
            ]).then(briefing => {
              organizationalBriefing = briefing as OrganizationalBriefing || null;

              if (organizationalBriefing) {
                // Call sync hook with briefing
                try {
                  const hookContext = {
                    operatorId: operatorContext?.operatorId,
                    teamId: operatorContext?.teamId,
                    sessionId: operatorContext?.sessionId,
                    agentId,
                    trigger,
                    briefing: organizationalBriefing.summary,
                    insights: organizationalBriefing.insights,
                    warnings: organizationalBriefing.warnings,
                    recommendations: organizationalBriefing.recommendations
                  };

                  // Call the hook if it exists
                  if (sessionHooks.onSessionStart) {
                    sessionHooks.onSessionStart(hookContext as any);
                  }
                } catch (error) {
                  console.warn('[AgentFlow] Session start hook failed:', error);
                }
              }
            }).catch(error => {
              console.warn('[AgentFlow] Organizational briefing generation failed:', error);
            });
          } else {
            // Async hook - generate briefing and call hook
            briefingPromise.then(briefing => {
              organizationalBriefing = briefing;

              const hookContext = {
                operatorId: operatorContext?.operatorId,
                teamId: operatorContext?.teamId,
                sessionId: operatorContext?.sessionId,
                agentId,
                trigger,
                briefing: briefing.summary,
                insights: briefing.insights,
                warnings: briefing.warnings,
                recommendations: briefing.recommendations
              };

              try {
                const result = sessionHooks.onSessionStart!(hookContext as any);
                Promise.resolve(result).catch((error: unknown) => {
                  console.warn('[AgentFlow] Async session start hook failed:', error);
                });
              } catch (error) {
                console.warn('[AgentFlow] Session start hook failed:', error);
              }
            }).catch(error => {
              console.warn('[AgentFlow] Organizational briefing generation failed:', error);

              // Still call hook with minimal context
              try {
                const hookContext = {
                  operatorId: operatorContext?.operatorId,
                  teamId: operatorContext?.teamId,
                  sessionId: operatorContext?.sessionId,
                  agentId,
                  trigger,
                  briefing: 'Organizational context unavailable',
                  warnings: [`Briefing generation failed: ${error instanceof Error ? error.message : String(error)}`]
                };

                const result = sessionHooks.onSessionStart!(hookContext as any);
                Promise.resolve(result).catch((hookErr: unknown) => {
                  console.warn('[AgentFlow] Async session start hook failed after briefing error:', hookErr);
                });
              } catch (hookError) {
                console.warn('[AgentFlow] Session start hook failed after briefing error:', hookError);
              }
            });
          }
        } catch (error) {
          console.warn('[AgentFlow] Session start hook setup failed:', error);
        }
      }

      // Validate parent exists if specified
      if (parentId !== null && !nodes.has(parentId)) {
        throw new Error(`GraphBuilder: parent node "${parentId}" does not exist`);
      }

      const node: MutableExecutionNode = {
        id,
        type: opts.type,
        name: opts.name,
        startTime: Date.now(),
        endTime: null,
        status: 'running',
        parentId,
        children: [],
        metadata: opts.metadata ? { ...opts.metadata } : {},
        state: {},
      };

      nodes.set(id, node);

      // Link to parent
      if (parentId !== null) {
        const parent = nodes.get(parentId);
        if (parent) {
          parent.children.push(id);
        }
        edges.push({ from: parentId, to: id, type: 'spawned' });
      }

      // First node becomes root
      if (rootNodeId === null) {
        rootNodeId = id;

        // Execute session initialized hook for the root node
        if (sessionHooks?.onSessionInitialized && !sessionInitialized) {
          try {
            const hookContext = {
              operatorId: operatorContext?.operatorId,
              teamId: operatorContext?.teamId,
              sessionId: operatorContext?.sessionId,
              graphId,
              traceId,
              briefing: organizationalBriefing,
              organizationalContext: {
                briefingAvailable: organizationalBriefing !== null,
                briefingSummary: organizationalBriefing?.summary,
                insightCount: organizationalBriefing?.insights.length || 0,
                teamContext: organizationalBriefing?.teamContext,
                relatedSessions: organizationalBriefing?.relatedSessions || []
              }
            };

            // Call sync version or queue async version
            const result = sessionHooks.onSessionInitialized(hookContext as any);
            if (result && typeof result.then === 'function') {
              // Async hook - don't wait but log if it fails
              result.catch(error => {
                console.warn('[AgentFlow] Session initialized hook failed:', error);
              });
            }
            sessionInitialized = true;
          } catch (error) {
            console.warn('[AgentFlow] Session initialized hook failed:', error);
          }
        }
      }

      recordEvent(id, 'agent_start', { type: opts.type, name: opts.name });
      return id;
    },

    endNode(nodeId: string, status: NodeStatus = 'completed'): void {
      assertNotBuilt();
      const node = getNode(nodeId);

      if (node.endTime !== null) {
        throw new Error(
          `GraphBuilder: node "${nodeId}" has already ended (status: ${node.status})`,
        );
      }

      node.endTime = Date.now();
      node.status = status;
      recordEvent(nodeId, 'agent_end', { status });
    },

    failNode(nodeId: string, error: Error | string): void {
      assertNotBuilt();
      const node = getNode(nodeId);

      if (node.endTime !== null) {
        throw new Error(
          `GraphBuilder: node "${nodeId}" has already ended (status: ${node.status})`,
        );
      }

      const errorMessage = error instanceof Error ? error.message : error;
      const errorStack = error instanceof Error ? error.stack : undefined;

      node.endTime = Date.now();
      node.status = 'failed';
      node.metadata.error = errorMessage;
      if (errorStack) {
        node.metadata.errorStack = errorStack;
      }

      recordEvent(nodeId, 'tool_error', { error: errorMessage });
    },

    addEdge(from: string, to: string, type: EdgeType): void {
      assertNotBuilt();
      getNode(from);
      getNode(to);

      edges.push({ from, to, type });
      recordEvent(from, 'custom', { to, type, action: 'edge_add' });
    },

    pushEvent(event: Omit<TraceEvent, 'timestamp'>): void {
      assertNotBuilt();
      getNode(event.nodeId); // validate node exists
      events.push({
        ...event,
        timestamp: Date.now(),
      });
    },

    updateState(nodeId: string, state: Record<string, unknown>): void {
      assertNotBuilt();
      const node = getNode(nodeId);
      Object.assign(node.state, state);
      recordEvent(nodeId, 'custom', { action: 'state_update', ...state });
    },

    withParent<T>(parentId: string, fn: () => T): T {
      assertNotBuilt();
      getNode(parentId); // validate parent exists
      parentStack.push(parentId);
      try {
        return fn();
      } finally {
        parentStack.pop();
      }
    },

    getSnapshot(): ExecutionGraph {
      return buildGraph();
    },

    build(): ExecutionGraph {
      assertNotBuilt();
      const graph = buildGraph();
      built = true;

      // Execute session end hook
      if (sessionHooks?.onSessionEnd) {
        try {
          const hookContext = {
            operatorId: operatorContext?.operatorId,
            teamId: operatorContext?.teamId,
            sessionId: operatorContext?.sessionId,
            graphId,
            status: graph.status as 'completed' | 'failed' | 'timeout',
            duration: Date.now() - startTime,
            briefing: organizationalBriefing,
            organizationalContext: organizationalBriefing ? {
              briefingAvailable: true,
              briefingSummary: organizationalBriefing.summary,
              insightCount: organizationalBriefing.insights.length,
              teamContext: organizationalBriefing.teamContext
            } : {
              briefingAvailable: false,
              briefingSummary: 'No organizational context available',
              insightCount: 0,
              teamContext: undefined
            }
          };

          const result = sessionHooks.onSessionEnd(hookContext);
          if (result && typeof result.then === 'function') {
            // Async hook - don't wait but log if it fails
            result.catch(error => {
              console.warn('[AgentFlow] Session end hook failed:', error);
            });
          }
        } catch (error) {
          console.warn('[AgentFlow] Session end hook failed:', error);
        }
      }

      return graph;
    },
  };

  return builder;
}
