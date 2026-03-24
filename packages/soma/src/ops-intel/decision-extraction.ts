/**
 * Decision extraction — parse agent session events into NormalizedDecision[].
 *
 * Framework-specific extractors for OpenClaw JSONL, AgentFlow JSON, LangChain runs.
 * Each extractor maps framework-specific event formats to the universal NormalizedDecision shape.
 *
 * @module
 */

import type { NormalizedDecision } from './types.js';

const MAX_REASONING_LEN = 200;
const MAX_OUTPUT_LEN = 100;

function truncate(s: string | undefined, max: number): string | undefined {
  if (!s) return undefined;
  return s.length > max ? s.slice(0, max) + '...' : s;
}

/**
 * Enrich a generic tool name with context from its arguments.
 * e.g. exec(command: "node server.js") → "exec:node"
 *      write(file_path: "/some/path/inbox/email.md") → "write:inbox"
 *      process(action: "fetchEmail") → "process:fetchEmail"
 */
function enrichActionName(toolName: string, args?: Record<string, unknown>): string {
  if (!args) return toolName;

  // exec/bash with command — extract the program name
  if ((toolName === 'exec' || toolName === 'bash') && typeof args.command === 'string') {
    const cmd = args.command.trim();
    const program = cmd.split(/\s+/)[0]?.replace(/^.*\//, ''); // strip path
    if (program) return `${toolName}:${program}`;
  }

  // write/read with file_path — extract the last meaningful directory name
  if ((toolName === 'write' || toolName === 'read') && typeof args.file_path === 'string') {
    const parts = args.file_path.split('/').filter(Boolean);
    // Walk from the end to find a non-generic segment (skip filenames and common path parts)
    for (let i = parts.length - 2; i >= 0; i--) {
      const seg = parts[i]!;
      // Skip generic path segments (home dirs, hidden config dirs, temp dirs)
      if (
        seg.startsWith('.') ||
        /^(home|tmp|var|usr|etc|lib)$/.test(seg) ||
        /^[a-z]{1,3}\d*$/.test(seg)
      )
        continue;
      return `${toolName}:${seg}`;
    }
  }

  // process/custom with action field
  if (typeof args.action === 'string') {
    return `${toolName}:${args.action}`;
  }

  // fetch/search with url
  if (typeof args.url === 'string') {
    try {
      const host = new URL(args.url).hostname.replace('www.', '');
      return `${toolName}:${host}`;
    } catch {
      /* not a URL */
    }
  }

  return toolName;
}

// ---------------------------------------------------------------------------
// OpenClaw JSONL sessions (Claude Code / OpenClaw gateway)
// ---------------------------------------------------------------------------

interface SessionEvent {
  type: string;
  message?: {
    role: string;
    content: unknown[];
  };
  [key: string]: unknown;
}

/**
 * Extract decisions from OpenClaw/Claude Code session events.
 * Decisions are toolCall→toolResult pairs; reasoning is the thinking/text block before the call.
 *
 * Supports two formats:
 * - Standard: role=assistant content=[{type:"tool_use"}], role=tool content=[{tool_use_id}]
 * - OpenClaw: role=assistant content=[{type:"toolCall"}], role=toolResult content=[{type:"text"}]
 *   where toolResult.parentId links to the event.id containing the toolCall
 */
export function extractDecisionsFromSession(events: SessionEvent[]): NormalizedDecision[] {
  const decisions: NormalizedDecision[] = [];
  let lastReasoning: string | undefined;
  let decisionIndex = 0;

  // Build result maps for both formats

  // Format 1 (standard): tool_use_id → result
  const toolResultsById = new Map<string, { isError: boolean; content: string }>();
  // Format 2 (OpenClaw): event.id → result (parentId links toolResult back to event containing toolCall)
  const toolResultsByParentId = new Map<string, { isError: boolean; content: string }>();

  for (const event of events) {
    if (event.type !== 'message') continue;
    const msg = event.message;
    if (!msg) continue;

    // Standard format: role=tool
    if (msg.role === 'tool') {
      for (const c of msg.content) {
        if (typeof c === 'object' && c !== null) {
          const item = c as Record<string, unknown>;
          const toolId = item.tool_use_id as string;
          if (toolId) {
            toolResultsById.set(toolId, {
              isError: !!item.is_error,
              content: String(item.content ?? '').slice(0, MAX_OUTPUT_LEN),
            });
          }
        }
      }
    }

    // OpenClaw format: role=toolResult, parentId links to event containing toolCall
    if (msg.role === 'toolResult') {
      const parentId = event.parentId as string;
      let text = '';
      let isError = false;
      for (const c of msg.content) {
        if (typeof c === 'object' && c !== null) {
          const item = c as Record<string, unknown>;
          if (item.type === 'text') text = String(item.text ?? '').slice(0, MAX_OUTPUT_LEN);
          if (item.is_error) isError = true;
        }
      }
      // Check event-level error flag
      if (event.isError) isError = true;
      if (parentId) {
        toolResultsByParentId.set(parentId, { isError, content: text });
      }
    }
  }

  for (const event of events) {
    if (event.type !== 'message') continue;
    const msg = event.message;
    if (!msg || msg.role !== 'assistant') continue;

    const eventId = event.id as string;

    for (const c of msg.content) {
      if (typeof c !== 'object' || c === null) continue;
      const item = c as Record<string, unknown>;

      if (item.type === 'thinking' || item.type === 'text') {
        const text = String(item.text ?? '').trim();
        if (text) lastReasoning = text;
      }

      if (item.type === 'tool_use' || item.type === 'toolCall') {
        const toolId = (item.id ?? item.tool_use_id) as string;
        // Try standard format first, then OpenClaw format
        const result = toolResultsById.get(toolId) ?? toolResultsByParentId.get(eventId);

        const toolName = String(item.name ?? 'unattributed');
        if (!item.name)
          console.warn(`[Decision-Extraction] Tool call missing name, using 'unattributed'`);
        const args = (item.input ?? item.arguments) as Record<string, unknown> | undefined;

        // Enrich action name with context from arguments
        // e.g. exec(command: "node ...") → exec:node
        const action = enrichActionName(toolName, args);

        decisions.push({
          action,
          reasoning: truncate(lastReasoning, MAX_REASONING_LEN),
          tool: toolName,
          args,
          outcome: result ? (result.isError ? 'failed' : 'ok') : 'skipped',
          output: result ? truncate(result.content, MAX_OUTPUT_LEN) : undefined,
          error: result?.isError ? truncate(result.content, MAX_OUTPUT_LEN) : undefined,
          durationMs: undefined,
          index: decisionIndex++,
        });
        lastReasoning = undefined;
      }
    }
  }

  return decisions;
}

// ---------------------------------------------------------------------------
// AgentFlow JSON traces (ExecutionGraph nodes)
// ---------------------------------------------------------------------------

interface TraceNode {
  id: string;
  type: string;
  name: string;
  status: string;
  startTime: number;
  endTime: number | null;
  metadata?: Record<string, unknown>;
  state?: Record<string, unknown>;
}

/**
 * Extract decisions from AgentFlow ExecutionGraph nodes.
 * Tool and action nodes are treated as decisions.
 */
export function extractDecisionsFromNodes(
  nodes: Record<string, TraceNode> | Map<string, TraceNode>,
): NormalizedDecision[] {
  const nodeList = nodes instanceof Map ? [...nodes.values()] : Object.values(nodes);
  const sorted = nodeList
    .filter((n) => n.type === 'tool' || n.type === 'action' || n.type === 'decision')
    .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));

  return sorted.map((node, index) => {
    const dur = node.endTime != null ? node.endTime - node.startTime : undefined;
    const isFailed = node.status === 'failed' || node.status === 'error';
    const isTimeout = node.status === 'timeout' || node.status === 'hung';

    return {
      action: node.name,
      tool: node.name,
      args: node.metadata as Record<string, unknown> | undefined,
      outcome: isTimeout
        ? 'timeout'
        : isFailed
          ? 'failed'
          : node.status === 'skipped'
            ? 'skipped'
            : 'ok',
      output:
        truncate(String(node.state?.result ?? node.state?.summary ?? ''), MAX_OUTPUT_LEN) ||
        undefined,
      error: isFailed ? truncate(String(node.state?.error ?? ''), MAX_OUTPUT_LEN) : undefined,
      durationMs: dur,
      index,
    };
  });
}

// ---------------------------------------------------------------------------
// LangChain runs
// ---------------------------------------------------------------------------

interface LangChainRun {
  id: string;
  name: string;
  run_type: string;
  start_time: number;
  end_time: number;
  status: string;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  error?: string;
  child_runs?: LangChainRun[];
}

/**
 * Extract decisions from LangChain run tree.
 * Tool runs within a chain are treated as decisions.
 */
export function extractDecisionsFromLangChain(run: LangChainRun): NormalizedDecision[] {
  const decisions: NormalizedDecision[] = [];
  let index = 0;

  function walk(r: LangChainRun, parentName?: string) {
    if (r.run_type === 'tool' || r.run_type === 'retriever') {
      decisions.push({
        action: r.name,
        reasoning: parentName ? `Called by ${parentName}` : undefined,
        tool: r.name,
        args: r.inputs,
        outcome: r.status === 'error' ? 'failed' : 'ok',
        output: r.outputs ? truncate(JSON.stringify(r.outputs), MAX_OUTPUT_LEN) : undefined,
        error: r.error ? truncate(r.error, MAX_OUTPUT_LEN) : undefined,
        durationMs: r.end_time - r.start_time,
        index: index++,
      });
    }
    for (const child of r.child_runs ?? []) {
      walk(child, r.name);
    }
  }

  walk(run);
  return decisions;
}

// ---------------------------------------------------------------------------
// Pattern signatures
// ---------------------------------------------------------------------------

/**
 * Compute a decision pattern signature from a decision chain.
 * Normalizes action names, collapses consecutive repeats.
 */
export function computePatternSignature(decisions: NormalizedDecision[]): string {
  if (decisions.length === 0) return '';

  // Normalize action names: lowercase, strip numeric suffixes
  const actions = decisions.map((d) =>
    d.action
      .toLowerCase()
      .replace(/[-_]\d+$/g, '')
      .replace(/\s+/g, '_'),
  );

  // Collapse consecutive repeats
  const collapsed: string[] = [];
  let current = actions[0]!;
  let count = 1;

  for (let i = 1; i < actions.length; i++) {
    if (actions[i] === current) {
      count++;
    } else {
      collapsed.push(count > 1 ? `${current}[${count}]` : current);
      current = actions[i]!;
      count = 1;
    }
  }
  collapsed.push(count > 1 ? `${current}[${count}]` : current);

  return collapsed.join('\u2192');
}

/**
 * Compute a pattern signature that includes tool choice.
 */
export function computeToolPatternSignature(decisions: NormalizedDecision[]): string {
  if (decisions.length === 0) return '';

  const actions = decisions.map((d) => {
    const action = d.action
      .toLowerCase()
      .replace(/[-_]\d+$/g, '')
      .replace(/\s+/g, '_');
    const tool = d.tool ? d.tool.toLowerCase().replace(/[-_]\d+$/g, '') : '';
    return tool && tool !== action ? `${action}:${tool}` : action;
  });

  const collapsed: string[] = [];
  let current = actions[0]!;
  let count = 1;

  for (let i = 1; i < actions.length; i++) {
    if (actions[i] === current) {
      count++;
    } else {
      collapsed.push(count > 1 ? `${current}[${count}]` : current);
      current = actions[i]!;
      count = 1;
    }
  }
  collapsed.push(count > 1 ? `${current}[${count}]` : current);

  return collapsed.join('\u2192');
}
