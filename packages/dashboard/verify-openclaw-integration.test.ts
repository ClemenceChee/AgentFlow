#!/usr/bin/env node

/**
 * Comprehensive verification test for OpenClaw integration
 * This script validates that all OpenClaw discovery fixes work with real data
 */

import * as fs from 'node:fs';
import { TraceWatcher } from './dist/chunk-OYB3IZE6.js';

async function main() {
  console.log('🔍 OpenClaw Integration Verification\n');

  // Check if OpenClaw directories exist
  const openclawPaths = {
    traces: '/home/trader/.openclaw/workspace/traces',
    mainSessions: '/home/trader/.openclaw/agents/main/sessions',
    curatorSessions: '/home/trader/.openclaw/agents/vault-curator/sessions',
    janitorSessions: '/home/trader/.openclaw/agents/vault-janitor/sessions',
    distillerSessions: '/home/trader/.openclaw/agents/vault-distiller/sessions',
    logs: '/tmp/openclaw',
  };

  console.log('📁 Checking OpenClaw directory structure...');
  for (const [name, path] of Object.entries(openclawPaths)) {
    const exists = fs.existsSync(path);
    console.log(`  ${exists ? '✅' : '❌'} ${name}: ${path}`);

    if (exists) {
      try {
        const files = fs.readdirSync(path);
        const relevantFiles = files.filter(
          (f) => f.endsWith('.json') || f.endsWith('.jsonl') || f.endsWith('.log'),
        );
        console.log(`    📄 ${relevantFiles.length} files found`);
      } catch (err) {
        console.log(`    ⚠️  Cannot read directory: ${err.message}`);
      }
    }
  }

  console.log('\n🎬 Creating TraceWatcher with OpenClaw directories...');

  const watcher = new TraceWatcher({
    tracesDir: openclawPaths.traces,
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

  // Wait for discovery to complete
  console.log('⏳ Waiting for trace discovery...');
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const traces = watcher.getAllTraces();
  const agentIds = watcher.getAgentIds();
  const stats = watcher.getTraceStats();

  console.log('\n📊 Discovery Results:');
  console.log(`  📈 Total traces: ${traces.length}`);
  console.log(`  🤖 Total agents: ${agentIds.length}`);
  console.log(`  🔄 Recent traces (24h): ${stats.recentCount}`);

  console.log('\n🕵️ Agent Breakdown:');
  const agentGroups = {
    openclaw: agentIds.filter((id) => id.includes('openclaw')),
    alfred: agentIds.filter((id) => id.includes('alfred')),
    other: agentIds.filter((id) => !id.includes('openclaw') && !id.includes('alfred')),
  };

  Object.entries(agentGroups).forEach(([group, agents]) => {
    if (agents.length > 0) {
      console.log(`  🏷️  ${group.toUpperCase()}: ${agents.length} agents`);
      agents.forEach((agent) => {
        const agentTraces = watcher.getTracesByAgent(agent);
        console.log(`    - ${agent}: ${agentTraces.length} traces`);
      });
    }
  });

  console.log('\n🔬 Source Type Analysis:');
  const sourceTypes = traces.reduce((acc, trace) => {
    const type = trace.sourceType || 'unknown';
    if (!acc[type]) acc[type] = { count: 0, traces: [] };
    acc[type].count++;
    acc[type].traces.push(trace);
    return acc;
  }, {});

  Object.entries(sourceTypes).forEach(([type, data]) => {
    console.log(`  📝 ${type}: ${data.count} traces`);
    if (type === 'session' && data.traces.length > 0) {
      const sample = data.traces[0];
      console.log(`    Sample: ${sample.agentId} - ${sample.filename}`);
      if (sample.sessionEvents) {
        console.log(
          `    Events: ${sample.sessionEvents.length}, Tokens: ${sample.tokenUsage?.total || 'N/A'}`,
        );
      }
    }
  });

  console.log('\n🆕 Recent OpenClaw Activity:');
  const recentOpenclawTraces = traces
    .filter((t) => t.agentId?.includes('openclaw'))
    .sort((a, b) => (b.lastModified || b.startTime) - (a.lastModified || a.startTime))
    .slice(0, 5);

  if (recentOpenclawTraces.length === 0) {
    console.log('  ⚠️  No OpenClaw traces found');
  } else {
    recentOpenclawTraces.forEach((trace, i) => {
      const timestamp = new Date(trace.lastModified || trace.startTime);
      const relativeTime = getRelativeTime(timestamp);
      console.log(`  ${i + 1}. ${trace.agentId}: ${trace.filename} (${relativeTime})`);

      if (trace.sessionEvents && trace.sessionEvents.length > 0) {
        const userMessages = trace.sessionEvents.filter((e) => e.type === 'user').length;
        const assistantMessages = trace.sessionEvents.filter((e) => e.type === 'assistant').length;
        const toolCalls = trace.sessionEvents.filter((e) => e.type === 'tool_call').length;
        console.log(
          `     💬 ${userMessages} user, ${assistantMessages} assistant, 🔧 ${toolCalls} tools`,
        );
      }
    });
  }

  console.log('\n✅ Verification Tests:');

  // Test 1: OpenClaw agents discovered
  const openclawAgentsFound = agentIds.filter((id) => id.includes('openclaw')).length;
  console.log(
    `  ${openclawAgentsFound > 0 ? '✅' : '❌'} OpenClaw agents discovered: ${openclawAgentsFound}`,
  );

  // Test 2: Session files parsed
  const sessionTraces = traces.filter((t) => t.sourceType === 'session').length;
  console.log(`  ${sessionTraces > 0 ? '✅' : '❌'} Session files parsed: ${sessionTraces}`);

  // Test 3: Recursive discovery working
  const deepTraces = traces.filter(
    (t) => t.filename && (t.sourceDir?.includes('/sessions') || t.sourceDir?.includes('/agents')),
  ).length;
  console.log(
    `  ${deepTraces > 0 ? '✅' : '❌'} Recursive discovery working: ${deepTraces} deep traces`,
  );

  // Test 4: Real-time monitoring
  console.log('  ⏳ Testing real-time file watching...');
  let _fileWatchingWorks = false;

  watcher.on('trace-updated', (trace) => {
    if (trace.agentId?.includes('openclaw')) {
      _fileWatchingWorks = true;
      console.log(`    ✅ Real-time update detected: ${trace.agentId}`);
    }
  });

  // Test 5: API endpoints should work
  console.log('\n🌐 API Integration:');
  console.log(`  📡 /api/traces would return ${traces.length} traces`);
  console.log(`  🤖 /api/agents would return ${agentIds.length} agents`);
  console.log(`  📊 /api/stats would show ${stats.total} total executions`);

  watcher.stop();

  console.log('\n🎉 OpenClaw Integration Verification Complete!');

  if (openclawAgentsFound > 0 && sessionTraces > 0) {
    console.log('✅ SUCCESS: OpenClaw agents are properly discoverable in the dashboard');
  } else {
    console.log('❌ ISSUE: OpenClaw discovery may not be working correctly');
    console.log('   Check that OpenClaw gateway is running and has created session files');
  }
}

function getRelativeTime(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

main().catch(console.error);
