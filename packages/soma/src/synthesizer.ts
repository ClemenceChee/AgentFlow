/**
 * Synthesizer — knowledge extraction worker.
 *
 * Multi-stage pipeline: score candidates → extract learnings via LLM →
 * deduplicate via pure code → create learning records via LLM.
 *
 * @module
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AnalysisFn } from 'agentflow-core';
import { enforceWritePermission, queryByLayer, writeToLayer } from './layers.js';
import type { Entity, SynthesizerConfig, Vault } from './types.js';
import { resolveAgentId } from './types.js';
import { vaultEntityCount } from './vault.js';

const DEFAULT_SCORE_THRESHOLD = 0.4;
const DEFAULT_DEDUP_THRESHOLD = 0.7;

/** Configurable keyword signals for candidate scoring. */
const SCORING_KEYWORDS: { category: string; keywords: string[]; weight: number }[] = [
  {
    category: 'decision',
    keywords: ['decided', 'chose', 'selected', 'opted', 'picked', 'agreed', 'concluded'],
    weight: 0.15,
  },
  {
    category: 'assumption',
    keywords: ['assumed', 'expected', 'believed', 'thought', 'predicted', 'hypothesized'],
    weight: 0.15,
  },
  {
    category: 'constraint',
    keywords: ['must', 'cannot', 'required', 'blocked', 'limited', 'restricted', 'prevented'],
    weight: 0.15,
  },
  {
    category: 'contradiction',
    keywords: [
      'contradicts',
      'conflicts',
      'inconsistent',
      'disagrees',
      'but',
      'however',
      'although',
    ],
    weight: 0.15,
  },
];

interface LearningSpec {
  type: string;
  title: string;
  claim: string;
  confidence: 'low' | 'medium' | 'high';
  evidence: string[];
  sourceIds: string[];
  sourceCount: number;
}

/** Compute overlap coefficient for fuzzy matching. */
function overlapCoefficient(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  let intersection = 0;
  for (const word of setA) if (setB.has(word)) intersection++;
  const minSize = Math.min(setA.size, setB.size);
  return minSize > 0 ? intersection / minSize : 0;
}

/** Check if a title is a duplicate of an existing vault entity (fuzzy match). */
function isDuplicateInVault(vault: Vault, type: string, title: string, threshold = 0.7): boolean {
  const existing = vault.list(type);
  return existing.some((e) => overlapCoefficient(e.name, title) >= threshold);
}

/** Compute MD5 hash for change detection. */
function md5(content: string): string {
  return createHash('md5').update(content).digest('hex');
}

/**
 * Create a Synthesizer worker.
 */
export function createSynthesizer(
  vault: Vault,
  analysisFn: AnalysisFn,
  config?: SynthesizerConfig,
) {
  const scoreThreshold = config?.scoreThreshold ?? DEFAULT_SCORE_THRESHOLD;
  const dedupThreshold = config?.dedupThreshold ?? DEFAULT_DEDUP_THRESHOLD;
  const stateFile = config?.stateFile ?? '.soma/synthesizer-state.json';

  // Load state (MD5 hashes of processed entities + last analysis hash)
  let hashes = new Map<string, string>();
  let lastAnalysisHash = '';
  let savedEntityCount = 0;
  try {
    if (existsSync(stateFile)) {
      const raw = JSON.parse(readFileSync(stateFile, 'utf-8'));
      const currentCount = vaultEntityCount(vault.baseDir);
      if (raw.entityCount == null && raw.vaultFingerprint) {
        console.log('[Synthesizer] Migrating state from vaultFingerprint to entityCount');
        hashes = new Map();
        lastAnalysisHash = '';
      } else if (raw.entityCount != null && currentCount < raw.entityCount) {
        console.log(
          `[Synthesizer] Vault entity count decreased (${raw.entityCount} → ${currentCount}) — resetting state`,
        );
        hashes = new Map();
        lastAnalysisHash = '';
      } else {
        hashes = new Map(Object.entries(raw.hashes ?? {}));
        lastAnalysisHash = raw.lastAnalysisHash ?? '';
      }
      savedEntityCount = currentCount;
    }
  } catch {
    /* fresh */
  }

  function saveState(): void {
    const dir = dirname(stateFile);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(
      stateFile,
      JSON.stringify({
        hashes: Object.fromEntries(hashes),
        lastAnalysisHash,
        entityCount: savedEntityCount ?? vaultEntityCount(vault.baseDir),
      }),
      'utf-8',
    );
  }

  /** Score a candidate entity for distillation potential. */
  function scoreCandidate(entity: Entity): number {
    let score = 0;
    const text = `${entity.name} ${entity.body}`.toLowerCase();

    // Body length (up to 0.3)
    score += Math.min(text.length / 3000, 0.3);

    // Keyword signals
    for (const { keywords, weight } of SCORING_KEYWORDS) {
      if (keywords.some((kw) => text.includes(kw))) score += weight;
    }

    // Structural markers
    if (text.includes('## outcome') || text.includes('## result')) score += 0.1;
    if (text.includes('## context') || text.includes('## background')) score += 0.1;

    return score;
  }

  /** Stage 2: Deduplicate learning specs via fuzzy title matching. */
  function deduplicateSpecs(specs: LearningSpec[]): LearningSpec[] {
    const merged: LearningSpec[] = [];

    for (const spec of specs) {
      let found = false;
      for (const existing of merged) {
        if (
          existing.type === spec.type &&
          overlapCoefficient(existing.title, spec.title) >= dedupThreshold
        ) {
          // Merge: combine evidence, bump confidence
          existing.sourceCount += spec.sourceCount;
          existing.evidence = [...new Set([...existing.evidence, ...spec.evidence])];
          existing.sourceIds = [...new Set([...existing.sourceIds, ...spec.sourceIds])];
          if (existing.sourceCount >= 3 && existing.confidence === 'low')
            existing.confidence = 'medium';
          if (existing.sourceCount >= 2 && existing.confidence === 'medium')
            existing.confidence = 'high';
          found = true;
          break;
        }
      }
      if (!found) merged.push({ ...spec });
    }

    // Also check against existing vault learnings
    const existingLearnings = [
      ...vault.list('assumption'),
      ...vault.list('decision'),
      ...vault.list('constraint'),
      ...vault.list('contradiction'),
      ...vault.list('synthesis'),
    ];

    return merged.filter((spec) => {
      return !existingLearnings.some(
        (existing) => overlapCoefficient(existing.name, spec.title) >= 0.8,
      );
    });
  }

  return {
    /**
     * Run the full synthesis pipeline.
     * Returns the number of learning records created.
     */
    async synthesize(): Promise<number> {
      // Collect candidates from all entity types (including decisions)
      // Self-filter guard: exclude entities already tagged 'synthesized' to prevent feedback loops
      const allEntities = [
        ...vault.list('execution'),
        ...vault.list('insight'),
        ...vault.list('agent'),
        ...vault.list('decision'),
      ].filter(
        (e) => !e.tags.includes('synthesized') && !(e as Record<string, unknown>).decayed_from,
      );

      // Score and filter candidates
      const candidates = allEntities
        .filter((e) => {
          const hash = md5(e.body);
          if (hashes.get(e.id) === hash) return false; // Skip unchanged
          hashes.set(e.id, hash);
          return true;
        })
        .filter((e) => scoreCandidate(e) >= scoreThreshold);

      if (candidates.length === 0) {
        saveState();
        return 0;
      }

      // Stage 1: Extract learnings via LLM
      const allSpecs: LearningSpec[] = [];
      for (const candidate of candidates) {
        try {
          const prompt = buildExtractionPrompt(candidate);
          const response = await analysisFn(prompt);
          const specs = parseExtractionResponse(response, candidate);
          allSpecs.push(...specs);
        } catch {
          // Skip failed extractions, continue batch
        }
      }

      if (allSpecs.length === 0) {
        saveState();
        return 0;
      }

      // Stage 2: Deduplicate (pure code)
      const deduplicated = deduplicateSpecs(allSpecs);

      // Stage 3: Create learning records via LLM
      let created = 0;
      for (const spec of deduplicated) {
        try {
          const entityType = spec.type as Entity['type'];
          writeToLayer(vault, 'synthesizer', 'emerging', {
            type: entityType,
            name: spec.title,
            status: 'active',
            claim: spec.claim,
            confidence: spec.confidence,
            confidence_score:
              spec.confidence === 'high' ? 0.9 : spec.confidence === 'medium' ? 0.6 : 0.3,
            evidence: spec.evidence,
            evidence_links: spec.sourceIds,
            sourceIds: spec.sourceIds,
            decay_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
            tags: ['synthesized', spec.type],
            related: spec.sourceIds.map((id) => `execution/${id}`),
            body: `## ${spec.title}\n\n${spec.claim}\n\n### Evidence\n${spec.evidence.map((e) => `- ${e}`).join('\n')}`,
          } as Partial<Entity> & { type: string; name: string });
          created++;
        } catch {
          // Skip failed creates, continue
        }
      }

      // Check if any insights suggest policies
      for (const spec of deduplicated) {
        if (
          spec.confidence === 'high' &&
          (spec.type === 'constraint' || spec.type === 'decision')
        ) {
          try {
            const policyPrompt = `Based on this ${spec.type}: "${spec.claim}", suggest a guard policy. Return JSON: { "scope": "...", "conditions": "...", "enforcement": "warn|error|abort", "thresholds": {} }`;
            const policyResponse = await analysisFn(policyPrompt);
            const policyData = JSON.parse(policyResponse);
            if (!policyData.scope)
              console.warn(`[Synthesizer] Policy for '${spec.title}' missing scope`);
            writeToLayer(vault, 'synthesizer', 'emerging', {
              type: 'policy',
              name: `Policy: ${spec.title}`,
              status: 'draft',
              scope: policyData.scope ?? 'unattributed',
              conditions: policyData.conditions ?? spec.claim,
              enforcement: policyData.enforcement ?? 'warn',
              thresholds: policyData.thresholds,
              confidence_score: 0.7,
              evidence_links: spec.sourceIds,
              decay_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
              tags: ['synthesized', 'auto-policy'],
              related: [`${spec.type}/${spec.title}`],
              body: `Auto-generated policy from ${spec.type}: ${spec.claim}`,
            } as Partial<Entity> & { type: string; name: string });
          } catch {
            // Policy creation is best-effort
          }
        }
      }

      saveState();
      return created;
    },

    /** Score a single entity (for testing/debugging). */
    scoreCandidate,

    /**
     * Analyze agent-level statistics via LLM.
     * Unlike synthesize() which scores individual entity bodies,
     * this builds a rich prompt from aggregate agent data and
     * asks the LLM to extract insights, patterns, and policy suggestions.
     * Returns the number of learnings created.
     */
    async analyzeAgents(): Promise<number> {
      const agents = vault.list('agent');
      if (agents.length === 0) return 0;

      // Build agent stats string
      const agentSummaries: string[] = [];
      for (const agent of agents) {
        const data = agent as Record<string, unknown>;
        const total = (data.totalExecutions as number) ?? 0;
        if (total === 0) continue;
        const failRate = (data.failureRate as number) ?? 0;
        const failCount = Math.round(total * failRate);
        agentSummaries.push(
          `- ${agent.name}: ${total} runs, ${failCount} failures (${(failRate * 100).toFixed(1)}%)`,
        );
      }
      const statsString = agentSummaries.join('\n');

      // --- Change detection: skip if stats haven't changed ---
      const currentHash = md5(statsString);
      if (currentHash === lastAnalysisHash) {
        console.log('[Soma Synthesizer] Agent stats unchanged — skipping analysis');
        return 0;
      }

      // --- Collect existing knowledge to include in prompt ---
      const existingTypes = [
        'insight',
        'decision',
        'assumption',
        'constraint',
        'contradiction',
        'synthesis',
      ];
      const existingTitles: string[] = [];
      for (const type of existingTypes) {
        for (const e of vault.list(type)) {
          if (e.tags.includes('synthesized')) existingTitles.push(`[${e.type}] ${e.name}`);
        }
      }
      for (const p of vault.list('policy')) {
        existingTitles.push(`[policy] ${p.name}`);
      }

      const existingKnowledgeSection =
        existingTitles.length > 0
          ? `\nThe following insights and policies ALREADY EXIST in the knowledge vault.\nDo NOT repeat or rephrase these. Only return genuinely NEW findings:\n${existingTitles.map((t) => `- ${t}`).join('\n')}\n`
          : '';

      const prompt = `You are analyzing AI agent execution statistics from an organizational knowledge vault.

Here are all agents and their performance:

${statsString}
${existingKnowledgeSection}
Based on this data, extract NEW insights, decisions, constraints, and contradictions that are NOT already covered above.

For each finding, return a JSON array:
[
  {
    "type": "insight|decision|constraint|contradiction",
    "title": "Short descriptive title",
    "claim": "What was found or should be done",
    "confidence": "low|medium|high",
    "evidence": ["supporting data point 1", "supporting data point 2"],
    "agentIds": ["agent-name-1"]
  }
]

Focus on:
- Agents with high failure rates — what policies should be enforced?
- Patterns across agents — do similar agents fail similarly?
- Reliability trends — which agents are healthy vs. problematic?
- Suggested guard thresholds based on the data

Return [] if all meaningful insights are already covered above.`;

      try {
        const response = await analysisFn(prompt);
        if (!response) {
          console.warn('[Soma Synthesizer] LLM returned empty response for agent analysis');
          return 0;
        }
        const match = response.match(/\[[\s\S]*\]/);
        if (!match) {
          console.warn(
            '[Soma Synthesizer] No JSON array found in LLM response (' +
              response.length +
              ' chars)',
          );
          return 0;
        }

        // Try to parse; if truncated, attempt to fix by closing open brackets
        let parsed: unknown[];
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          // Attempt repair: trim to last complete object, close array
          let fixable = match[0];
          // Find last complete }, then close ]
          const lastBrace = fixable.lastIndexOf('}');
          if (lastBrace > 0) {
            fixable = fixable.slice(0, lastBrace + 1) + ']';
            try {
              parsed = JSON.parse(fixable);
            } catch {
              console.warn(
                '[Soma Synthesizer] Could not parse LLM JSON response (even after repair)',
              );
              return 0;
            }
          } else {
            console.warn('[Soma Synthesizer] Could not parse LLM JSON response');
            return 0;
          }
        }

        if (!Array.isArray(parsed)) return 0;
        console.log(`[Soma Synthesizer] Extracted ${parsed.length} insights from LLM`);

        let created = 0;
        let superseded = 0;
        let skippedDupes = 0;
        const confidenceRank: Record<string, number> = { high: 3, medium: 2, low: 1 };

        for (const rawItem of parsed) {
          const item = rawItem as Record<string, unknown>;
          const entityType = String(item.type ?? 'insight');
          const title = String(item.title ?? 'Untitled');
          const claim = String(item.claim ?? '');
          const confidence = String(item.confidence ?? 'medium');
          const evidence = Array.isArray(item.evidence) ? item.evidence.map(String) : [];
          const agentIds = Array.isArray(item.agentIds) ? item.agentIds.map(String) : [];

          // Check for existing match — supersede or skip
          const existingMatch = vault
            .list(entityType)
            .find((e) => overlapCoefficient(e.name, title) >= dedupThreshold);

          if (existingMatch) {
            const existingConf =
              ((existingMatch as Record<string, unknown>).confidence as string) ?? 'low';
            const existingEvidence = (existingMatch as Record<string, unknown>).evidence;
            const existingEvidenceArr = Array.isArray(existingEvidence)
              ? existingEvidence.map(String)
              : [];
            const newEvidenceItems = evidence.filter((ev) => !existingEvidenceArr.includes(ev));

            // Supersede if new version has higher confidence or new evidence
            if (
              (confidenceRank[confidence] ?? 0) > (confidenceRank[existingConf] ?? 0) ||
              newEvidenceItems.length > 0
            ) {
              const mergedEvidence = [...new Set([...existingEvidenceArr, ...evidence])];
              const bestConfidence =
                (confidenceRank[confidence] ?? 0) >= (confidenceRank[existingConf] ?? 0)
                  ? confidence
                  : existingConf;
              vault.update(existingMatch.id, {
                claim,
                confidence: bestConfidence,
                evidence: mergedEvidence,
                body: `## ${existingMatch.name}\n\n${claim}\n\n### Evidence\n${mergedEvidence.map((e: string) => `- ${e}`).join('\n')}`,
              } as Partial<Entity>);
              superseded++;
            } else {
              skippedDupes++;
            }
            continue;
          }

          try {
            writeToLayer(vault, 'synthesizer', 'emerging', {
              type: entityType as Entity['type'],
              name: title,
              status: 'active',
              claim,
              confidence,
              confidence_score: confidence === 'high' ? 0.9 : confidence === 'medium' ? 0.6 : 0.3,
              evidence,
              evidence_links: agentIds,
              sourceIds: agentIds,
              decay_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
              tags: ['synthesized', entityType, 'agent-analysis'],
              related: agentIds.map((id: string) => `agent/${id}`),
              body: `## ${title}\n\n${claim}\n\n### Evidence\n${evidence.map((e: string) => `- ${e}`).join('\n')}`,
            } as Partial<Entity> & { type: string; name: string });
            created++;
          } catch {
            /* skip */
          }
        }

        if (skippedDupes > 0 || superseded > 0) {
          console.log(
            `[Soma Synthesizer] ${skippedDupes} skipped, ${superseded} superseded, ${created} new`,
          );
        }

        // Store hash so we skip next time if nothing changed
        lastAnalysisHash = currentHash;

        // Check for policy suggestions from high-confidence constraints
        for (const rawItem2 of parsed) {
          const item2 = rawItem2 as Record<string, unknown>;
          if (
            item2.confidence === 'high' &&
            (item2.type === 'constraint' || item2.type === 'decision')
          ) {
            const policyTitle = `Policy: ${item2.title}`;

            // Dedup: skip if similar policy already exists
            if (isDuplicateInVault(vault, 'policy', policyTitle, dedupThreshold)) {
              continue;
            }

            try {
              const policyPrompt = `Based on this ${item2.type}: "${item2.claim}", suggest a guard policy for an AI agent system. Return JSON: { "scope": "...", "conditions": "...", "enforcement": "warn|error|abort", "thresholds": {} }`;
              const policyResponse = await analysisFn(policyPrompt);
              const policyMatch = policyResponse.match(/\{[\s\S]*\}/);
              if (policyMatch) {
                const policyData = JSON.parse(policyMatch[0]);
                if (!policyData.scope)
                  console.warn(`[Synthesizer] Policy '${policyTitle}' missing scope`);
                writeToLayer(vault, 'synthesizer', 'emerging', {
                  type: 'policy',
                  name: policyTitle,
                  status: 'draft',
                  scope: policyData.scope ?? 'unattributed',
                  conditions: policyData.conditions ?? item2.claim,
                  enforcement: policyData.enforcement ?? 'warn',
                  thresholds: policyData.thresholds,
                  confidence_score: 0.7,
                  evidence_links: (item2.agentIds as string[]) ?? [],
                  decay_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
                  tags: ['synthesized', 'auto-policy', 'agent-analysis'],
                  related: ((item2.agentIds as string[]) ?? []).map((id: string) => `agent/${id}`),
                  body: `Auto-generated policy from ${item2.type}: ${item2.claim}`,
                } as Partial<Entity> & { type: string; name: string });
              }
            } catch {
              /* policy creation is best-effort */
            }
          }
        }

        saveState();
        return created;
      } catch (err) {
        console.error(
          '[Soma Synthesizer] analyzeAgents error:',
          err instanceof Error ? err.message : String(err),
        );
        return 0;
      }
    },

    /**
     * Synthesize L1 entries into L3 proposals.
     * Detects recurring patterns across multiple agent traces and
     * generates L3 (Emerging Knowledge) proposals with confidence scores
     * and evidence links to source L1 entries.
     *
     * Enforces write restriction: only L3 writes allowed.
     */
    async synthesizeL3(): Promise<number> {
      // Enforce Synthesizer can only write to L3
      enforceWritePermission('synthesizer', 'emerging');

      // Get L1 entries for pattern detection
      const l1Entries = queryByLayer(vault, 'archive');
      if (l1Entries.length < 3) return 0; // Need minimum entries for pattern detection

      // Group L1 entries by agent to detect cross-agent patterns
      const byAgent = new Map<string, Entity[]>();
      for (const entry of l1Entries) {
        if (!entry.agent_id) {
          console.warn(
            `[Synthesizer] Skipping entry ${entry.id} from agent grouping: missing agent_id`,
          );
          continue;
        }
        if (!byAgent.has(entry.agent_id)) byAgent.set(entry.agent_id, []);
        byAgent.get(entry.agent_id)!.push(entry);
      }

      // Find recurring patterns (content that appears across multiple agents)
      const patternCandidates: {
        content: string;
        evidenceIds: string[];
        agentCount: number;
        sourceAgents: string[];
      }[] = [];

      const l1Array = l1Entries.filter((e) => !e.superseded_by); // Skip superseded
      for (let i = 0; i < l1Array.length; i++) {
        const entry = l1Array[i]!;
        const matches: string[] = [entry.id];
        const agents = new Set(entry.agent_id ? [entry.agent_id] : []);

        for (let j = i + 1; j < l1Array.length; j++) {
          const other = l1Array[j]!;
          const similarity = overlapCoefficient(entry.body, other.body);
          if (similarity >= 0.5) {
            matches.push(other.id);
            if (other.agent_id) agents.add(other.agent_id);
          }
        }

        if (matches.length >= 3) {
          patternCandidates.push({
            content: entry.body,
            evidenceIds: matches,
            agentCount: agents.size,
            sourceAgents: [...agents],
          });
        }
      }

      if (patternCandidates.length === 0) {
        saveState();
        return 0;
      }

      // Generate L3 proposals via LLM
      let created = 0;
      const decayAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(); // 90 days default

      for (const candidate of patternCandidates.slice(0, 20)) {
        // Cap at 20 per run
        try {
          const prompt = `You are analyzing recurring patterns found across ${candidate.agentCount} agents and ${candidate.evidenceIds.length} traces.

Pattern content sample:
${candidate.content.slice(0, 2000)}

Synthesize this into a concise organizational knowledge proposal. Return JSON:
{ "title": "Short title", "claim": "What was discovered", "confidence": 0.0-1.0 }

Set confidence based on: number of supporting traces (${candidate.evidenceIds.length}), cross-agent corroboration (${candidate.agentCount} agents).`;

          const response = await analysisFn(prompt);
          const match = response.match(/\{[\s\S]*\}/);
          if (!match) continue;

          const data = JSON.parse(match[0]);
          const confidenceScore = Math.max(0, Math.min(1, Number(data.confidence) || 0.5));

          // Dedup: check if similar proposal already exists in L3
          const existingL3 = queryByLayer(vault, 'emerging');
          const isDuplicate = existingL3.some(
            (e) => overlapCoefficient(e.name, String(data.title)) >= dedupThreshold,
          );
          if (isDuplicate) continue;

          writeToLayer(vault, 'synthesizer', 'emerging', {
            type: 'insight',
            name: String(data.title),
            status: 'pending',
            confidence_score: confidenceScore,
            evidence_links: candidate.evidenceIds,
            source_agents: candidate.sourceAgents,
            decay_at: decayAt,
            tags: ['synthesized', 'l3-proposal'],
            related: candidate.evidenceIds.map((id) => `execution/${id}`),
            body: `## ${data.title}\n\n${data.claim}\n\n### Evidence\nBased on ${candidate.evidenceIds.length} traces across ${candidate.agentCount} agents.`,
          } as Partial<Entity> & { type: string; name: string });
          created++;
        } catch {
          // Skip failed extractions
        }
      }

      saveState();
      return created;
    },

    /**
     * Synthesize decision entities into L3 proposals via pattern clustering.
     * Groups decisions by decision_type and agent, detects recurring patterns,
     * and generates L3 proposals with confidence scoring.
     *
     * Returns the number of L3 proposals created.
     */
    async synthesizeDecisions(): Promise<number> {
      enforceWritePermission('synthesizer', 'emerging');

      // Get all decision entities from vault (including graph-inferred)
      const decisions = vault.list('decision');
      if (decisions.length < 2) return 0;

      // Group by decision_type
      const byType = new Map<string, Entity[]>();
      for (const d of decisions) {
        const dtype =
          ((d as Record<string, unknown>).decision_type as string) ?? 'untyped:decision';
        if (!(d as Record<string, unknown>).decision_type)
          console.warn(
            `[Synthesizer] Decision ${d.id} missing decision_type, using 'untyped:decision'`,
          );
        if (!byType.has(dtype)) byType.set(dtype, []);
        byType.get(dtype)!.push(d);
      }

      let created = 0;
      const decayAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

      for (const [decisionType, group] of byType) {
        if (group.length < 2) continue;

        // Cluster by content similarity within this decision type
        const clusters: Entity[][] = [];
        const used = new Set<string>();

        for (let i = 0; i < group.length; i++) {
          const entry = group[i]!;
          if (used.has(entry.id)) continue;

          const cluster = [entry];
          used.add(entry.id);

          for (let j = i + 1; j < group.length; j++) {
            const other = group[j]!;
            if (used.has(other.id)) continue;
            if (overlapCoefficient(entry.body, other.body) >= 0.4) {
              cluster.push(other);
              used.add(other.id);
            }
          }

          if (cluster.length >= 2) {
            clusters.push(cluster);
          }
        }

        // Generate L3 proposals from clusters
        for (const cluster of clusters.slice(0, 10)) {
          const agents = [
            ...new Set(cluster.map((e) => (e as Record<string, unknown>).agent_id).filter(Boolean)),
          ];
          const evidenceIds = cluster.map((e) => e.id);
          const confidenceScore = Math.min(0.9, 0.3 + cluster.length * 0.1 + agents.length * 0.1);
          const title = `${decisionType} pattern: ${cluster[0]!.name.slice(0, 60)}`;

          // Dedup: check if similar proposal already exists in L3
          const existingL3 = queryByLayer(vault, 'emerging');
          const isDuplicate = existingL3.some(
            (e) => overlapCoefficient(e.name, title) >= dedupThreshold,
          );
          if (isDuplicate) continue;

          try {
            writeToLayer(vault, 'synthesizer', 'emerging', {
              type: 'insight',
              name: title,
              status: 'pending',
              confidence_score: confidenceScore,
              evidence_links: evidenceIds,
              source_agents: agents.map(String),
              decay_at: decayAt,
              decision_type: decisionType,
              tags: ['synthesized', 'l3-proposal', 'decision-pattern'],
              related: evidenceIds.map((id) => `decision/${id}`),
              body: `## Decision Pattern: ${decisionType}\n\nRecurring ${decisionType} pattern detected across ${agents.length} agent(s) and ${cluster.length} decisions.\n\n### Evidence\n${evidenceIds.map((id) => `- [[decision/${id}]]`).join('\n')}`,
            } as Partial<Entity> & { type: string; name: string });
            created++;
          } catch {
            // Skip failed writes
          }
        }
      }

      saveState();
      return created;
    },

    /**
     * Detect decision divergence between agents with similar patterns.
     * Compares decision chains across agents to find where failing agents
     * make different choices than successful ones.
     */
    synthesizeDecisionDivergence(): number {
      const executions = vault.list('execution');
      const agents = vault.list('agent');

      // Build per-agent decision data
      const agentDecisions = new Map<
        string,
        {
          patterns: string[];
          successRate: number;
          decisions: Array<{ action: string; outcome: string; tool?: string }[]>;
        }
      >();

      for (const exec of executions) {
        const data = exec as Record<string, unknown>;
        const agentId = resolveAgentId(data);
        const decisions = data.decisions as
          | Array<{ action: string; outcome: string; tool?: string }>
          | undefined;
        const pattern = data.decisionPattern as string | undefined;
        if (!agentId || !decisions || decisions.length === 0) continue;

        if (!agentDecisions.has(agentId)) {
          const agent = agents.find(
            (a) => a.name === agentId || (a as Record<string, unknown>).agentId === agentId,
          );
          const failureRate = ((agent as Record<string, unknown>)?.failureRate as number) ?? 0;
          agentDecisions.set(agentId, {
            patterns: [],
            successRate: 1 - failureRate,
            decisions: [],
          });
        }

        const entry = agentDecisions.get(agentId)!;
        if (pattern) entry.patterns.push(pattern);
        entry.decisions.push(decisions);
      }

      // Need at least 2 agents with decision data
      const agentsWithData = [...agentDecisions.entries()].filter(
        ([, v]) => v.decisions.length >= 3,
      );
      if (agentsWithData.length < 2) return 0;

      // Find pairs with >20% success rate gap
      let created = 0;

      for (let i = 0; i < agentsWithData.length; i++) {
        for (let j = i + 1; j < agentsWithData.length; j++) {
          const [agentA, dataA] = agentsWithData[i]!;
          const [agentB, dataB] = agentsWithData[j]!;

          const gap = Math.abs(dataA.successRate - dataB.successRate);
          if (gap < 0.2) continue; // Need meaningful difference

          const [winner, winnerData] =
            dataA.successRate > dataB.successRate ? [agentA, dataA] : [agentB, dataB];
          const [loser, loserData] =
            dataA.successRate > dataB.successRate ? [agentB, dataB] : [agentA, dataA];

          // Build action frequency + outcome maps
          const winnerActions = new Map<string, { total: number; ok: number }>();
          const loserActions = new Map<string, { total: number; ok: number }>();

          for (const chain of winnerData.decisions) {
            for (const d of chain) {
              const cur = winnerActions.get(d.action) ?? { total: 0, ok: 0 };
              cur.total++;
              if (d.outcome === 'ok') cur.ok++;
              winnerActions.set(d.action, cur);
            }
          }
          for (const chain of loserData.decisions) {
            for (const d of chain) {
              const cur = loserActions.get(d.action) ?? { total: 0, ok: 0 };
              cur.total++;
              if (d.outcome === 'ok') cur.ok++;
              loserActions.set(d.action, cur);
            }
          }

          // Task similarity filter: skip agents doing unrelated tasks
          const winnerActionSet = new Set(winnerActions.keys());
          const loserActionSet = new Set(loserActions.keys());
          let intersection = 0;
          for (const a of winnerActionSet) {
            if (loserActionSet.has(a)) intersection++;
          }
          const actionOverlap = intersection / Math.min(winnerActionSet.size, loserActionSet.size);
          if (actionOverlap < 0.3) continue; // Agents doing different tasks — skip

          // Find actions unique to winner or loser
          const winnerOnly = [...winnerActions.keys()].filter((a) => !loserActions.has(a));
          const loserOnly = [...loserActions.keys()].filter((a) => !winnerActions.has(a));

          if (winnerOnly.length === 0 && loserOnly.length === 0) continue;

          const insightName = `Decision divergence: ${loser} vs ${winner}`;
          const existingL3 = queryByLayer(vault, 'emerging');
          if (existingL3.some((e) => overlapCoefficient(e.name, insightName) >= dedupThreshold))
            continue;

          // Build claim with per-action success rates
          const fmtRate = (stats: { total: number; ok: number }) =>
            `${((stats.ok / Math.max(1, stats.total)) * 100).toFixed(0)}%`;
          const claim =
            `${winner} (${(winnerData.successRate * 100).toFixed(0)}% overall) and ${loser} (${(loserData.successRate * 100).toFixed(0)}% overall) show different decision patterns. ` +
            (winnerOnly.length > 0
              ? `${winner} uses: ${winnerOnly
                  .slice(0, 3)
                  .map((a) => `${a} (${fmtRate(winnerActions.get(a)!)} success)`)
                  .join(', ')}. `
              : '') +
            (loserOnly.length > 0
              ? `${loser} uses instead: ${loserOnly
                  .slice(0, 3)
                  .map((a) => `${a} (${fmtRate(loserActions.get(a)!)} success)`)
                  .join(', ')}.`
              : '');

          try {
            writeToLayer(vault, 'synthesizer', 'emerging', {
              type: 'insight',
              name: insightName,
              status: 'active',
              tags: ['synthesized', 'divergence', 'actionable'],
              claim,
              confidence_score: Math.min(0.9, 0.5 + gap),
              evidence_links: [winner, loser],
              source_agents: [winner, loser],
              body: `## Decision Divergence\n\n${claim}\n\n### ${winner} actions\n${[...winnerActions.entries()].map(([a, s]) => `- ${a} (${s.total}x, ${fmtRate(s)} success)`).join('\n')}\n\n### ${loser} actions\n${[...loserActions.entries()].map(([a, s]) => `- ${a} (${s.total}x, ${fmtRate(s)} success)`).join('\n')}`,
            } as Partial<Entity> & { type: string; name: string });
            created++;
          } catch {
            /* skip duplicates */
          }
        }
      }

      return created;
    },
  };
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildExtractionPrompt(entity: Entity): string {
  return `You are analyzing a knowledge record to extract learnings.

Record type: ${entity.type}
Record name: ${entity.name}
Content (first 4000 chars):
${entity.body.slice(0, 4000)}

Extract any assumptions, decisions, constraints, or contradictions from this record.
Return a JSON array of objects with: { "type": "assumption|decision|constraint|contradiction", "title": "...", "claim": "...", "confidence": "low|medium|high", "evidence": ["..."] }

Return [] if no learnings found.`;
}

function parseExtractionResponse(response: string, source: Entity): LearningSpec[] {
  try {
    // Find JSON array in response
    const match = response.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item: Record<string, unknown>) => ({
      type: String(item.type ?? 'assumption'),
      title: String(item.title ?? 'Untitled'),
      claim: String(item.claim ?? ''),
      confidence: (item.confidence as 'low' | 'medium' | 'high') ?? 'low',
      evidence: Array.isArray(item.evidence) ? item.evidence.map(String) : [],
      sourceIds: [source.id],
      sourceCount: 1,
    }));
  } catch {
    return [];
  }
}
