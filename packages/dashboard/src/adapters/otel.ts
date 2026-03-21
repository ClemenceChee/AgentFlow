/**
 * OpenTelemetry trace adapter.
 *
 * Reads OTLP JSON export files and HTTP POST payloads.
 * Maps GenAI semantic convention attributes to AgentFlow node types.
 *
 * @module
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NormalizedNode, NormalizedTrace, TraceAdapter } from './types.js';

// GenAI semantic convention span name → AgentFlow node type
const SPAN_TYPE_MAP: Record<string, string> = {
  'gen_ai.chat': 'llm',
  'gen_ai.completion': 'llm',
  'gen_ai.embeddings': 'embedding',
  'gen_ai.content.prompt': 'llm',
  'gen_ai.content.completion': 'llm',
};

function mapSpanType(spanName: string, attributes: Record<string, unknown>): string {
  // Check name-based mapping
  for (const [prefix, type] of Object.entries(SPAN_TYPE_MAP)) {
    if (spanName.startsWith(prefix)) return type;
  }
  // Check attributes
  if (attributes['tool.name'] || attributes['code.function']) return 'tool';
  if (attributes['gen_ai.system'] || attributes['llm.vendor']) return 'llm';
  if (attributes['db.system']) return 'database';
  if (attributes['http.method'] || attributes['http.request.method']) return 'http';
  return 'span';
}

function extractAttributes(attrs: unknown[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!Array.isArray(attrs)) return result;
  for (const attr of attrs) {
    const a = attr as {
      key?: string;
      value?: {
        stringValue?: string;
        intValue?: number;
        doubleValue?: number;
        boolValue?: boolean;
      };
    };
    if (!a.key || !a.value) continue;
    result[a.key] =
      a.value.stringValue ?? a.value.intValue ?? a.value.doubleValue ?? a.value.boolValue;
  }
  return result;
}

interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind?: number;
  startTimeUnixNano?: string;
  endTimeUnixNano?: string;
  attributes?: unknown[];
  status?: { code?: number; message?: string };
}

interface OtlpPayload {
  resourceSpans?: {
    resource?: { attributes?: unknown[] };
    scopeSpans?: { spans?: OtlpSpan[] }[];
  }[];
}

/** Parse an OTLP JSON payload (file or HTTP body) into normalized traces. */
export function parseOtlpPayload(payload: OtlpPayload): NormalizedTrace[] {
  const traceMap = new Map<string, { spans: OtlpSpan[]; resource: Record<string, unknown> }>();

  for (const rs of payload.resourceSpans ?? []) {
    const resourceAttrs = extractAttributes(rs.resource?.attributes ?? []);
    for (const ss of rs.scopeSpans ?? []) {
      for (const span of ss.spans ?? []) {
        if (!span.traceId) continue;
        let entry = traceMap.get(span.traceId);
        if (!entry) {
          entry = { spans: [], resource: resourceAttrs };
          traceMap.set(span.traceId, entry);
        }
        entry.spans.push(span);
      }
    }
  }

  const traces: NormalizedTrace[] = [];

  for (const [traceId, { spans, resource }] of traceMap) {
    const nodes: Record<string, NormalizedNode> = {};
    const childMap = new Map<string, string[]>();
    let traceStart = Number.MAX_SAFE_INTEGER;
    let traceEnd = 0;
    let hasFailed = false;

    for (const span of spans) {
      const attrs = extractAttributes(span.attributes ?? []);
      const startNs = span.startTimeUnixNano
        ? Number(BigInt(span.startTimeUnixNano) / 1_000_000n)
        : 0;
      const endNs = span.endTimeUnixNano ? Number(BigInt(span.endTimeUnixNano) / 1_000_000n) : null;
      const failed = span.status?.code === 2;
      if (failed) hasFailed = true;
      if (startNs < traceStart) traceStart = startNs;
      if (endNs && endNs > traceEnd) traceEnd = endNs;

      nodes[span.spanId] = {
        id: span.spanId,
        type: mapSpanType(span.name, attrs),
        name: span.name,
        status: failed ? 'failed' : endNs ? 'completed' : 'running',
        startTime: startNs,
        endTime: endNs,
        parentId: span.parentSpanId ?? null,
        children: [],
        metadata: {
          ...attrs,
          model: attrs['gen_ai.request.model'] ?? attrs['llm.request.model'],
          inputTokens: attrs['gen_ai.usage.input_tokens'] ?? attrs['llm.usage.input_tokens'],
          outputTokens: attrs['gen_ai.usage.output_tokens'] ?? attrs['llm.usage.output_tokens'],
        },
      };

      if (span.parentSpanId) {
        const siblings = childMap.get(span.parentSpanId) ?? [];
        siblings.push(span.spanId);
        childMap.set(span.parentSpanId, siblings);
      }
    }

    // Wire children
    for (const [parentId, children] of childMap) {
      if (nodes[parentId]) {
        nodes[parentId].children = children;
      }
    }

    const serviceName = (resource['service.name'] as string) ?? 'unknown-service';

    traces.push({
      id: traceId,
      agentId: `otel:${serviceName}`,
      name: spans.find((s) => !s.parentSpanId)?.name ?? traceId,
      status: hasFailed ? 'failed' : 'completed',
      startTime: traceStart === Number.MAX_SAFE_INTEGER ? 0 : traceStart,
      endTime: traceEnd,
      trigger: 'otel',
      source: 'otel',
      nodes,
      metadata: { ...resource },
    });
  }

  return traces;
}

export class OTelAdapter implements TraceAdapter {
  readonly name = 'otel';

  detect(dirPath: string): boolean {
    try {
      if (existsSync(join(dirPath, 'otel-traces'))) return true;
      const files = readdirSync(dirPath);
      return files.some((f) => f.endsWith('.otlp.json'));
    } catch {
      return false;
    }
  }

  canHandle(filePath: string): boolean {
    return filePath.endsWith('.otlp.json');
  }

  parse(filePath: string): NormalizedTrace[] {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const payload = JSON.parse(content) as OtlpPayload;
      const traces = parseOtlpPayload(payload);
      for (const t of traces) t.filePath = filePath;
      return traces;
    } catch {
      return [];
    }
  }
}
