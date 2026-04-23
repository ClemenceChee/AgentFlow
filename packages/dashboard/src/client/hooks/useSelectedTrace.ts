import { useCallback, useState } from 'react';
import type {
  OperatorContext,
  PolicyStatus,
  SessionCorrelation,
  SessionHookData,
} from '../types/organizational.js';

export interface TraceNode {
  id: string;
  type: string;
  name: string;
  startTime: number;
  endTime: number | null;
  status: string;
  parentId: string | null;
  children: string[];
  metadata: Record<string, unknown>;
  state: Record<string, unknown>;
}

export interface TraceEdge {
  from: string;
  to: string;
  type: string;
}

export interface SessionEvent {
  role: string;
  content: string;
  timestamp?: number;
  model?: string;
  tokenCount?: number;
  toolName?: string;
  toolArgs?: string;
  toolResult?: string;
  error?: string;
}

export interface FullTrace {
  id: string;
  agentId: string;
  name: string;
  trigger: string;
  status: string;
  startTime: number;
  endTime: number;
  filename: string;
  nodes: Record<string, TraceNode>;
  edges: TraceEdge[];
  metadata: Record<string, unknown>;
  sessionEvents: SessionEvent[];

  // Organizational context extensions
  /** Operator context for organizational tracking */
  operatorContext?: OperatorContext;
  /** Session correlation data */
  sessionCorrelation?: SessionCorrelation;
  /** Policy compliance status */
  policyStatus?: PolicyStatus;
  /** Session hook execution data */
  sessionHooks?: SessionHookData;
}

export function useSelectedTrace() {
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null);
  const [trace, setTrace] = useState<FullTrace | null>(null);
  const [loading, setLoading] = useState(false);

  const selectTrace = useCallback(
    async (filename: string, agentId?: string) => {
      if (filename === selectedFilename) return;
      setSelectedFilename(filename);
      setLoading(true);
      try {
        let url = `/api/traces/${encodeURIComponent(filename)}`;
        if (agentId) url += `?agent=${encodeURIComponent(agentId)}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setTrace(data);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    },
    [selectedFilename],
  );

  const clearSelection = useCallback(() => {
    setSelectedFilename(null);
    setTrace(null);
  }, []);

  return { trace, loading, selectedFilename, selectTrace, clearSelection };
}
