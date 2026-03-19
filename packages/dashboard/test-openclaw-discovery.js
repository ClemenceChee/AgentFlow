#!/usr/bin/env node

// Quick script to test OpenClaw discovery with actual files
import { TraceWatcher } from './dist/chunk-OYB3IZE6.js';

console.log('Testing OpenClaw Discovery...\n');

// Create watcher with real OpenClaw directories
const watcher = new TraceWatcher({
  tracesDir: '/home/trader/.openclaw/workspace/traces',
  dataDirs: [
    '/home/trader/.alfred/data',
    '/home/trader/.openclaw/cron',
    '/home/trader/.openclaw/agents/main/sessions',
    '/home/trader/.openclaw/agents/vault-curator/sessions',
    '/home/trader/.openclaw/agents/vault-janitor/sessions',
    '/home/trader/.openclaw/agents/vault-distiller/sessions',
    '/tmp/openclaw',
  ],
});

// Give it time to discover files
setTimeout(() => {
  console.log('=== Discovery Results ===');

  const traces = watcher.getAllTraces();
  console.log(`Total traces found: ${traces.length}`);

  const agentIds = watcher.getAgentIds();
  console.log(`Agent IDs discovered: ${agentIds.length}`);
  console.log('Agents:', agentIds.join(', '));

  console.log('\n=== OpenClaw Agents ===');
  const openclawAgents = agentIds.filter((id) => id.includes('openclaw'));
  console.log(`OpenClaw agents: ${openclawAgents.length}`);
  openclawAgents.forEach((agent) => {
    const agentTraces = watcher.getTracesByAgent(agent);
    console.log(`  ${agent}: ${agentTraces.length} traces`);
  });

  console.log('\n=== Sample Traces by Source Type ===');
  const bySourceType = traces.reduce((acc, trace) => {
    const type = trace.sourceType || 'unknown';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  Object.entries(bySourceType).forEach(([type, count]) => {
    console.log(`  ${type}: ${count} traces`);
  });

  console.log('\n=== Recent OpenClaw Sessions ===');
  const recentOpenclawTraces = traces
    .filter((t) => t.agentId?.includes('openclaw') && t.sourceType === 'session')
    .slice(0, 5);

  recentOpenclawTraces.forEach((trace) => {
    const timestamp = new Date(trace.lastModified || trace.startTime).toISOString();
    console.log(`  ${trace.agentId}: ${trace.filename} (${timestamp})`);
    if (trace.sessionEvents) {
      console.log(
        `    Events: ${trace.sessionEvents.length}, Tokens: ${trace.tokenUsage?.total || 'N/A'}`,
      );
    }
  });

  console.log('\nOpenClaw discovery test complete!');
  watcher.stop();
}, 2000);
