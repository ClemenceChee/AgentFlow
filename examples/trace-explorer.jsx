import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  ChevronRight,
  ChevronDown,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Activity,
  Play,
  GitBranch,
  Loader,
  Zap,
  Box,
  Brain,
  Timer,
  Code,
  Upload,
  X,
  Copy,
  ChevronUp,
} from "lucide-react";

// ── Default trace data ──────────────────────────────────────────────────────

const DEFAULT_TRACE = {
  id: "graph_001",
  rootNodeId: "node_001",
  agentId: "portfolio-recon",
  trigger: "user-request",
  status: "failed",
  startTime: 1710000000000,
  endTime: 1710000004200,
  traceId: "abc-123",
  spanId: "span-001",
  parentSpanId: null,
  nodes: {
    node_001: {
      id: "node_001",
      type: "agent",
      name: "portfolio-recon",
      startTime: 1710000000000,
      endTime: 1710000004200,
      status: "completed",
      parentId: null,
      children: ["node_002", "node_003", "node_004", "node_005", "node_006"],
      metadata: {},
      state: { exitCode: 0, duration: 4.2 },
    },
    node_002: {
      id: "node_002",
      type: "tool",
      name: "web-search",
      startTime: 1710000000100,
      endTime: 1710000001100,
      status: "completed",
      parentId: "node_001",
      children: [],
      metadata: {
        "gen_ai.request.model": "gpt-4o",
        "gen_ai.usage.prompt_tokens": 340,
        "gen_ai.usage.completion_tokens": 120,
      },
      state: {},
    },
    node_003: {
      id: "node_003",
      type: "tool",
      name: "news-aggregator",
      startTime: 1710000000100,
      endTime: 1710000000900,
      status: "completed",
      parentId: "node_001",
      children: [],
      metadata: {},
      state: {},
    },
    node_004: {
      id: "node_004",
      type: "decision",
      name: "pick-analysis-strategy",
      startTime: 1710000001200,
      endTime: 1710000001500,
      status: "completed",
      parentId: "node_001",
      children: [],
      metadata: {},
      state: { chosen: "fundamental", reason: "volatile market" },
    },
    node_005: {
      id: "node_005",
      type: "subagent",
      name: "fundamental-analyst",
      startTime: 1710000001600,
      endTime: 1710000003200,
      status: "completed",
      parentId: "node_001",
      children: ["node_007", "node_008"],
      metadata: {},
      state: {},
    },
    node_006: {
      id: "node_006",
      type: "tool",
      name: "sentiment-api",
      startTime: 1710000003300,
      endTime: 1710000003800,
      status: "failed",
      parentId: "node_001",
      children: [],
      metadata: {
        error: "API rate limit exceeded (429)",
        errorStack:
          "Error: API rate limit exceeded (429)\n    at SentimentAPI.call (/src/tools.ts:42:11)\n    at AgentRunner.executeTool (/src/runner.ts:156:22)\n    at async AgentRunner.step (/src/runner.ts:89:14)",
      },
      state: {},
    },
    node_007: {
      id: "node_007",
      type: "tool",
      name: "sec-filing-reader",
      startTime: 1710000001700,
      endTime: 1710000002400,
      status: "completed",
      parentId: "node_005",
      children: [],
      metadata: {
        "gen_ai.request.model": "claude-sonnet-4-20250514",
        "gen_ai.usage.prompt_tokens": 8200,
        "gen_ai.usage.completion_tokens": 1500,
      },
      state: {},
    },
    node_008: {
      id: "node_008",
      type: "tool",
      name: "comparable-analysis",
      startTime: 1710000002500,
      endTime: 1710000003100,
      status: "completed",
      parentId: "node_005",
      children: [],
      metadata: {},
      state: {},
    },
  },
  edges: [
    { from: "node_001", to: "node_002", type: "spawned" },
    { from: "node_001", to: "node_003", type: "spawned" },
    { from: "node_001", to: "node_004", type: "spawned" },
    { from: "node_001", to: "node_005", type: "spawned" },
    { from: "node_001", to: "node_006", type: "spawned" },
    { from: "node_005", to: "node_007", type: "spawned" },
    { from: "node_005", to: "node_008", type: "spawned" },
    { from: "node_004", to: "node_005", type: "branched" },
  ],
  events: [
    { timestamp: 1710000000000, eventType: "agent_start", nodeId: "node_001", data: { type: "agent", name: "portfolio-recon" } },
    { timestamp: 1710000000100, eventType: "agent_start", nodeId: "node_002", data: { type: "tool", name: "web-search" } },
    { timestamp: 1710000000100, eventType: "agent_start", nodeId: "node_003", data: { type: "tool", name: "news-aggregator" } },
    { timestamp: 1710000000900, eventType: "agent_end", nodeId: "node_003", data: { status: "completed" } },
    { timestamp: 1710000001100, eventType: "agent_end", nodeId: "node_002", data: { status: "completed" } },
    { timestamp: 1710000001200, eventType: "agent_start", nodeId: "node_004", data: { type: "decision", name: "pick-analysis-strategy" } },
    { timestamp: 1710000001500, eventType: "agent_end", nodeId: "node_004", data: { status: "completed" } },
    { timestamp: 1710000001600, eventType: "agent_start", nodeId: "node_005", data: { type: "subagent", name: "fundamental-analyst" } },
    { timestamp: 1710000001700, eventType: "agent_start", nodeId: "node_007", data: { type: "tool", name: "sec-filing-reader" } },
    { timestamp: 1710000002400, eventType: "agent_end", nodeId: "node_007", data: { status: "completed" } },
    { timestamp: 1710000002500, eventType: "agent_start", nodeId: "node_008", data: { type: "tool", name: "comparable-analysis" } },
    { timestamp: 1710000003100, eventType: "agent_end", nodeId: "node_008", data: { status: "completed" } },
    { timestamp: 1710000003200, eventType: "agent_end", nodeId: "node_005", data: { status: "completed" } },
    { timestamp: 1710000003300, eventType: "agent_start", nodeId: "node_006", data: { type: "tool", name: "sentiment-api" } },
    { timestamp: 1710000003800, eventType: "tool_error", nodeId: "node_006", data: { error: "API rate limit exceeded (429)" } },
  ],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  completed: "#22c55e",
  failed: "#ef4444",
  running: "#f59e0b",
  hung: "#f97316",
  timeout: "#f97316",
};

const STATUS_BG = {
  completed: "rgba(34,197,94,0.08)",
  failed: "rgba(239,68,68,0.10)",
  running: "rgba(245,158,11,0.08)",
  hung: "rgba(249,115,22,0.08)",
  timeout: "rgba(249,115,22,0.08)",
};

const TYPE_COLORS = {
  agent: { bg: "#1e293b", text: "#94a3b8", border: "#334155" },
  tool: { bg: "#172554", text: "#60a5fa", border: "#1e3a5f" },
  subagent: { bg: "#1a2e05", text: "#86efac", border: "#2d4a0a" },
  decision: { bg: "#2e1065", text: "#c084fc", border: "#3b0764" },
  wait: { bg: "#431407", text: "#fdba74", border: "#5c1d0a" },
  custom: { bg: "#1e293b", text: "#94a3b8", border: "#334155" },
};

const TYPE_ICONS = {
  agent: Activity,
  tool: Zap,
  subagent: GitBranch,
  decision: Brain,
  wait: Timer,
  custom: Box,
};

function formatDuration(ms) {
  if (ms == null || ms < 0) return "running...";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTime(epoch) {
  return new Date(epoch).toISOString().slice(11, 23);
}

function formatOffset(ms) {
  if (ms < 1000) return `+${ms}ms`;
  return `+${(ms / 1000).toFixed(1)}s`;
}

function getNodeDuration(node) {
  if (node.endTime == null) return null;
  return node.endTime - node.startTime;
}

function getDfsOrder(nodes, rootId) {
  const order = [];
  function walk(id) {
    const node = nodes[id];
    if (!node) return;
    order.push(id);
    for (const childId of node.children) {
      walk(childId);
    }
  }
  walk(rootId);
  return order;
}

function getDepth(nodes, nodeId) {
  let depth = 0;
  let current = nodes[nodeId];
  while (current && current.parentId) {
    depth++;
    current = nodes[current.parentId];
  }
  return depth;
}

function getMaxDepth(nodes, rootId) {
  function walk(id) {
    const node = nodes[id];
    if (!node || node.children.length === 0) return 0;
    return 1 + Math.max(...node.children.map(walk));
  }
  return walk(rootId);
}

function getCriticalPath(nodes, rootId) {
  const path = new Set();
  function walk(id) {
    const node = nodes[id];
    if (!node) return 0;
    if (node.children.length === 0) {
      const dur = getNodeDuration(node) || 0;
      return { duration: dur, path: [id] };
    }
    let best = { duration: 0, path: [] };
    for (const childId of node.children) {
      const result = walk(childId);
      if (result.duration > best.duration) best = result;
    }
    const dur = getNodeDuration(node) || 0;
    return { duration: dur + best.duration, path: [id, ...best.path] };
  }
  const result = walk(rootId);
  result.path.forEach((id) => path.add(id));
  return path;
}

function getStats(trace) {
  const nodeList = Object.values(trace.nodes);
  const typeCounts = {};
  let failureCount = 0;
  for (const n of nodeList) {
    typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;
    if (n.status === "failed" || n.status === "hung" || n.status === "timeout") failureCount++;
  }
  return {
    totalNodes: nodeList.length,
    typeCounts,
    failureCount,
    totalDuration: trace.endTime ? trace.endTime - trace.startTime : null,
    maxDepth: getMaxDepth(trace.nodes, trace.rootNodeId),
  };
}

// ── Styles (inline, since we can't rely on Tailwind in all environments) ───

const FONT_MONO = '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace';
const FONT_SANS = '"DM Sans", "Inter", -apple-system, sans-serif';

const colors = {
  bg: "#0f1219",
  surface: "#161b26",
  surfaceHover: "#1c2333",
  border: "#1e2533",
  borderLight: "#2a3347",
  text: "#e2e8f0",
  textMuted: "#64748b",
  textDim: "#475569",
  accent: "#2dd4bf",
  accentDim: "rgba(45,212,191,0.12)",
};

// ── Components ──────────────────────────────────────────────────────────────

function StatusDot({ status, size = 8 }) {
  const color = STATUS_COLORS[status] || "#64748b";
  const isAnimated = status === "running";
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: color,
        flexShrink: 0,
        boxShadow: isAnimated ? `0 0 6px ${color}` : "none",
        animation: isAnimated ? "pulse 2s ease-in-out infinite" : "none",
      }}
    />
  );
}

function TypeBadge({ type }) {
  const c = TYPE_COLORS[type] || TYPE_COLORS.custom;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "1px 6px",
        borderRadius: 4,
        fontSize: 10,
        fontFamily: FONT_MONO,
        fontWeight: 500,
        letterSpacing: "0.02em",
        backgroundColor: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
        lineHeight: "16px",
        whiteSpace: "nowrap",
      }}
    >
      {type}
    </span>
  );
}

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || "#64748b";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontFamily: FONT_MONO,
        fontWeight: 500,
        backgroundColor: STATUS_BG[status] || "transparent",
        color: color,
        border: `1px solid ${color}33`,
      }}
    >
      <StatusDot status={status} size={6} />
      {status}
    </span>
  );
}

// ── Tree Node ───────────────────────────────────────────────────────────────

function TreeNode({ node, nodes, depth, selectedId, onSelect, collapsed, onToggle, criticalPath }) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsed.has(node.id);
  const isSelected = selectedId === node.id;
  const isCritical = criticalPath.has(node.id);
  const isFailed = node.status === "failed" || node.status === "hung" || node.status === "timeout";
  const duration = getNodeDuration(node);

  return (
    <>
      <div
        onClick={() => onSelect(node.id)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "3px 8px",
          paddingLeft: depth * 16 + 8,
          cursor: "pointer",
          backgroundColor: isSelected
            ? colors.accentDim
            : isFailed
            ? "rgba(239,68,68,0.04)"
            : "transparent",
          borderLeft: isSelected ? `2px solid ${colors.accent}` : "2px solid transparent",
          borderRight: isCritical && !isSelected ? `2px solid ${colors.accent}33` : "2px solid transparent",
          transition: "background-color 150ms ease",
          minHeight: 28,
        }}
        onMouseEnter={(e) => {
          if (!isSelected) e.currentTarget.style.backgroundColor = colors.surfaceHover;
        }}
        onMouseLeave={(e) => {
          if (!isSelected)
            e.currentTarget.style.backgroundColor = isFailed ? "rgba(239,68,68,0.04)" : "transparent";
        }}
      >
        {/* Expand/collapse toggle */}
        <span
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggle(node.id);
          }}
          style={{
            width: 14,
            height: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            color: colors.textDim,
            cursor: hasChildren ? "pointer" : "default",
          }}
        >
          {hasChildren ? (
            isCollapsed ? (
              <ChevronRight size={12} />
            ) : (
              <ChevronDown size={12} />
            )
          ) : (
            <span style={{ width: 12 }} />
          )}
        </span>

        <StatusDot status={node.status} />

        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 12,
            color: isSelected ? colors.text : isFailed ? "#fca5a5" : colors.text,
            fontWeight: isSelected ? 600 : 400,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
        >
          {node.name}
        </span>

        <TypeBadge type={node.type} />

        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 10,
            color: colors.textMuted,
            flexShrink: 0,
            marginLeft: 2,
          }}
        >
          {formatDuration(duration)}
        </span>
      </div>

      {/* Render children */}
      {hasChildren &&
        !isCollapsed &&
        node.children.map((childId) => {
          const child = nodes[childId];
          if (!child) return null;
          return (
            <TreeNode
              key={childId}
              node={child}
              nodes={nodes}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              collapsed={collapsed}
              onToggle={onToggle}
              criticalPath={criticalPath}
            />
          );
        })}
    </>
  );
}

// ── Detail Panel ────────────────────────────────────────────────────────────

function MetadataSection({ metadata }) {
  if (!metadata || Object.keys(metadata).length === 0) return null;

  const promptTokens = metadata["gen_ai.usage.prompt_tokens"];
  const completionTokens = metadata["gen_ai.usage.completion_tokens"];
  const model = metadata["gen_ai.request.model"];
  const error = metadata["error"];
  const errorStack = metadata["errorStack"];

  const otherKeys = Object.keys(metadata).filter(
    (k) =>
      !k.startsWith("gen_ai.") && k !== "error" && k !== "errorStack"
  );

  const [stackExpanded, setStackExpanded] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        style={{
          fontSize: 11,
          fontFamily: FONT_SANS,
          fontWeight: 600,
          color: colors.textMuted,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        Metadata
      </div>

      {model && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: colors.textMuted, fontFamily: FONT_SANS, minWidth: 48 }}>
            Model
          </span>
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 12,
              color: colors.accent,
              padding: "1px 6px",
              backgroundColor: colors.accentDim,
              borderRadius: 4,
            }}
          >
            {model}
          </span>
        </div>
      )}

      {promptTokens != null && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: colors.textMuted, fontFamily: FONT_SANS, minWidth: 48 }}>
            Tokens
          </span>
          <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: colors.text }}>
            {promptTokens.toLocaleString()} in / {(completionTokens || 0).toLocaleString()} out
            <span style={{ color: colors.textMuted, marginLeft: 4 }}>
              ({((promptTokens || 0) + (completionTokens || 0)).toLocaleString()} total)
            </span>
          </span>
        </div>
      )}

      {error && (
        <div
          style={{
            backgroundColor: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 6,
            padding: "8px 12px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: errorStack ? 6 : 0,
            }}
          >
            <XCircle size={14} color="#ef4444" />
            <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: "#fca5a5" }}>{error}</span>
          </div>
          {errorStack && (
            <>
              <div
                onClick={() => setStackExpanded(!stackExpanded)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  cursor: "pointer",
                  fontSize: 11,
                  color: colors.textMuted,
                  fontFamily: FONT_SANS,
                  userSelect: "none",
                }}
              >
                {stackExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                Stack trace
              </div>
              {stackExpanded && (
                <pre
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 11,
                    color: "#fca5a5",
                    margin: "6px 0 0",
                    padding: 0,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    lineHeight: 1.5,
                  }}
                >
                  {errorStack}
                </pre>
              )}
            </>
          )}
        </div>
      )}

      {otherKeys.map((key) => (
        <div key={key} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
          <span
            style={{
              fontSize: 11,
              color: colors.textMuted,
              fontFamily: FONT_MONO,
              minWidth: 48,
              flexShrink: 0,
            }}
          >
            {key}
          </span>
          <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: colors.text }}>
            {typeof metadata[key] === "object" ? JSON.stringify(metadata[key]) : String(metadata[key])}
          </span>
        </div>
      ))}
    </div>
  );
}

function StateSection({ state }) {
  const [expanded, setExpanded] = useState(true);
  if (!state || Object.keys(state).length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          fontSize: 11,
          fontFamily: FONT_SANS,
          fontWeight: 600,
          color: colors.textMuted,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 4,
          userSelect: "none",
        }}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        State
      </div>
      {expanded && (
        <pre
          style={{
            fontFamily: FONT_MONO,
            fontSize: 11,
            color: colors.text,
            backgroundColor: colors.bg,
            border: `1px solid ${colors.border}`,
            borderRadius: 6,
            padding: "8px 12px",
            margin: 0,
            whiteSpace: "pre-wrap",
            lineHeight: 1.5,
            overflowX: "auto",
          }}
        >
          {JSON.stringify(state, null, 2)}
        </pre>
      )}
    </div>
  );
}

function EventsSection({ events, graphStart }) {
  if (!events || events.length === 0) return null;
  const [expanded, setExpanded] = useState(true);

  const eventTypeColors = {
    agent_start: "#22c55e",
    agent_end: "#22c55e",
    tool_start: "#60a5fa",
    tool_end: "#60a5fa",
    tool_error: "#ef4444",
    subagent_spawn: "#86efac",
    decision: "#c084fc",
    timeout: "#f97316",
    custom: "#94a3b8",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          fontSize: 11,
          fontFamily: FONT_SANS,
          fontWeight: 600,
          color: colors.textMuted,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 4,
          userSelect: "none",
        }}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Events ({events.length})
      </div>
      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {events.map((event, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "3px 0",
                fontSize: 11,
              }}
            >
              <span
                style={{
                  fontFamily: FONT_MONO,
                  color: colors.textDim,
                  minWidth: 56,
                  flexShrink: 0,
                }}
              >
                {formatOffset(event.timestamp - graphStart)}
              </span>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: eventTypeColors[event.eventType] || "#94a3b8",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontFamily: FONT_MONO,
                  color: eventTypeColors[event.eventType] || colors.textMuted,
                  minWidth: 90,
                  flexShrink: 0,
                }}
              >
                {event.eventType}
              </span>
              <span style={{ fontFamily: FONT_MONO, color: colors.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {Object.keys(event.data).length > 0 ? JSON.stringify(event.data) : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailPanel({ node, trace, onSelect }) {
  if (!node) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: colors.textDim,
          fontFamily: FONT_SANS,
          fontSize: 13,
        }}
      >
        Select a node to inspect
      </div>
    );
  }

  const duration = getNodeDuration(node);
  const nodeEvents = trace.events.filter((e) => e.nodeId === node.id);
  const Icon = TYPE_ICONS[node.type] || Box;

  return (
    <div
      style={{
        padding: 16,
        overflowY: "auto",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Icon size={16} color={TYPE_COLORS[node.type]?.text || colors.textMuted} />
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 16,
              fontWeight: 600,
              color: colors.text,
            }}
          >
            {node.name}
          </span>
          <TypeBadge type={node.type} />
          <StatusBadge status={node.status} />
        </div>
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 11,
            color: colors.textDim,
          }}
        >
          {node.id}
        </div>
      </div>

      {/* Timing */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
        }}
      >
        {[
          { label: "Start", value: formatTime(node.startTime) },
          { label: "End", value: node.endTime ? formatTime(node.endTime) : "—" },
          { label: "Duration", value: formatDuration(duration) },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              backgroundColor: colors.bg,
              border: `1px solid ${colors.border}`,
              borderRadius: 6,
              padding: "8px 10px",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontFamily: FONT_SANS,
                color: colors.textMuted,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 2,
              }}
            >
              {item.label}
            </div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 13, color: colors.text }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <div style={{ height: 1, backgroundColor: colors.border }} />

      <MetadataSection metadata={node.metadata} />
      <StateSection state={node.state} />

      {/* Children */}
      {node.children.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div
            style={{
              fontSize: 11,
              fontFamily: FONT_SANS,
              fontWeight: 600,
              color: colors.textMuted,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Children ({node.children.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {node.children.map((childId) => {
              const child = trace.nodes[childId];
              if (!child) return null;
              return (
                <div
                  key={childId}
                  onClick={() => onSelect(childId)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 8px",
                    borderRadius: 4,
                    cursor: "pointer",
                    transition: "background-color 150ms",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.surfaceHover)}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <StatusDot status={child.status} size={6} />
                  <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: colors.text }}>
                    {child.name}
                  </span>
                  <TypeBadge type={child.type} />
                  <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: colors.textMuted, marginLeft: "auto" }}>
                    {formatDuration(getNodeDuration(child))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ height: 1, backgroundColor: colors.border }} />

      <EventsSection events={nodeEvents} graphStart={trace.startTime} />
    </div>
  );
}

// ── Timeline ────────────────────────────────────────────────────────────────

function Timeline({ trace, selectedId, onSelect, dfsOrder }) {
  const containerRef = useRef(null);
  const totalDuration = trace.endTime ? trace.endTime - trace.startTime : 1;
  const barHeight = 20;
  const rowGap = 2;
  const labelWidth = 120;
  const rightPad = 16;

  // Only show visible nodes (in DFS order)
  const visibleNodes = dfsOrder.map((id) => trace.nodes[id]).filter(Boolean);
  const totalHeight = visibleNodes.length * (barHeight + rowGap) + 8;

  // Tick marks
  const tickCount = 6;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => (totalDuration / tickCount) * i);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        overflowX: "auto",
        overflowY: "auto",
        position: "relative",
        fontFamily: FONT_MONO,
      }}
    >
      {/* Tick labels */}
      <div
        style={{
          display: "flex",
          marginLeft: labelWidth,
          marginRight: rightPad,
          marginBottom: 2,
          position: "sticky",
          top: 0,
          backgroundColor: colors.surface,
          zIndex: 2,
          paddingTop: 4,
          paddingBottom: 4,
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        {ticks.map((t, i) => (
          <span
            key={i}
            style={{
              position: "absolute",
              left: `${(t / totalDuration) * 100}%`,
              fontSize: 9,
              color: colors.textDim,
              transform: "translateX(-50%)",
              whiteSpace: "nowrap",
            }}
          >
            {formatDuration(Math.round(t))}
          </span>
        ))}
      </div>

      <div style={{ position: "relative", minHeight: totalHeight, paddingTop: 4 }}>
        {/* Grid lines */}
        {ticks.map((t, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `calc(${labelWidth}px + ${(t / totalDuration) * (100 - ((labelWidth + rightPad) / (containerRef.current?.clientWidth || 800)) * 100)}%)`,
              top: 0,
              bottom: 0,
              width: 1,
              backgroundColor: colors.border,
              opacity: 0.5,
              pointerEvents: "none",
            }}
          />
        ))}

        {visibleNodes.map((node, rowIndex) => {
          const start = node.startTime - trace.startTime;
          const end = (node.endTime || trace.endTime || node.startTime + 100) - trace.startTime;
          const leftPct = (start / totalDuration) * 100;
          const widthPct = Math.max(((end - start) / totalDuration) * 100, 0.5);
          const isSelected = selectedId === node.id;
          const barColor = STATUS_COLORS[node.status] || "#64748b";
          const nodeDepth = getDepth(trace.nodes, node.id);

          return (
            <div
              key={node.id}
              onClick={() => onSelect(node.id)}
              style={{
                position: "relative",
                height: barHeight,
                marginBottom: rowGap,
                display: "flex",
                alignItems: "center",
                cursor: "pointer",
              }}
            >
              {/* Node label */}
              <div
                style={{
                  width: labelWidth,
                  flexShrink: 0,
                  paddingLeft: nodeDepth * 10 + 4,
                  fontSize: 10,
                  color: isSelected ? colors.accent : colors.textMuted,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {node.name}
              </div>

              {/* Bar area */}
              <div style={{ flex: 1, position: "relative", height: "100%", marginRight: rightPad }}>
                <div
                  style={{
                    position: "absolute",
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    top: 2,
                    height: barHeight - 4,
                    backgroundColor: barColor,
                    opacity: isSelected ? 1 : 0.7,
                    borderRadius: 3,
                    transition: "opacity 150ms ease",
                    boxShadow: isSelected ? `0 0 8px ${barColor}44, 0 0 2px ${barColor}88` : "none",
                    minWidth: 4,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = isSelected ? "1" : "0.7")}
                />
                {/* Duration label on bar */}
                {widthPct > 5 && (
                  <span
                    style={{
                      position: "absolute",
                      left: `calc(${leftPct}% + 4px)`,
                      top: "50%",
                      transform: "translateY(-50%)",
                      fontSize: 9,
                      color: "#fff",
                      pointerEvents: "none",
                      textShadow: "0 1px 2px rgba(0,0,0,0.5)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatDuration(end - start)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Load Trace Modal ────────────────────────────────────────────────────────

function LoadTraceModal({ onLoad, onClose }) {
  const [text, setText] = useState("");
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const handleLoad = useCallback(() => {
    try {
      const parsed = JSON.parse(text);
      if (!parsed.nodes || !parsed.rootNodeId) {
        setError("Invalid trace: missing 'nodes' or 'rootNodeId'");
        return;
      }
      onLoad(parsed);
      onClose();
    } catch (e) {
      setError(`Parse error: ${e.message}`);
    }
  }, [text, onLoad, onClose]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setText(ev.target.result);
      reader.readAsText(file);
    }
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: 10,
          width: 560,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 48px rgba(0,0,0,0.4)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          <span style={{ fontFamily: FONT_SANS, fontWeight: 600, color: colors.text, fontSize: 14 }}>
            Load Trace JSON
          </span>
          <X
            size={16}
            color={colors.textMuted}
            style={{ cursor: "pointer" }}
            onClick={onClose}
          />
        </div>

        <div
          style={{ padding: 16, flex: 1, display: "flex", flexDirection: "column", gap: 8 }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setError(null); }}
            placeholder="Paste trace JSON here, or drag & drop a .json file..."
            style={{
              width: "100%",
              height: 280,
              backgroundColor: colors.bg,
              color: colors.text,
              fontFamily: FONT_MONO,
              fontSize: 12,
              border: `1px solid ${dragOver ? colors.accent : colors.border}`,
              borderRadius: 6,
              padding: 12,
              resize: "none",
              outline: "none",
              lineHeight: 1.5,
              transition: "border-color 150ms",
            }}
          />

          {error && (
            <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: "#ef4444" }}>{error}</div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "12px 16px",
            borderTop: `1px solid ${colors.border}`,
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: `1px solid ${colors.border}`,
              backgroundColor: "transparent",
              color: colors.textMuted,
              fontFamily: FONT_SANS,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleLoad}
            disabled={!text.trim()}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: "none",
              backgroundColor: text.trim() ? colors.accent : colors.textDim,
              color: text.trim() ? colors.bg : colors.textMuted,
              fontFamily: FONT_SANS,
              fontSize: 12,
              fontWeight: 600,
              cursor: text.trim() ? "pointer" : "not-allowed",
            }}
          >
            Load Trace
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main App ────────────────────────────────────────────────────────────────

export default function TraceExplorer() {
  const [trace, setTrace] = useState(DEFAULT_TRACE);
  const [selectedId, setSelectedId] = useState(trace.rootNodeId);
  const [collapsed, setCollapsed] = useState(new Set());
  const [showModal, setShowModal] = useState(false);

  const stats = useMemo(() => getStats(trace), [trace]);
  const criticalPath = useMemo(() => getCriticalPath(trace.nodes, trace.rootNodeId), [trace]);
  const dfsOrder = useMemo(() => getDfsOrder(trace.nodes, trace.rootNodeId), [trace]);

  const selectedNode = trace.nodes[selectedId] || null;

  const handleSelect = useCallback((id) => setSelectedId(id), []);

  const handleToggle = useCallback(
    (id) =>
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    []
  );

  const handleLoadTrace = useCallback((newTrace) => {
    setTrace(newTrace);
    setSelectedId(newTrace.rootNodeId);
    setCollapsed(new Set());
  }, []);

  return (
    <>
      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${colors.borderLight}; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: ${colors.textDim}; }
      `}</style>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          width: "100vw",
          backgroundColor: colors.bg,
          color: colors.text,
          fontFamily: FONT_SANS,
          overflow: "hidden",
        }}
      >
        {/* ── Top Bar ─────────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "8px 16px",
            borderBottom: `1px solid ${colors.border}`,
            backgroundColor: colors.surface,
            flexShrink: 0,
            minHeight: 44,
          }}
        >
          {/* Logo / title */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Activity size={16} color={colors.accent} />
            <span style={{ fontFamily: FONT_SANS, fontWeight: 700, fontSize: 13, color: colors.text }}>
              AgentFlow
            </span>
            <span style={{ fontFamily: FONT_SANS, fontSize: 11, color: colors.textDim }}>
              Trace Explorer
            </span>
          </div>

          <div style={{ width: 1, height: 20, backgroundColor: colors.border }} />

          {/* Agent ID */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 11, color: colors.textMuted }}>Agent</span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: colors.text, fontWeight: 500 }}>
              {trace.agentId}
            </span>
          </div>

          {/* Trigger */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 11, color: colors.textMuted }}>Trigger</span>
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 11,
                color: colors.textMuted,
                padding: "1px 5px",
                backgroundColor: colors.bg,
                borderRadius: 3,
                border: `1px solid ${colors.border}`,
              }}
            >
              {trace.trigger}
            </span>
          </div>

          {/* Status */}
          <StatusBadge status={trace.status} />

          {/* Stats */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginLeft: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Clock size={12} color={colors.textMuted} />
              <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: colors.text }}>
                {formatDuration(stats.totalDuration)}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Box size={12} color={colors.textMuted} />
              <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: colors.text }}>
                {stats.totalNodes} nodes
              </span>
            </div>
            {stats.failureCount > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <AlertTriangle size={12} color="#ef4444" />
                <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: "#ef4444" }}>
                  {stats.failureCount} failed
                </span>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <GitBranch size={12} color={colors.textMuted} />
              <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: colors.textMuted }}>
                depth {stats.maxDepth}
              </span>
            </div>

            <div style={{ width: 1, height: 20, backgroundColor: colors.border }} />

            <button
              onClick={() => setShowModal(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 12px",
                borderRadius: 6,
                border: `1px solid ${colors.borderLight}`,
                backgroundColor: colors.surface,
                color: colors.text,
                fontFamily: FONT_SANS,
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 150ms",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = colors.surfaceHover;
                e.currentTarget.style.borderColor = colors.accent;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = colors.surface;
                e.currentTarget.style.borderColor = colors.borderLight;
              }}
            >
              <Upload size={12} />
              Load Trace
            </button>
          </div>
        </div>

        {/* ── Main Content ────────────────────────────────────────────── */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* ── Tree Panel ──────────────────────────────────────────── */}
          <div
            style={{
              width: 300,
              flexShrink: 0,
              borderRight: `1px solid ${colors.border}`,
              backgroundColor: colors.surface,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "8px 12px",
                borderBottom: `1px solid ${colors.border}`,
                fontSize: 11,
                fontFamily: FONT_SANS,
                fontWeight: 600,
                color: colors.textMuted,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span>Execution Tree</span>
              <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                {stats.totalNodes} nodes
              </span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", paddingTop: 4, paddingBottom: 4 }}>
              {trace.nodes[trace.rootNodeId] && (
                <TreeNode
                  node={trace.nodes[trace.rootNodeId]}
                  nodes={trace.nodes}
                  depth={0}
                  selectedId={selectedId}
                  onSelect={handleSelect}
                  collapsed={collapsed}
                  onToggle={handleToggle}
                  criticalPath={criticalPath}
                />
              )}
            </div>
          </div>

          {/* ── Detail + Timeline ───────────────────────────────────── */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Detail panel */}
            <div
              style={{
                flex: 1,
                overflow: "hidden",
                backgroundColor: colors.surface,
              }}
            >
              <DetailPanel node={selectedNode} trace={trace} onSelect={handleSelect} />
            </div>

            {/* Timeline */}
            <div
              style={{
                height: 190,
                flexShrink: 0,
                borderTop: `1px solid ${colors.border}`,
                backgroundColor: colors.surface,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "6px 12px",
                  borderBottom: `1px solid ${colors.border}`,
                  fontSize: 11,
                  fontFamily: FONT_SANS,
                  fontWeight: 600,
                  color: colors.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  flexShrink: 0,
                }}
              >
                Timeline
              </div>
              <div style={{ flex: 1, overflow: "hidden" }}>
                <Timeline
                  trace={trace}
                  selectedId={selectedId}
                  onSelect={handleSelect}
                  dfsOrder={dfsOrder}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {showModal && <LoadTraceModal onLoad={handleLoadTrace} onClose={() => setShowModal(false)} />}
    </>
  );
}
