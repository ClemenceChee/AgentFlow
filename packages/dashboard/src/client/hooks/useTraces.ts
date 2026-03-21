import { useCallback, useEffect, useState } from 'react';

export interface TraceEntry {
  filename: string;
  /** Unique key — filename for single-entry files, id for multi-entry (OpenClaw JSONL) */
  traceKey: string;
  agentId: string;
  graphId: string;
  status: string;
  nodeCount: number;
  duration: number;
  timestamp: number;
  trigger: string;
}

/** Map raw API trace (full ExecutionGraph) to our slim TraceEntry. */
function mapTrace(raw: Record<string, unknown>): TraceEntry {
  const nodes = raw.nodes;
  const nodeCount = nodes instanceof Map
    ? nodes.size
    : typeof nodes === 'object' && nodes !== null
      ? Object.keys(nodes).length
      : 0;

  const startTime = typeof raw.startTime === 'number' ? raw.startTime : 0;
  const endTime = typeof raw.endTime === 'number' ? raw.endTime : startTime;

  const filename = (raw.filename as string) ?? '';
  const id = (raw.id as string) ?? '';
  // Build a unique key: prefer id if meaningful, otherwise filename+startTime
  let traceKey: string;
  if (id && id !== 'default' && id !== filename) {
    traceKey = id;
  } else {
    // Combine filename + startTime to disambiguate multiple traces from same file
    traceKey = `${filename}::${startTime}`;
  }

  return {
    filename,
    traceKey,
    agentId: (raw.agentId as string) ?? 'unknown',
    graphId: id,
    status: (raw.status as string) ?? 'unknown',
    nodeCount,
    duration: endTime - startTime,
    timestamp: startTime,
    trigger: (raw.trigger as string) ?? '',
  };
}

const POLL_INTERVAL = 15_000;

export function useTraces(): TraceEntry[] {
  const [traces, setTraces] = useState<TraceEntry[]>([]);

  const fetchTraces = useCallback(async () => {
    try {
      const all: TraceEntry[] = [];
      let cursor: string | undefined;
      // Paginate through all traces (slim TraceEntry objects, not full graphs)
      do {
        const url = cursor ? `/api/traces?limit=200&cursor=${cursor}` : '/api/traces?limit=200';
        const res = await fetch(url);
        if (!res.ok) break;
        const json = await res.json();
        const list = Array.isArray(json) ? json : json.traces;
        if (Array.isArray(list)) {
          all.push(...list.map(mapTrace));
        }
        cursor = json.nextCursor ?? undefined;
      } while (cursor);
      setTraces(all);
    } catch {
      // Retry on next interval
    }
  }, []);

  useEffect(() => {
    fetchTraces();
    const id = setInterval(fetchTraces, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchTraces]);

  return traces;
}
