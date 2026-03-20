## Context

21 agents from 3 sources. Same workers appear as duplicates (`alfred-curator` + `vault-curator`). No grouping — flat list becomes unreadable at scale.

**Critical constraint: no hardcoded agent/framework names.** The clustering must be fully generic — derived from data patterns, not from knowing "alfred" or "openclaw" exist.

## Goals / Non-Goals

**Goals:**
- Automatically deduplicate agents that represent the same worker from different sources
- Automatically group agents by source adapter and by purpose
- Keep everything framework-agnostic — works for any agent system
- Clean API that the frontend can render as grouped cards

**Non-Goals:**
- Manual group configuration (future — for now, auto-detect only)
- Cross-system agent merging (e.g., an OpenClaw agent that IS an Alfred worker — too complex)

## Decisions

### 1. Deduplication via suffix matching (generic)

Many agent frameworks name workers as `<system>-<role>` or `<system>:<role>`. The dedup algorithm:

1. Collect all agentIds
2. For each pair, check if they share a common suffix after stripping a prefix:
   - `alfred-curator` → suffix `curator`
   - `vault-curator` → suffix `curator`
   - If two agents from **different adapter sources** share a suffix, merge them
3. The merged agent uses the suffix as its display name, combines stats from both

This is generic — it doesn't know about "alfred" or "vault". It just detects that two different-source agents end with the same role name.

**Edge cases:**
- `alfred` and `alfred-main` — different suffixes, no merge (correct)
- `openclaw:personal-email-processor` — no matching suffix elsewhere, no merge (correct)
- Only merge across different `source` adapters (agentflow + agentflow duplicates stay separate)

### 2. Grouping by adapter source + purpose keywords (generic)

Groups are derived from:
1. **Adapter source** → top-level group (e.g., all `source: "agentflow"` traces → one group, all `source: "openclaw"` → another)
2. **Purpose sub-groups** within each source → derived from common keywords in agent names:
   - Names containing "email" or "mail" → "Email Processors"
   - Names containing "monitor" → "Monitors"
   - Names containing "digest" or "newsletter" → "Digests & Newsletters"
   - Names containing "curator" or "janitor" or "distiller" → "Workers"
   - Default → "Agents"

This keyword matching is generic — it works for any framework that names agents descriptively. The keywords list is configurable (stored in the server, not hardcoded in components).

### 3. API shape

```typescript
// GET /api/agents → grouped response
{
  groups: [
    {
      name: "agentflow",          // derived from adapter source
      displayName: "AgentFlow",   // human-readable
      totalExecutions: 1451,
      failedExecutions: 10,
      agents: [
        {
          agentId: "curator",     // deduplicated name
          displayName: "curator",
          sources: ["alfred-curator", "vault-curator"],  // original IDs
          totalExecutions: 165,
          ...stats
        },
        ...
      ],
      subGroups: [
        { name: "Workers", agentIds: ["curator", "janitor", "distiller"] },
        { name: "Main", agentIds: ["alfred", "alfred-main"] }
      ]
    },
    {
      name: "openclaw",
      displayName: "OpenClaw",
      agents: [...],
      subGroups: [
        { name: "Email Processors", agentIds: [...] },
        { name: "Monitors", agentIds: [...] }
      ]
    }
  ]
}

// GET /api/agents?flat=true → backward-compatible flat array
[{ agentId: "alfred", ... }, ...]
```

### 4. Frontend rendering

```
┌─ AgentFlow (1451 exec, 10 fail) ─────────────────┐
│  Workers                                           │
│  ┌────────┐ ┌────────┐ ┌──────────┐              │
│  │curator │ │janitor │ │distiller │              │
│  │165 100%│ │493 100%│ │388 100% │              │
│  └────────┘ └────────┘ └──────────┘              │
│  Main                                              │
│  ┌────────┐ ┌──────────┐                          │
│  │alfred  │ │alfred-m. │                          │
│  │62  92% │ │341 100% │                          │
│  └────────┘ └──────────┘                          │
├─ OpenClaw (234 exec, 81 fail) ────────────────────┤
│  Email Processors                                  │
│  ┌─────────────┐ ┌─────────────┐                  │
│  │personal-... │ │finance-...  │                  │
│  │40  95%      │ │21  81%     │                  │
│  └─────────────┘ └─────────────┘                  │
│  Monitors                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │hensoldt  │ │quantum   │ │rheinmet. │          │
│  │21  67%   │ │19  42%   │ │19  42%  │          │
│  └──────────┘ └──────────┘ └──────────┘          │
└───────────────────────────────────────────────────┘
```

### 5. Purpose keyword configuration

The keyword → sub-group mapping is a simple array, not hardcoded per-framework:

```typescript
const PURPOSE_KEYWORDS = [
  { keywords: ['email', 'mail', 'inbox'], group: 'Email Processors' },
  { keywords: ['monitor', 'watch', 'alert'], group: 'Monitors' },
  { keywords: ['digest', 'newsletter', 'summary', 'report'], group: 'Digests' },
  { keywords: ['curator', 'janitor', 'distiller', 'surveyor', 'worker'], group: 'Workers' },
  { keywords: ['cron', 'schedule', 'timer'], group: 'Scheduled Jobs' },
];
```

If no keywords match, the agent goes into a "General" sub-group. This is extensible — users can add keywords later via settings.

## Risks / Trade-offs

**[Suffix dedup may over-merge]** → Two unrelated agents with the same suffix from different systems could merge incorrectly. Mitigation: only merge if sources differ AND the suffix is ≥4 characters (not generic suffixes like "main").

**[Keyword matching is English-only]** → Works for typical English agent names but not for agents named in other languages. Mitigation: acceptable for now; the keyword list is configurable.
