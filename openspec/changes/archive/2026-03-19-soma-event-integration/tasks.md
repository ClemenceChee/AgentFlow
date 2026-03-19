## 1. Soma Event Writer

- [x] 1.1 Create `packages/core/src/soma-event-writer.ts` with `createSomaEventWriter(config)` factory returning an `EventWriter`
- [x] 1.2 Implement `ExecutionEvent` → Markdown conversion: YAML frontmatter (type, subtype, name, source, created, alfred_tags, agentflow_graph_id, duration_ms, node_count) + body with path signature, duration summary, and `[[agent/{agentId}]]` wikilink
- [x] 1.3 Implement `PatternEvent` → Markdown conversion: YAML frontmatter (type: synthesis, subtype: pattern-discovery, name, variant_count, total_graphs) + body with top variants table, top bottlenecks table, and wikilinks
- [x] 1.4 Implement file naming: `{type}-{agentId}-{compact-ISO-timestamp}.md` (no colons, no ms)
- [x] 1.5 Handle edge cases: failed execution events with failure point details, execution events with processContext (conformance_score, is_anomaly, anomaly tag), missing inbox dir creation

## 2. Export and Integration

- [x] 2.1 Export `createSomaEventWriter` and `SomaEventWriterConfig` from `packages/core/src/index.ts`
- [x] 2.2 Verify writer works with `createEventEmitter({ writers: [somaWriter] })`

## 3. Tests

- [x] 3.1 Create `tests/core/soma-event-writer.test.ts` with tests for: EventWriter interface conformance, write() no-op, completed execution event output, failed execution event output, execution event with processContext, pattern event output, file naming convention, inbox directory auto-creation, emitter integration
- [x] 3.2 Verify all existing tests still pass (200 core tests, zero regressions)

## 4. End-to-End Validation

- [x] 4.1 Create `examples/validate-soma-integration.ts` that loads real traces, runs process mining, emits events to a test inbox dir, and verifies output files have correct frontmatter and wikilinks
- [x] 4.2 Run against `~/.openclaw/workspace/traces/` and confirm Curator-compatible output
