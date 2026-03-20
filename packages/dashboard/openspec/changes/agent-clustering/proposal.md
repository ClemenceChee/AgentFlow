## Why

With multiple data sources now feeding the dashboard (Alfred sessions, OpenClaw traces, OpenClaw cron runs), the same worker appears as multiple agents: `alfred-curator` (from OpenClaw traces) and `vault-curator` (from Alfred sessions) are the same curator worker. Additionally, 12 OpenClaw cron jobs show as 12 flat agent cards — without grouping by purpose (email processors, monitors, digest generators), the dashboard becomes unreadable as agent count grows.

## What Changes

- **Agent deduplication**: Server merges agents that represent the same worker from different sources. `alfred-curator` + `vault-curator` → `curator` (under Alfred system). Merge strategy: strip known prefixes (`alfred-`, `vault-`), match suffixes. Combined execution count and stats.
- **Agent grouping**: Server returns agents organized into groups based on source and purpose:
  - **Alfred System**: main + workers (curator, janitor, distiller, surveyor)
  - **OpenClaw Cron Jobs**: sub-grouped by purpose (email, newsletter, monitor, digest) — derived from job name keywords
  - **OTel Agents**: grouped by `service.name`
  - **Other/Unknown**: ungrouped
- **API change**: `/api/agents` returns `{ groups: [{ name, source, agents: [...] }] }` instead of a flat array. Backward-compatible: flat list still available at `/api/agents?flat=true`.
- **Frontend grouping**: Agent cards rendered inside collapsible group headers with aggregate stats.

## Capabilities

### New Capabilities
- `agent-deduplication`: Server-side merge of duplicate agents from different sources
- `agent-grouping`: Hierarchical agent groups by system and purpose

### Modified Capabilities
- `dashboard-dynamic-identity`: Agent cards render within groups, show deduplicated names

## Impact

- **Modified files**: `src/server.ts` or `src/stats.ts` (dedup + grouping logic), `src/client/components/TopSection.tsx` (render groups)
- **API change**: `/api/agents` response shape changes (backward-compatible with `?flat=true`)
- **No new dependencies**
