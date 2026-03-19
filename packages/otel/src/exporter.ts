import { type Span, SpanKind, SpanStatusCode, type Tracer, trace } from '@opentelemetry/api';
import type { ExecutionGraph, ExecutionNode } from 'agentflow-core';

/**
 * OpenTelemetry exporter for AgentFlow execution graphs
 * Converts AgentFlow traces to OTel spans following GenAI semantic conventions
 */
export class AgentFlowOTelExporter {
  private tracer: Tracer;

  constructor(_serviceName: string = 'agentflow') {
    this.tracer = trace.getTracer('agentflow-otel', '0.1.0');
  }

  /**
   * Export an AgentFlow execution graph to OpenTelemetry
   */
  async exportGraph(graph: ExecutionGraph): Promise<void> {
    const rootSpan = this.createSpanFromNode(graph.nodes.get(graph.rootId)!, graph);

    // Create spans for all nodes in topological order
    const processedNodes = new Set<string>();
    await this.processNodeHierarchy(graph.rootId, graph, rootSpan, processedNodes);

    rootSpan.end();
  }

  private async processNodeHierarchy(
    nodeId: string,
    graph: ExecutionGraph,
    parentSpan: Span | null,
    processed: Set<string>,
  ): Promise<void> {
    if (processed.has(nodeId)) return;
    processed.add(nodeId);

    const node = graph.nodes.get(nodeId)!;
    let span: Span;

    if (parentSpan) {
      span = this.createChildSpan(node, graph, parentSpan);
    } else {
      span = this.createSpanFromNode(node, graph);
    }

    // Process children
    for (const [childId, childNode] of graph.nodes) {
      if (childNode.parentId === nodeId) {
        await this.processNodeHierarchy(childId, graph, span, processed);
      }
    }

    span.end();
  }

  private createSpanFromNode(node: ExecutionNode, graph: ExecutionGraph): Span {
    const spanName = this.getOTelSpanName(node);
    const span = this.tracer.startSpan(spanName, {
      kind: this.getSpanKind(node),
      startTime: node.startTime,
    });

    this.setSpanAttributes(span, node, graph);
    this.setSpanStatus(span, node);

    if (node.endTime) {
      span.setAttributes({ 'agentflow.duration_ms': node.endTime - node.startTime });
    }

    return span;
  }

  private createChildSpan(node: ExecutionNode, _graph: ExecutionGraph, parent: Span): Span {
    return this.tracer.startSpan(
      this.getOTelSpanName(node),
      {
        kind: this.getSpanKind(node),
        startTime: node.startTime,
      },
      trace.setSpan(trace.active(), parent),
    );
  }

  /**
   * Map AgentFlow node types to OTel GenAI semantic convention span names
   */
  private getOTelSpanName(node: ExecutionNode): string {
    switch (node.type) {
      case 'agent':
        return 'agent.execution';
      case 'subagent':
        return 'agent.subagent';
      case 'tool':
        // Check if this is an LLM call based on metadata
        if (this.isLLMCall(node)) {
          return 'llm.generation';
        }
        if (this.isEmbeddingCall(node)) {
          return 'llm.embedding';
        }
        if (this.isVectorSearch(node)) {
          return 'vectordb.search';
        }
        return 'agent.tool';
      case 'reasoning':
        return 'agent.reasoning';
      case 'decision':
        return 'agent.decision';
      case 'wait':
        return 'agent.wait';
      default:
        return `agent.${node.type}`;
    }
  }

  private getSpanKind(node: ExecutionNode): SpanKind {
    switch (node.type) {
      case 'agent':
      case 'subagent':
        return SpanKind.SERVER;
      case 'tool':
        return SpanKind.CLIENT;
      default:
        return SpanKind.INTERNAL;
    }
  }

  /**
   * Set OTel attributes following GenAI semantic conventions
   */
  private setSpanAttributes(span: Span, node: ExecutionNode, graph: ExecutionGraph): void {
    // Standard AgentFlow attributes
    span.setAttributes({
      'agentflow.agent.id': graph.agentId,
      'agentflow.node.type': node.type,
      'agentflow.node.name': node.name,
      'agentflow.node.id': node.id,
      'agentflow.graph.trigger': graph.trigger || 'unknown',
    });

    // Parent relationship
    if (node.parentId) {
      span.setAttributes({
        'agentflow.parent.id': node.parentId,
      });
    }

    // Node-specific attributes
    if (node.metadata) {
      this.setNodeSpecificAttributes(span, node);
    }

    // Runtime guard violations
    if (this.hasGuardViolations(node)) {
      this.setGuardViolationAttributes(span, node);
    }
  }

  private setNodeSpecificAttributes(span: Span, node: ExecutionNode): void {
    const metadata = node.metadata;

    // LLM-specific attributes (following GenAI conventions)
    if (this.isLLMCall(node)) {
      span.setAttributes({
        'llm.vendor': metadata.provider || 'unknown',
        'llm.request.model': metadata.model || 'unknown',
        'llm.request.temperature': metadata.temperature || 1.0,
        'llm.request.max_tokens': metadata.max_tokens || 0,
      });

      if (metadata.usage) {
        span.setAttributes({
          'llm.usage.input_tokens': metadata.usage.input_tokens || 0,
          'llm.usage.output_tokens': metadata.usage.output_tokens || 0,
          'llm.usage.total_tokens': metadata.usage.total_tokens || 0,
        });

        if (metadata.usage.cost) {
          span.setAttributes({
            'llm.usage.cost.total': metadata.usage.cost,
            'llm.usage.cost.currency': 'USD',
          });
        }
      }
    }

    // Tool-specific attributes
    if (node.type === 'tool') {
      span.setAttributes({
        'tool.name': node.name,
      });

      if (metadata.query) {
        span.setAttributes({
          'tool.query': metadata.query,
        });
      }
    }

    // Error information
    if (metadata.error) {
      span.setAttributes({
        'error.type': metadata.error_type || 'unknown',
        'error.message': metadata.error,
      });
    }
  }

  /**
   * Set attributes for runtime guard violations
   */
  private setGuardViolationAttributes(span: Span, node: ExecutionNode): void {
    const metadata = node.metadata;

    if (metadata.guard_violations) {
      span.setAttributes({
        'agentflow.guard.violated': true,
        'agentflow.guard.violation_count': metadata.guard_violations.length,
      });

      metadata.guard_violations.forEach((violation: any, index: number) => {
        span.setAttributes({
          [`agentflow.guard.violation.${index}.type`]: violation.type,
          [`agentflow.guard.violation.${index}.severity`]: violation.severity,
          [`agentflow.guard.violation.${index}.message`]: violation.message,
        });
      });
    }
  }

  private setSpanStatus(span: Span, node: ExecutionNode): void {
    switch (node.status) {
      case 'completed':
        span.setStatus({ code: SpanStatusCode.OK });
        break;
      case 'failed':
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: node.metadata?.error || 'Node execution failed',
        });
        break;
      case 'running':
        span.setStatus({ code: SpanStatusCode.UNSET });
        break;
      case 'timeout':
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: 'Node execution timed out',
        });
        break;
    }
  }

  // Helper methods to detect specific tool types
  private isLLMCall(node: ExecutionNode): boolean {
    if (node.type !== 'tool') return false;
    const metadata = node.metadata;
    return !!(metadata?.model || metadata?.provider || metadata?.usage);
  }

  private isEmbeddingCall(node: ExecutionNode): boolean {
    if (node.type !== 'tool') return false;
    return node.name.includes('embed') || node.name.includes('vector');
  }

  private isVectorSearch(node: ExecutionNode): boolean {
    if (node.type !== 'tool') return false;
    return node.name.includes('search') || node.name.includes('similarity');
  }

  private hasGuardViolations(node: ExecutionNode): boolean {
    return !!(node.metadata?.guard_violations && node.metadata.guard_violations.length > 0);
  }
}
