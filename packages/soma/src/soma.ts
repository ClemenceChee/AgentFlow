/**
 * Soma orchestrator — coordinates all workers.
 *
 * @module
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PolicySource } from 'agentflow-core';
import { createCartographer } from './cartographer.js';
import { createDecayProcessor } from './decay.js';
import type { GovernanceAPI } from './governance.js';
import { createGovernanceAPI } from './governance.js';
import { createHarvester } from './harvester.js';
import { setLayersConfig } from './layers.js';
import { evaluateAssertions } from './ops-intel/assertions.js';
import { detectDrift, trackConformanceTrend } from './ops-intel/drift.js';
import type { ConformanceHistory, OutcomeAssertion } from './ops-intel/types.js';
import type { LayerPolicyBridge } from './policy-bridge.js';
import { createPolicyBridge } from './policy-bridge.js';
import { createReconciler } from './reconciler.js';
import { createSynthesizer } from './synthesizer.js';
import type { Entity, SomaConfig, Vault, VectorStore } from './types.js';
import { createVault } from './vault.js';
import { createJsonVectorStore } from './vector-store.js';

export interface Soma {
  /** The knowledge vault. */
  vault: Vault;
  /** The vector store for semantic search. */
  vectorStore: VectorStore;
  /** The legacy PolicySource bridge for AgentFlow guards. */
  policySource: PolicySource;
  /** The layer-aware Policy Bridge. */
  policyBridge: LayerPolicyBridge;
  /** Governance API for L3→L4 promotion. */
  governance: GovernanceAPI;
  /** Harvester worker instance. */
  harvester: ReturnType<typeof createHarvester>;
  /** Synthesizer worker instance (if analysisFn provided). */
  synthesizer?: ReturnType<typeof createSynthesizer>;
  /** Cartographer worker instance. */
  cartographer: ReturnType<typeof createCartographer>;
  /** Reconciler worker instance. */
  reconciler: ReturnType<typeof createReconciler>;
  /** Decay processor instance. */
  decayProcessor: ReturnType<typeof createDecayProcessor>;

  /**
   * Run the full pipeline: Harvester → Reconciler → Synthesizer → Cartographer → Decay.
   */
  run(): Promise<{
    harvested: number;
    reconciled: { issues: number; fixed: number; mergeErrors: number };
    synthesized: number;
    autoPromoted: number;
    mapped: number;
    decayed: number;
    drift: { tracked: number; alerts: number };
    assertionFailures: number;
  }>;

  /**
   * Watch an inbox directory for new files, triggering the Harvester.
   */
  watch(inboxDir?: string): () => void;
}

/**
 * Create a Soma instance with all workers configured.
 */
export function createSoma(config?: SomaConfig): Soma {
  const vaultDir = config?.vaultDir ?? '.soma/vault';
  const inboxDir = config?.inboxDir ?? '.soma/inbox';

  // Configure layer topology (L2 opt-in)
  if (config?.layers) setLayersConfig(config.layers);

  const vault = createVault({ baseDir: vaultDir });
  const vectorStore = config?.vectorStore ?? createJsonVectorStore(`${vaultDir}/../_vectors.json`);
  const policyBridge = createPolicyBridge(vault);
  const policySource = policyBridge.policySource;
  const governance = createGovernanceAPI(vault);
  const decayProcessor = createDecayProcessor(vault, config?.decay);

  // Wire decay-on-read: single-entity reads extend TTL for L2/L3 entries
  vault.setOnRead((entity) => decayProcessor.extendDecayOnAccess(entity));

  const harvester = createHarvester(vault, config?.harvester);
  const synthesizer = config?.analysisFn
    ? createSynthesizer(vault, config.analysisFn, config?.synthesizer)
    : undefined;
  const cartographer = createCartographer(
    vault,
    vectorStore,
    config?.embedFn,
    config?.cartographer,
  );
  const reconciler = createReconciler(vault, config?.analysisFn, config?.reconciler);

  return {
    vault,
    vectorStore,
    policySource,
    policyBridge,
    governance,
    harvester,
    synthesizer,
    cartographer,
    reconciler,
    decayProcessor,

    async run() {
      // 1. Harvest from inbox
      const harvested = await harvester.processInbox(inboxDir);

      // 2. Reconcile (fix issues + L1 dedup)
      const reconcileResult = await reconciler.run();
      const l1Result = reconciler.reconcileL1();

      // 3. Synthesize (extract knowledge + L1→L3 proposals + decision patterns + divergence)
      let synthesized = 0;
      if (synthesizer) {
        synthesized = await synthesizer.synthesize();
        synthesized += await synthesizer.synthesizeL3();
        synthesized += await synthesizer.synthesizeDecisions();
        synthesized += synthesizer.synthesizeDecisionDivergence();
      }

      // 3b. Auto-promote high-confidence proposals (if enabled)
      const autoPromoteResult = governance.autoPromote(config?.governance?.autoPromote);

      // 3c. Track conformance drift per agent
      const driftStateFile = `${vaultDir}/../conformance-history.json`;
      let conformanceHistory: ConformanceHistory = [];
      try {
        if (existsSync(driftStateFile)) {
          conformanceHistory = JSON.parse(readFileSync(driftStateFile, 'utf-8'));
        }
      } catch {
        /* fresh history */
      }

      // Collect agent conformance from agent entities
      // Conformance score = 1 - failureRate (derived from agent stats)
      const agents = vault.list('agent');
      let driftTracked = 0;
      let driftAlerts = 0;

      for (const agent of agents) {
        const data = agent as Record<string, unknown>;
        const failureRate = data.failureRate as number | undefined;
        const totalExecutions = data.totalExecutions as number | undefined;
        // Use explicit lastConformanceScore if set, otherwise derive from failureRate
        const conformanceScore =
          (data.lastConformanceScore as number | undefined) ??
          (failureRate != null ? 1 - failureRate : undefined);
        if (conformanceScore != null && (totalExecutions ?? 0) > 0) {
          conformanceHistory = trackConformanceTrend(conformanceHistory, {
            agentId: agent.name,
            score: conformanceScore,
            runId: `run-${Date.now()}`,
          });
          driftTracked++;
        }
      }

      // Run drift detection on accumulated history
      const agentIds = [...new Set(conformanceHistory.map((e) => e.agentId))];
      for (const agentId of agentIds) {
        const agentHistory = conformanceHistory.filter((e) => e.agentId === agentId);
        const driftReport = detectDrift(agentHistory);

        if (driftReport.status === 'degrading' && driftReport.alert) {
          // Create drift alert entity in vault
          try {
            vault.create({
              type: 'insight',
              name: `Drift alert: ${agentId}`,
              status: 'active',
              tags: ['drift-alert', 'auto-generated'],
              body: driftReport.alert.message,
            } as Partial<Entity> & { type: string; name: string });
            driftAlerts++;
          } catch {
            /* skip if already exists */
          }
        }
      }

      // Persist conformance history (keep last 500 entries per agent)
      const trimmedHistory = conformanceHistory.slice(-5000);
      try {
        const dir = dirname(driftStateFile);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(driftStateFile, JSON.stringify(trimmedHistory), 'utf-8');
      } catch {
        /* non-fatal */
      }

      // 4. Map (embed + discover + relationship mapping + contradiction detection)
      const embedded = await cartographer.embed();
      const archetypes = await cartographer.discover();
      await cartographer.mapRelationships();
      cartographer.detectContradictions();

      // 5. Process decay (move expired L2/L3 entries to L1)
      const decayResult = decayProcessor.processDecay();

      // 6. Evaluate outcome assertions (if configured)
      let assertionFailures = 0;
      if (config?.assertions && config.assertions.length > 0) {
        const violations = await evaluateAssertions(
          config.assertions as OutcomeAssertion[],
          'soma-pipeline',
        );
        for (const v of violations) {
          try {
            vault.create({
              type: 'insight',
              name: `Assertion failed: ${v.explanation?.rule ?? v.message}`,
              status: 'active',
              tags: ['assertion-failure', 'auto-generated'],
              body: v.message,
            } as Partial<Entity> & { type: string; name: string });
            assertionFailures++;
          } catch {
            /* skip if already exists */
          }
        }
      }

      return {
        harvested,
        reconciled: {
          issues: reconcileResult.issues,
          fixed: reconcileResult.fixed,
          mergeErrors: l1Result.mergeErrors,
        },
        synthesized,
        autoPromoted: autoPromoteResult.promoted.length,
        mapped: embedded + archetypes,
        decayed: decayResult.total,
        drift: { tracked: driftTracked, alerts: driftAlerts },
        assertionFailures,
      };
    },

    watch(watchDir?: string) {
      const dir = watchDir ?? inboxDir;
      // Simple polling watcher (chokidar would be better but adds a dep)
      const interval = setInterval(async () => {
        try {
          const count = await harvester.processInbox(dir);
          if (count > 0) {
            console.log(`Soma: Harvested ${count} files from inbox`);
          }
        } catch (err) {
          console.error('Soma watch error:', err);
        }
      }, 10_000); // Poll every 10s

      return () => clearInterval(interval);
    },
  };
}
