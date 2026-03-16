#!/usr/bin/env node
/**
 * AgentFlow Dashboard - Real-time monitoring for agent execution graphs
 *
 * Features:
 * - Real-time trace file monitoring
 * - WebSocket updates for live execution tracking
 * - Performance analytics and statistics
 * - Interactive execution graph visualization
 *
 * Usage:
 *   npx agentflow-dashboard [options]
 *   agentflow-dashboard --port 3000 --traces ./traces
 */

export { DashboardServer } from './server.js';
export { TraceWatcher } from './watcher.js';
export type { WatchedTrace } from './watcher.js';
export { AgentStats } from './stats.js';
