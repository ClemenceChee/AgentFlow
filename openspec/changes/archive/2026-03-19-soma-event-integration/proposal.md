## Why

AgentFlow now emits structured execution and pattern events, but they go nowhere useful — they land in a local `tmp/` directory as JSON files. Soma's Curator already watches `~/.openclaw/workspace/inbox/` and processes Markdown files with YAML frontmatter into a structured vault with wikilinked entities. Connecting these two systems closes the core feedback loop: agents execute → AgentFlow observes → Soma learns → knowledge compounds. Without this integration, execution intelligence stays siloed and never informs organizational memory.

## What Changes

- **New Soma event writer** that converts AgentFlow events (ExecutionEvent, PatternEvent) into Markdown files with YAML frontmatter matching the Curator's expected input format.
- **Field mapping** from AgentFlow event schema to Soma entity conventions: `agentId` → `source`, `eventType` → `type`/`subtype`, `pathSignature` → content body, `processContext` → `alfred_tags`, timestamps → ISO dates.
- **Entity type routing**: execution events map to `execution/` vault entities, pattern events map to `synthesis/` entities with wikilinks to `agent/` records.
- **End-to-end integration script** that loads traces → runs process mining → emits events to inbox → verifies file creation and format correctness.

## Capabilities

### New Capabilities
- `soma-event-writer`: Adapter that writes AgentFlow events as Curator-compatible Markdown files to the Soma inbox directory. Implements the existing `EventWriter` interface so it plugs directly into `createEventEmitter`.

### Modified Capabilities

## Impact

- **New file**: `packages/core/src/soma-event-writer.ts` (~80-120 lines)
- **New file**: `examples/validate-soma-integration.ts` (integration script)
- **Export addition**: `createSomaEventWriter` added to `packages/core/src/index.ts`
- **No breaking changes**: Existing `JsonEventWriter` unchanged. New writer is opt-in.
- **External dependency**: Writes to `~/.openclaw/workspace/inbox/` — requires Soma/Alfred workspace to exist.
- **Zero new runtime dependencies**: Uses only `node:fs` and `node:path`.
