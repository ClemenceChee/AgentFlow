/**
 * AgentFlow — Demo showing multi-level failure detection
 *
 * Run with: npx tsx examples/demo.ts
 */
import {
  createGraphBuilder,
  withGuards,
  toAsciiTree,
  toTimeline,
  getFailures,
  getStats,
  createTraceStore,
} from '../packages/core/src/index.js';

console.log('🚀 AgentFlow Demo — Multi-level Failure Detection\n');

// Scenario 1: Normal successful execution
console.log('═══ Scenario 1: Healthy Agent ═══');
const healthyBuilder = createGraphBuilder({ agentId: 'data-pipeline', trigger: 'cron' });
const root1 = healthyBuilder.startNode({ type: 'agent', name: 'data-pipeline' });

// Simulate successful data processing
const extract = healthyBuilder.startNode({ type: 'tool', name: 'extract-data', parentId: root1 });
healthyBuilder.endNode(extract, 150);

const transform = healthyBuilder.startNode({ type: 'tool', name: 'transform-data', parentId: root1 });
healthyBuilder.endNode(transform, 200);

const load = healthyBuilder.startNode({ type: 'tool', name: 'load-to-warehouse', parentId: root1 });
healthyBuilder.endNode(load, 100);

healthyBuilder.endNode(root1);
const healthyGraph = healthyBuilder.build();

console.log(toAsciiTree(healthyGraph));
console.log(`✅ Status: ${healthyGraph.status} (${getStats(healthyGraph).duration}ms)\n`);

// Scenario 2: Agent with failures and runtime guard violations
console.log('═══ Scenario 2: Agent with Problems ═══');
const problematicBuilder = withGuards(createGraphBuilder({
  agentId: 'reasoning-agent',
  trigger: 'user-request'
}), {
  maxDepth: 5,
  maxReasoningSteps: 3,
  maxAgentSpawns: 8,
  onViolation: 'warn'
});

const root2 = problematicBuilder.startNode({ type: 'agent', name: 'reasoning-agent' });

// Start normal processing
const analyze = problematicBuilder.startNode({ type: 'tool', name: 'analyze-input', parentId: root2 });
problematicBuilder.endNode(analyze, 80);

// Trigger reasoning loop (guard violation)
const reason1 = problematicBuilder.startNode({ type: 'reasoning', name: 'plan-approach', parentId: root2 });
problematicBuilder.endNode(reason1, 100);

const reason2 = problematicBuilder.startNode({ type: 'reasoning', name: 'refine-plan', parentId: root2 });
problematicBuilder.endNode(reason2, 110);

const reason3 = problematicBuilder.startNode({ type: 'reasoning', name: 'rethink-approach', parentId: root2 });
problematicBuilder.endNode(reason3, 105);

// This should trigger reasoning loop guard
const reason4 = problematicBuilder.startNode({ type: 'reasoning', name: 'overthink-plan', parentId: root2 });
problematicBuilder.endNode(reason4, 120);

// Spawn too many subagents (another guard violation)
for (let i = 0; i < 4; i++) {
  const subagent = problematicBuilder.startNode({
    type: 'subagent',
    name: `worker-${i}`,
    parentId: root2
  });
  // Nested subagents (depth violation)
  const nested = problematicBuilder.startNode({
    type: 'subagent',
    name: `nested-worker-${i}`,
    parentId: subagent
  });
  const deepNested = problematicBuilder.startNode({
    type: 'subagent',
    name: `deep-nested-${i}`,
    parentId: nested
  });
  problematicBuilder.endNode(deepNested, 50);
  problematicBuilder.endNode(nested, 60);
  problematicBuilder.endNode(subagent, 80);
}

// Add some failures
const failedTool = problematicBuilder.startNode({ type: 'tool', name: 'external-api', parentId: root2 });
problematicBuilder.failNode(failedTool, 'Connection timeout after 30s');

const stuckTool = problematicBuilder.startNode({ type: 'tool', name: 'file-processor', parentId: root2 });
// Don't end this one - it's stuck!

problematicBuilder.endNode(root2);
const problematicGraph = problematicBuilder.build();

console.log(toAsciiTree(problematicGraph));

const failures = getFailures(problematicGraph);
const stats = getStats(problematicGraph);

console.log('📊 Detected Issues:');
console.log(`   ${failures.length} failures detected`);
console.log(`   ${stats.hungNodes} nodes still running (stuck)`);
console.log(`   Reasoning loop: 4 consecutive reasoning steps`);
console.log(`   Max depth exceeded: ${stats.depth} levels deep`);
console.log(`   Status: ${problematicGraph.status}\n`);

// Show timeline visualization
console.log('⏱️  Timeline View:');
console.log(toTimeline(problematicGraph));

// Scenario 3: Save and query traces
console.log('\n═══ Scenario 3: Trace Storage & Querying ═══');
const store = createTraceStore('./traces');

try {
  await store.save(healthyGraph);
  await store.save(problematicGraph);

  console.log('💾 Saved traces to ./traces/');

  const allTraces = await store.list({});
  console.log(`📋 Found ${allTraces.length} traces in store`);

  const failedTraces = await store.list({ status: 'failed' });
  console.log(`❌ ${failedTraces.length} failed traces`);

  const stuckSpans = await store.getStuckSpans();
  console.log(`⏳ ${stuckSpans.length} stuck operations found`);

} catch (error) {
  console.log('💡 Trace storage demo (would save to ./traces/ directory)');
}

console.log('\n🎯 Key AgentFlow Benefits Demonstrated:');
console.log('   ✅ Automatic failure detection');
console.log('   ⚠️  Runtime guard violations (loops, depth, spawn limits)');
console.log('   📊 Rich execution visualization');
console.log('   💾 Persistent trace storage and querying');
console.log('   🔍 Stuck operation detection');
console.log('   📈 Performance and timing analysis');

console.log('\n🚀 Try it on your agents:');
console.log('   agentflow watch ./your-agent-directory --notify telegram');
console.log('   agentflow live ./your-agent-directory');
console.log('   agentflow run -- python your_agent.py');