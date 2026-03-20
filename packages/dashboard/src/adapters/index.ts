/**
 * Adapter registry initialization.
 * Import this module to register all built-in adapters.
 *
 * Order matters: more specific adapters first, AgentFlow as fallback.
 */

export { AgentFlowAdapter } from './agentflow.js';
export { OpenClawAdapter } from './openclaw.js';
export { OTelAdapter, parseOtlpPayload } from './otel.js';
export { detectAdapters, findAdapter, getAdapters, registerAdapter } from './registry.js';
export type { NormalizedNode, NormalizedTrace, TraceAdapter } from './types.js';

import { AgentFlowAdapter } from './agentflow.js';
import { OpenClawAdapter } from './openclaw.js';
import { OTelAdapter } from './otel.js';
import { registerAdapter } from './registry.js';

// Register in priority order: specific first, fallback last
registerAdapter(new OpenClawAdapter());
registerAdapter(new OTelAdapter());
registerAdapter(new AgentFlowAdapter());
