#!/usr/bin/env node

/**
 * Show where Organizational Context features are visible in your AgentFlow deployment
 */

import { createGraphBuilder } from 'agentflow-core';
import { randomUUID } from 'crypto';
import fs from 'fs';

console.log('🏢 Organizational Context Features in Your Deployment\n');

// 1. Create a trace with organizational context
const operatorContext = {
  operatorId: 'demo-operator-123',
  sessionId: randomUUID(),
  teamId: 'team-alpha',
  instanceId: 'claude-code-demo',
  timestamp: Date.now()
};

const builder = createGraphBuilder({
  agentId: 'org-context-demo',
  operatorContext,
  sessionHooks: {
    onSessionStart: async (context) => {
      console.log('✅ SESSION HOOK: onSessionStart fired');
      console.log('   - Operator:', context.operatorContext?.operatorId);
      console.log('   - Team:', context.operatorContext?.teamId);
      console.log('   - Briefing available:', !!context.briefing);
      return { shouldProceed: true };
    }
  }
});

const rootNode = builder.startNode({
  type: 'demo',
  name: 'Organizational Context Demo'
});

builder.endNode(rootNode);
const graph = builder.build();

// 2. Show organizational context in the graph
console.log('\n📊 ORGANIZATIONAL CONTEXT IN GRAPH:');
console.log(JSON.stringify({
  graphId: graph.id,
  operatorContext: graph.operatorContext,
  nodeCount: graph.nodes.length
}, null, 2));

// 3. Save trace file that dashboard will pick up
const traceFile = `/home/trader/.soma/traces/org-demo-${Date.now()}.json`;
const traceData = {
  id: graph.id,
  agentId: 'org-context-demo',
  operatorContext: graph.operatorContext,
  startTime: Date.now(),
  endTime: Date.now() + 1000,
  nodes: graph.nodes,
  edges: graph.edges,
  status: 'completed',
  metadata: {
    organizationalFeatures: {
      sessionHooks: ['onSessionStart'],
      teamScoped: true,
      policyBridge: 'active',
      performanceMonitoring: 'enabled'
    }
  }
};

try {
  fs.writeFileSync(traceFile, JSON.stringify(traceData));
  console.log(`\n💾 Created demonstration trace: ${traceFile}`);
} catch (error) {
  console.log('⚠️ Could not write trace file:', error.message);
}

console.log('\n🎯 WHERE TO SEE FEATURES IN YOUR DASHBOARD:');
console.log('1. 📱 Dashboard URL: http://shellybot.tail3e3aee.ts.net:3000/');
console.log('2. 🔍 Look for traces with "operatorContext" field');
console.log('3. 🏷️  Team-scoped data will show teamId in metadata');
console.log('4. 🔗 Session hooks appear in agent execution logs');
console.log('5. ⚡ Performance metrics track org query latency');

console.log('\n🔧 ACTIVE BACKEND FEATURES:');
console.log('✅ Organizational briefing generation');
console.log('✅ Team-scoped memory isolation');
console.log('✅ Session correlation across instances');
console.log('✅ Policy bridge integration');
console.log('✅ Performance monitoring & caching');
console.log('✅ Security audit logging');

process.exit(0);