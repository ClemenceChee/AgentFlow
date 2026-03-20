## 1. Server: Deduplication Logic

- [x] 1.1 Create `src/agent-clustering.ts` with `deduplicateAgents(agents)` — find agents from different sources sharing a common suffix (≥4 chars), merge their stats
- [x] 1.2 Merged agent gets: combined totalExecutions, combined failures, weighted avgExecutionTime, union of recentActivity, `sources: string[]` listing original agentIds
- [x] 1.3 Deduplicated agent uses the suffix as `agentId` and `displayName`

## 2. Server: Grouping Logic

- [x] 2.1 Add `groupAgents(agents)` function — groups by adapter source (derived from agentId prefix: `openclaw:` → openclaw, no prefix → agentflow, `otel:` → otel)
- [x] 2.2 Add purpose sub-grouping via configurable keyword list — match agent names against keywords, assign to sub-groups
- [x] 2.3 Each group returns: `name`, `displayName`, `totalExecutions`, `failedExecutions`, `agents[]`, `subGroups[]`

## 3. Server: API Changes

- [x] 3.1 Modify `/api/agents` to return `{ groups: [...] }` format by default
- [x] 3.2 Support `?flat=true` query parameter returning original flat array
- [x] 3.3 Ensure ExecSidebar filters traces by merged source agentIds (not just the deduped agentId)

## 4. Frontend: Grouped Agent Cards

- [x] 4.1 Update `useAgents.ts` hook to parse grouped response
- [x] 4.2 Update `TopSection.tsx` to render agent cards inside collapsible group headers
- [x] 4.3 Group header shows: source name, total executions, failure count, collapse/expand toggle
- [x] 4.4 Sub-group labels shown as section dividers within each group
- [x] 4.5 Merged agents show "N sources" badge and deduplicated display name

## 5. Frontend: OpenClaw Name Resolution

- [x] 5.1 For `openclaw:` agents, display the `displayName` from the adapter (job name from jobs.json) instead of the UUID
- [x] 5.2 Source badge shows adapter name (openclaw, otel) for non-agentflow agents
