#!/usr/bin/env node

/**
 * AgentFlow Storage - Persistent storage and querying for agent execution history
 *
 * Features:
 * - SQLite-based storage for fast queries
 * - Automatic trace file ingestion
 * - Rich querying API with filters and aggregations
 * - Performance analytics and time-series data
 * - Export capabilities for external analysis
 *
 * Usage:
 *   import { AgentFlowStorage } from 'agentflow-storage';
 *   const storage = new AgentFlowStorage('./agentflow.db');
 */

export { StorageAnalytics } from './analytics.js';
export { TraceIngester } from './ingester.js';
export { QueryBuilder } from './query.js';
export { AgentFlowStorage } from './storage.js';
