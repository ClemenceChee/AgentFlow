/**
 * AgentFlow OpenTelemetry Integration
 *
 * Export AgentFlow execution graphs to OpenTelemetry-compatible backends
 * following GenAI semantic conventions.
 *
 * @example Basic usage with Jaeger
 * ```typescript
 * import { setupAgentFlowOTel, exportGraphToOTel } from 'agentflow-otel';
 *
 * // Initialize OTel
 * await setupAgentFlowOTel({
 *   serviceName: 'my-agent-system',
 *   backend: 'jaeger'
 * });
 *
 * // Export a graph
 * await exportGraphToOTel(myExecutionGraph);
 * ```
 *
 * @example Enterprise configuration with Datadog
 * ```typescript
 * await setupAgentFlowOTel({
 *   serviceName: 'production-agents',
 *   backend: 'datadog',
 *   headers: { 'DD-API-KEY': process.env.DATADOG_API_KEY }
 * });
 * ```
 */

export { AgentFlowOTelConfig, type OTelConfig, OTelPresets } from './config.js';
export { AgentFlowOTelExporter } from './exporter.js';
export { createOTelWatcher } from './watcher.js';

import type { ExecutionGraph } from 'agentflow-core';
import { AgentFlowOTelConfig, type OTelConfig } from './config.js';
import { AgentFlowOTelExporter } from './exporter.js';

// Global instances
let globalConfig: AgentFlowOTelConfig | null = null;
let globalExporter: AgentFlowOTelExporter | null = null;

/**
 * Initialize AgentFlow OpenTelemetry integration
 */
export async function setupAgentFlowOTel(config: OTelConfig): Promise<void> {
  globalConfig = new AgentFlowOTelConfig();
  globalExporter = new AgentFlowOTelExporter(config.serviceName);

  await globalConfig.initialize(config);
}

/**
 * Export an AgentFlow execution graph to OpenTelemetry
 */
export async function exportGraphToOTel(graph: ExecutionGraph): Promise<void> {
  if (!globalExporter) {
    throw new Error('AgentFlow OTel not initialized. Call setupAgentFlowOTel() first.');
  }

  await globalExporter.exportGraph(graph);
}

/**
 * Shutdown AgentFlow OpenTelemetry integration
 */
export async function shutdownAgentFlowOTel(): Promise<void> {
  if (globalConfig) {
    await globalConfig.shutdown();
    globalConfig = null;
    globalExporter = null;
  }
}

/**
 * Check if AgentFlow OTel is initialized
 */
export function isOTelInitialized(): boolean {
  return globalExporter !== null;
}
