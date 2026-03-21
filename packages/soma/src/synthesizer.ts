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
import type { Entity, SynthesizerConfig, Vault } from './types.js';

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

  // Load state (MD5 hashes of processed entities)
  let hashes = new Map<string, string>();
  try {
    if (existsSync(stateFile)) {
      const raw = JSON.parse(readFileSync(stateFile, 'utf-8'));
      hashes = new Map(Object.entries(raw.hashes ?? {}));
    }
  } catch {
    /* fresh */
  }

  function saveState(): void {
    const dir = dirname(stateFile);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(stateFile, JSON.stringify({ hashes: Object.fromEntries(hashes) }), 'utf-8');
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
      // Collect candidates from all entity types
      const allEntities = [
        ...vault.list('execution'),
        ...vault.list('insight'),
        ...vault.list('agent'),
      ];

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
          vault.create({
            type: entityType,
            name: spec.title,
            status: 'active',
            claim: spec.claim,
            confidence: spec.confidence,
            evidence: spec.evidence,
            sourceIds: spec.sourceIds,
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
            vault.create({
              type: 'policy',
              name: `Policy: ${spec.title}`,
              status: 'draft',
              scope: policyData.scope ?? 'unknown',
              conditions: policyData.conditions ?? spec.claim,
              enforcement: policyData.enforcement ?? 'warn',
              thresholds: policyData.thresholds,
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
