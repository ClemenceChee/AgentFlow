/**
 * AgentFlow — Quick demo.
 *
 * Run with: npx tsx examples/demo.ts
 */
import {
  createGraphBuilder,
  getCriticalPath,
  getFailures,
  getStats,
} from '../packages/core/src/index.js';

// 1. Create a builder
const builder = createGraphBuilder({
  agentId: 'portfolio-recon',
  trigger: 'user-request',
});

// 2. Build an execution graph
const root = builder.startNode({ type: 'agent', name: 'portfolio-recon' });

// Concurrent tool calls
const search = builder.startNode({ type: 'tool', name: 'web-search', parentId: root });
const news = builder.startNode({ type: 'tool', name: 'news-aggregator', parentId: root });
builder.endNode(search);
builder.endNode(news);

// Decision point
const decision = builder.startNode({ type: 'decision', name: 'pick-analysis-strategy', parentId: root });
builder.updateState(decision, { chosen: 'fundamental', reason: 'volatile market' });
builder.endNode(decision);

// Subagent with nested tools
const analyst = builder.startNode({ type: 'subagent', name: 'fundamental-analyst', parentId: root });
builder.withParent(analyst, () => {
  const filing = builder.startNode({ type: 'tool', name: 'sec-filing-reader' });
  builder.endNode(filing);
  const comps = builder.startNode({ type: 'tool', name: 'comparable-analysis' });
  builder.endNode(comps);
});
builder.endNode(analyst);

// A failed tool
const broken = builder.startNode({ type: 'tool', name: 'sentiment-api', parentId: root });
builder.failNode(broken, 'API rate limit exceeded (429)');

// Snapshot mid-flight (builder still usable)
const snapshot = builder.getSnapshot();
console.log(`\n📸 Mid-flight snapshot: ${snapshot.nodes.size} nodes, status=${snapshot.status}\n`);

// Finish
builder.endNode(root);
const graph = builder.build();

// 3. Query the graph
const stats = getStats(graph);
const failures = getFailures(graph);
const criticalPath = getCriticalPath(graph);

// 4. Print results
console.log('═══════════════════════════════════════');
console.log('  AgentFlow — Execution Summary');
console.log('═══════════════════════════════════════');
console.log(`  Agent:      ${graph.agentId}`);
console.log(`  Status:     ${graph.status}`);
console.log(`  Nodes:      ${stats.totalNodes}`);
console.log(`  Depth:      ${stats.depth}`);
console.log(`  Duration:   ${stats.duration}ms`);
console.log(`  Failures:   ${stats.failureCount}`);
console.log();

console.log('  Nodes by type:');
for (const [type, count] of Object.entries(stats.byType)) {
  if (count > 0) console.log(`    ${type}: ${count}`);
}
console.log();

if (failures.length > 0) {
  console.log('  Failures:');
  for (const f of failures) {
    console.log(`    ✗ ${f.name} [${f.status}] — ${f.metadata.error ?? 'unknown'}`);
  }
  console.log();
}

console.log('  Critical path:');
console.log(`    ${criticalPath.map((n) => n.name).join(' → ')}`);
console.log();

console.log('  Graph nodes (Map):');
for (const [id, node] of graph.nodes) {
  const dur = node.endTime !== null ? `${node.endTime - node.startTime}ms` : 'running';
  const indent = node.parentId ? '    ' : '  ';
  const icon = node.status === 'completed' ? '✓' : node.status === 'failed' ? '✗' : '○';
  console.log(`${indent}${icon} ${id} [${node.type}] ${node.name} (${dur})`);
}
console.log();
console.log('═══════════════════════════════════════');
