/**
 * Soma orchestrator — coordinates all workers.
 *
 * @module
 */

import type { PolicySource } from 'agentflow-core';
import { createCartographer } from './cartographer.js';
import { createHarvester } from './harvester.js';
import { createSomaPolicySource } from './policy-bridge.js';
import { createReconciler } from './reconciler.js';
import { createSynthesizer } from './synthesizer.js';
import type { SomaConfig, Vault, VectorStore } from './types.js';
import { createVault } from './vault.js';
import { createJsonVectorStore } from './vector-store.js';

export interface Soma {
  /** The knowledge vault. */
  vault: Vault;
  /** The vector store for semantic search. */
  vectorStore: VectorStore;
  /** The PolicySource bridge for AgentFlow guards. */
  policySource: PolicySource;
  /** Harvester worker instance. */
  harvester: ReturnType<typeof createHarvester>;
  /** Synthesizer worker instance (if analysisFn provided). */
  synthesizer?: ReturnType<typeof createSynthesizer>;
  /** Cartographer worker instance. */
  cartographer: ReturnType<typeof createCartographer>;
  /** Reconciler worker instance. */
  reconciler: ReturnType<typeof createReconciler>;

  /**
   * Run the full pipeline: Harvester → Reconciler → Synthesizer → Cartographer.
   */
  run(): Promise<{
    harvested: number;
    reconciled: { issues: number; fixed: number };
    synthesized: number;
    mapped: number;
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

  const vault = createVault({ baseDir: vaultDir });
  const vectorStore = config?.vectorStore ?? createJsonVectorStore(`${vaultDir}/../_vectors.json`);
  const policySource = createSomaPolicySource(vault);

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
    harvester,
    synthesizer,
    cartographer,
    reconciler,

    async run() {
      // 1. Harvest from inbox
      const harvested = await harvester.processInbox(inboxDir);

      // 2. Reconcile (fix issues)
      const reconcileResult = await reconciler.run();

      // 3. Synthesize (extract knowledge)
      let synthesized = 0;
      if (synthesizer) {
        synthesized = await synthesizer.synthesize();
      }

      // 4. Map (embed + discover)
      const embedded = await cartographer.embed();
      const archetypes = await cartographer.discover();

      return {
        harvested,
        reconciled: { issues: reconcileResult.issues, fixed: reconcileResult.fixed },
        synthesized,
        mapped: embedded + archetypes,
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
