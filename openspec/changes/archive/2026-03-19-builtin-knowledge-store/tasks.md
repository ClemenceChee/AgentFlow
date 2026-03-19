## 1. Types

- [x] 1.1 Add `AgentProfile` interface to `types.ts`: agentId, totalRuns, successCount, failureCount, failureRate, recentDurations (number[]), lastConformanceScore (number | null), knownBottlenecks (string[]), lastPatternTimestamp (number | null), updatedAt (string)
- [x] 1.2 Add `KnowledgeStoreConfig` interface to `types.ts`: baseDir (string, default `.agentflow/knowledge`)
- [x] 1.3 Add `KnowledgeStore` interface to `types.ts` extending `EventWriter`: append, getRecentEvents, getAgentProfile, getPatternHistory, compact
- [x] 1.4 Add `PolicySource` interface to `types.ts`: recentFailureRate, isKnownBottleneck, lastConformanceScore, getAgentProfile
- [x] 1.5 Add `PolicyThresholds` interface to `types.ts`: maxFailureRate (default 0.5), minConformance (default 0.7)
- [x] 1.6 Extend `GuardConfig` with optional `policySource?: PolicySource` and `policyThresholds?: PolicyThresholds`
- [x] 1.7 Add new `GuardViolationType` values: `high-failure-rate`, `conformance-drift`, `known-bottleneck`

## 2. Knowledge Store

- [x] 2.1 Create `packages/core/src/knowledge-store.ts` with `createKnowledgeStore(config)` factory
- [x] 2.2 Implement `append(event)` — persist event as JSON file in `events/{agentId}/{date}/` or `patterns/{agentId}/`, auto-create directories
- [x] 2.3 Implement agent profile derivation — read existing profile, merge new event data, write atomically (temp file + rename) to `profiles/{agentId}.json`
- [x] 2.4 Implement `getRecentEvents(agentId, options)` — scan date-partitioned directories, return sorted events with limit and since filter
- [x] 2.5 Implement `getAgentProfile(agentId)` — read profile JSON or return null
- [x] 2.6 Implement `getPatternHistory(agentId, options)` — scan patterns directory, return sorted with limit
- [x] 2.7 Implement `compact({ olderThan })` — remove old event files, preserve profiles
- [x] 2.8 Implement `EventWriter` interface: `writeEvent` delegates to `append`, `write(graph)` is no-op

## 3. Policy Source

- [x] 3.1 Create `packages/core/src/policy-source.ts` with `createPolicySource(store)` factory
- [x] 3.2 Implement `recentFailureRate(agentId)` — read profile, return failureRate or 0
- [x] 3.3 Implement `isKnownBottleneck(nodeName)` — scan all profiles for nodeName in knownBottlenecks
- [x] 3.4 Implement `lastConformanceScore(agentId)` — read profile, return score or null

## 4. Adaptive Guards

- [x] 4.1 Extend `checkGuards` to accept PolicySource via GuardConfig and check for `high-failure-rate` violation
- [x] 4.2 Add `conformance-drift` violation check when lastConformanceScore is below threshold
- [x] 4.3 Add `known-bottleneck` warning for running nodes that are known bottlenecks
- [x] 4.4 Ensure no behavior change when PolicySource is absent

## 5. EventEmitter Integration

- [x] 5.1 Extend `EventEmitterConfig` with optional `knowledgeStore: KnowledgeStore`
- [x] 5.2 Update `createEventEmitter` to persist events to knowledge store on emit, with error handling via onError

## 6. Exports

- [x] 6.1 Export `createKnowledgeStore`, `createPolicySource`, and all new types from `packages/core/src/index.ts`

## 7. Tests

- [x] 7.1 Create `tests/core/knowledge-store.test.ts`: store creation, event persistence, profile derivation, rolling window, getRecentEvents, getAgentProfile, getPatternHistory, compact, EventWriter interface
- [x] 7.2 Create `tests/core/policy-source.test.ts`: failure rate, bottleneck check, conformance score, unknown agent defaults
- [x] 7.3 Create `tests/core/adaptive-guards.test.ts`: high-failure-rate, conformance-drift, known-bottleneck violations, no-policySource backward compat
- [x] 7.4 Add emitter + knowledge store integration test (included in knowledge-store.test.ts)
- [x] 7.5 Verify all existing tests still pass (244 core tests, zero regressions)

## 8. End-to-End Validation

- [x] 8.1 Create `examples/validate-knowledge-store.ts`: load real traces → emit to knowledge store → query profiles → create PolicySource → run guards with policy → show adaptive behavior
- [x] 8.2 Run against `~/.openclaw/workspace/traces/` and confirm the full loop works
