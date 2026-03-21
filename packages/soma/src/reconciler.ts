/**
 * Reconciler — maintenance worker.
 *
 * Scans vault for structural issues, auto-fixes what it can,
 * uses LLM for ambiguous repairs, enforces consistency.
 *
 * @module
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AnalysisFn } from 'agentflow-core';
import type { Entity, ReconcilerConfig, ScanIssue, Vault } from './types.js';
import { ENTITY_STATUSES } from './types.js';

const DEFAULT_STUB_THRESHOLD = 100;

/** Type alias corrections (fuzzy matching for common mistakes). */
const TYPE_CORRECTIONS: Record<string, string> = {
  agents: 'agent',
  persons: 'person',
  projects: 'project',
  tasks: 'task',
  decisions: 'decision',
  assumptions: 'assumption',
  constraints: 'constraint',
  contradictions: 'contradiction',
  insights: 'insight',
  policies: 'policy',
  executions: 'execution',
  archetypes: 'archetype',
  syntheses: 'synthesis',
};

/** Status alias corrections. */
const STATUS_CORRECTIONS: Record<string, string> = {
  open: 'active',
  closed: 'completed',
  done: 'completed',
  wip: 'active',
  'in-progress': 'active',
  'in progress': 'active',
  finished: 'completed',
  todo: 'pending',
  cancelled: 'deprecated',
  archived: 'deprecated',
};

/**
 * Create a Reconciler worker.
 */
export function createReconciler(vault: Vault, analysisFn?: AnalysisFn, config?: ReconcilerConfig) {
  const stubThreshold = config?.stubThreshold ?? DEFAULT_STUB_THRESHOLD;
  const stateFile = config?.stateFile ?? '.soma/reconciler-state.json';

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

  function md5(content: string): string {
    return createHash('md5').update(content).digest('hex');
  }

  return {
    /**
     * Scan vault entities for structural issues.
     * Returns a list of issues with codes and severities.
     */
    scan(options?: { fullScan?: boolean }): ScanIssue[] {
      const issues: ScanIssue[] = [];

      const allTypes = [
        'agent',
        'execution',
        'archetype',
        'insight',
        'policy',
        'decision',
        'assumption',
        'constraint',
        'contradiction',
        'synthesis',
      ];

      for (const type of allTypes) {
        const entities = vault.list(type);
        for (const entity of entities) {
          const content = `${entity.type}:${entity.name}:${entity.body}`;
          const hash = md5(content);

          // Skip unchanged (unless full scan)
          if (!options?.fullScan && hashes.get(entity.id) === hash) continue;
          hashes.set(entity.id, hash);

          // FM001: Missing required fields
          if (!entity.type)
            issues.push({
              code: 'FM001',
              severity: 'error',
              entityPath: `${type}/${entity.id}`,
              message: 'Missing type field',
              autoFixable: true,
            });
          if (!entity.created)
            issues.push({
              code: 'FM001',
              severity: 'warning',
              entityPath: `${type}/${entity.id}`,
              message: 'Missing created field',
              autoFixable: true,
            });
          if (!entity.name)
            issues.push({
              code: 'FM001',
              severity: 'warning',
              entityPath: `${type}/${entity.id}`,
              message: 'Missing name field',
              autoFixable: true,
            });

          // FM002: Invalid type
          if (TYPE_CORRECTIONS[entity.type]) {
            issues.push({
              code: 'FM002',
              severity: 'warning',
              entityPath: `${type}/${entity.id}`,
              message: `Invalid type "${entity.type}" (should be "${TYPE_CORRECTIONS[entity.type]}")`,
              autoFixable: true,
            });
          }

          // FM003: Invalid status
          const validStatuses = ENTITY_STATUSES[entity.type];
          if (validStatuses && !validStatuses.includes(entity.status)) {
            const corrected = STATUS_CORRECTIONS[entity.status];
            issues.push({
              code: 'FM003',
              severity: 'warning',
              entityPath: `${type}/${entity.id}`,
              message: `Invalid status "${entity.status}"${corrected ? ` (should be "${corrected}")` : ''}`,
              autoFixable: !!corrected,
            });
          }

          // FM004: Wrong field type (scalar where list expected)
          if (entity.tags && !Array.isArray(entity.tags)) {
            issues.push({
              code: 'FM004',
              severity: 'warning',
              entityPath: `${type}/${entity.id}`,
              message: 'tags should be an array',
              autoFixable: true,
            });
          }
          if (entity.related && !Array.isArray(entity.related)) {
            issues.push({
              code: 'FM004',
              severity: 'warning',
              entityPath: `${type}/${entity.id}`,
              message: 'related should be an array',
              autoFixable: true,
            });
          }

          // LINK001: Broken wikilinks
          for (const link of entity.related) {
            const parts = link.split('/');
            if (parts.length >= 2) {
              const linkedEntity = vault.read(parts[0]!, parts.slice(1).join('/'));
              if (!linkedEntity) {
                issues.push({
                  code: 'LINK001',
                  severity: 'warning',
                  entityPath: `${type}/${entity.id}`,
                  message: `Broken wikilink: [[${link}]]`,
                  autoFixable: false,
                });
              }
            }
          }

          // ORPHAN001: No inbound links
          // (expensive check — only on full scan)
          if (options?.fullScan) {
            let hasInbound = false;
            for (const otherType of allTypes) {
              const others = vault.list(otherType);
              if (others.some((o) => o.related.some((r) => r.includes(entity.id)))) {
                hasInbound = true;
                break;
              }
            }
            if (!hasInbound && entity.type !== 'agent') {
              issues.push({
                code: 'ORPHAN001',
                severity: 'info',
                entityPath: `${type}/${entity.id}`,
                message: 'Orphan entity — no inbound links',
                autoFixable: false,
              });
            }
          }

          // STUB001: Body below threshold
          if (entity.body.length < stubThreshold) {
            issues.push({
              code: 'STUB001',
              severity: 'info',
              entityPath: `${type}/${entity.id}`,
              message: `Stub entity (body: ${entity.body.length} chars, threshold: ${stubThreshold})`,
              autoFixable: false,
            });
          }
        }
      }

      saveState();
      return issues;
    },

    /**
     * Auto-fix deterministic issues (no LLM needed).
     * Returns the number of fixes applied.
     */
    autofix(issues: ScanIssue[]): number {
      let fixed = 0;

      for (const issue of issues) {
        if (!issue.autoFixable) continue;

        const [type, ...idParts] = issue.entityPath.split('/');
        const id = idParts.join('/');
        if (!type || !id) continue;

        const entity = vault.read(type, id);
        if (!entity) continue;

        const patch: Partial<Entity> = {};

        switch (issue.code) {
          case 'FM001': {
            if (!entity.type) patch.type = type as Entity['type'];
            if (!entity.created) patch.created = new Date().toISOString();
            if (!entity.name) patch.name = id;
            break;
          }
          case 'FM002': {
            const corrected = TYPE_CORRECTIONS[entity.type];
            if (corrected) patch.type = corrected as Entity['type'];
            break;
          }
          case 'FM003': {
            const corrected = STATUS_CORRECTIONS[entity.status];
            if (corrected) patch.status = corrected;
            break;
          }
          case 'FM004': {
            if (entity.tags && !Array.isArray(entity.tags)) patch.tags = [String(entity.tags)];
            if (entity.related && !Array.isArray(entity.related))
              patch.related = [String(entity.related)];
            break;
          }
        }

        if (Object.keys(patch).length > 0) {
          vault.update(id, patch);
          fixed++;
        }
      }

      return fixed;
    },

    /**
     * Run the full reconciliation pipeline.
     * Returns { scanned, issues, fixed }.
     */
    async run(options?: {
      fullScan?: boolean;
    }): Promise<{ scanned: number; issues: number; fixed: number }> {
      const issues = this.scan(options);
      const autoFixable = issues.filter((i) => i.autoFixable);
      const fixed = this.autofix(autoFixable);

      // Stage 2: Link repair with LLM (if available)
      if (analysisFn) {
        const brokenLinks = issues.filter((i) => i.code === 'LINK001');
        for (const _issue of brokenLinks.slice(0, 10)) {
          // Future: implement LLM-assisted link repair
        }

        // Stage 3: Stub enrichment with LLM
        const stubs = issues.filter((i) => i.code === 'STUB001');
        for (const _issue of stubs.slice(0, 5)) {
          // Future: implement LLM-assisted stub enrichment
        }
      }

      return {
        scanned: issues.length > 0 ? issues.length : 0,
        issues: issues.length,
        fixed,
      };
    },
  };
}
