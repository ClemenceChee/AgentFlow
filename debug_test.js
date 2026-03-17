import { createGraphBuilder } from './packages/core/src/graph-builder.js';
import { checkGuards } from './packages/core/src/guards.js';
import { getDepth, getNode, getChildren } from './packages/core/src/graph-query.js';

function createTestIdGenerator() {
  let counter = 0;
  return () => {
    counter++;
    return `test_${String(counter).padStart(3, '0')}`;
  };
}

// Test depth calculation
function createDeepGraph(depth) {
  const builder = createGraphBuilder({
    agentId: 'test',
    idGenerator: createTestIdGenerator(),
  });

  let parentId = builder.startNode({ type: 'agent', name: 'root' });

  // Create a chain of depth nodes
  for (let i = 1; i < depth; i++) {
    const childId = builder.startNode({
      type: 'agent',
      name: `level_${i}`,
      parentId,
    });
    builder.endNode(parentId);
    parentId = childId;
  }

  builder.endNode(parentId);
  return builder.build();
}

// Test reasoning loop
function createReasoningLoopGraph(loopCount) {
  const builder = createGraphBuilder({
    agentId: 'test',
    idGenerator: createTestIdGenerator(),
  });

  const root = builder.startNode({ type: 'agent', name: 'main' });
  let parentId = root;

  // Create consecutive same-type nodes
  for (let i = 0; i < loopCount; i++) {
    const toolId = builder.startNode({
      type: 'tool',
      name: `search_attempt_${i}`,
      parentId,
    });
    builder.endNode(toolId);

    // Next tool will be a child of the current one
    parentId = toolId;
  }

  builder.endNode(root);
  return builder.build();
}

// Debug depth calculation
console.log('=== Testing Depth Calculation ===');
const deepGraph = createDeepGraph(5);
console.log('Graph depth:', getDepth(deepGraph));
console.log('Graph nodes:', deepGraph.nodes.size);

// Debug graph structure
console.log('=== Graph Structure ===');
for (const [id, node] of deepGraph.nodes) {
  console.log(`${id}: ${node.name} (${node.type}) -> children: ${node.children.join(', ')}`);
}

// Test violations
console.log('=== Testing Violations ===');
const violations = checkGuards(deepGraph, { maxDepth: 2 });
console.log('Violations found:', violations.length);
violations.forEach(v => console.log('- ', v.type, ':', v.message));

// Test reasoning loop
console.log('=== Testing Reasoning Loop ===');
const loopGraph = createReasoningLoopGraph(30);
console.log('Loop graph depth:', getDepth(loopGraph));
console.log('Loop graph nodes:', loopGraph.nodes.size);

// Debug loop structure
console.log('=== Loop Structure ===');
for (const [id, node] of loopGraph.nodes) {
  console.log(`${id}: ${node.name} (${node.type}) -> children: ${node.children.join(', ')}, parent: ${node.parentId}`);
}

const loopViolations = checkGuards(loopGraph, { maxReasoningSteps: 25 });
console.log('Loop violations found:', loopViolations.length);
loopViolations.forEach(v => console.log('- ', v.type, ':', v.message));