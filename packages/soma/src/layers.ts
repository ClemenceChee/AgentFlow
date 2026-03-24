/**
 * Layer validation and write permission enforcement.
 *
 * Enforces the four-layer architecture:
 * - L1 (archive): Execution Archive — raw traces, reconciled entries, decayed entries
 * - L2 (working): Team Working Memory — team-scoped ephemeral context
 * - L3 (emerging): Emerging Knowledge — machine-proposed insights with confidence scores
 * - L4 (canon): Institutional Canon — ratified organizational truth
 *
 * @module
 */

import type { Entity, KnowledgeLayer, LayersConfig, Vault, QueryFilter } from './types.js';
import { LAYER_REQUIRED_FIELDS, WORKER_WRITE_PERMISSIONS } from './types.js';

// ---------------------------------------------------------------------------
// Layer topology configuration
// ---------------------------------------------------------------------------

let _layersConfig: LayersConfig = {};

/** Configure layer topology (e.g., disable L2). Call before any writeToLayer. */
export function setLayersConfig(config: LayersConfig): void {
  _layersConfig = config;
}

/** Check if a layer is enabled in the current topology. */
export function isLayerEnabled(layer: KnowledgeLayer): boolean {
  if (layer === 'working') return _layersConfig.working?.enabled ?? false;
  return true; // archive, emerging, canon are always enabled
}

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

export interface LayerValidationError {
  field: string;
  message: string;
}

/**
 * Validate that an entity has all required fields for its layer.
 * Returns an array of validation errors (empty if valid).
 */
export function validateLayerFields(entity: Partial<Entity>): LayerValidationError[] {
  const errors: LayerValidationError[] = [];
  const layer = entity.layer;

  if (!layer) return []; // No layer = legacy entity, skip validation
  if (layer === 'working' && !isLayerEnabled('working')) return []; // L2 disabled, skip validation

  const requiredFields = LAYER_REQUIRED_FIELDS[layer];
  if (!requiredFields) {
    errors.push({ field: 'layer', message: `Unknown layer: ${layer}` });
    return errors;
  }

  for (const field of requiredFields) {
    const value = (entity as Record<string, unknown>)[field];
    if (value === undefined || value === null) {
      errors.push({ field, message: `Missing required field '${field}' for layer '${layer}'` });
    }
  }

  // L2: team_id must be a non-empty string
  if (layer === 'working' && entity.team_id !== undefined && entity.team_id === '') {
    errors.push({ field: 'team_id', message: 'team_id must be a non-empty string for L2 entries' });
  }

  // L3: confidence_score must be 0.0-1.0
  if (layer === 'emerging' && entity.confidence_score !== undefined) {
    if (entity.confidence_score < 0 || entity.confidence_score > 1) {
      errors.push({ field: 'confidence_score', message: 'confidence_score must be between 0.0 and 1.0' });
    }
  }

  // L3: evidence_links must be an array
  if (layer === 'emerging' && entity.evidence_links !== undefined && !Array.isArray(entity.evidence_links)) {
    errors.push({ field: 'evidence_links', message: 'evidence_links must be an array' });
  }

  // L1 and L4 must not have decay_at
  if ((layer === 'archive' || layer === 'canon') && entity.decay_at) {
    errors.push({ field: 'decay_at', message: `L${layer === 'archive' ? '1' : '4'} entries must not have decay_at` });
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Write permission enforcement
// ---------------------------------------------------------------------------

export class LayerPermissionError extends Error {
  constructor(
    public readonly worker: string,
    public readonly layer: KnowledgeLayer,
    public readonly permittedLayers: readonly KnowledgeLayer[],
  ) {
    super(`Worker '${worker}' is not authorized to write to layer '${layer}'. Permitted layers: [${permittedLayers.join(', ')}]`);
    this.name = 'LayerPermissionError';
  }
}

/**
 * Check if a worker has permission to write to a layer.
 * Throws LayerPermissionError if not authorized.
 */
export function enforceWritePermission(worker: string, layer: KnowledgeLayer): void {
  const permitted = WORKER_WRITE_PERMISSIONS[worker];
  if (!permitted) {
    throw new LayerPermissionError(worker, layer, []);
  }
  if (!permitted.includes(layer)) {
    throw new LayerPermissionError(worker, layer, permitted);
  }
}

/**
 * Check if a worker can write to a layer (non-throwing).
 */
export function canWrite(worker: string, layer: KnowledgeLayer): boolean {
  const permitted = WORKER_WRITE_PERMISSIONS[worker];
  return permitted !== undefined && permitted.includes(layer);
}

// ---------------------------------------------------------------------------
// Layer-aware vault operations
// ---------------------------------------------------------------------------

/**
 * Query vault entries filtered by knowledge layer.
 * Uses index-level filtering — only reads matching entities from disk.
 */
export function queryByLayer(vault: Vault, layer: KnowledgeLayer, filter?: QueryFilter): Entity[] {
  return vault.listByLayer(layer, filter);
}

/**
 * Write an entity to a specific layer with validation and permission enforcement.
 * Returns the entity ID.
 */
export function writeToLayer(
  vault: Vault,
  worker: string,
  layer: KnowledgeLayer,
  entity: Partial<Entity> & { type: string; name: string },
): string {
  // Check if layer is enabled
  if (!isLayerEnabled(layer)) {
    throw new Error(`Layer '${layer}' is disabled. Set layers.working.enabled=true to enable.`);
  }

  // Enforce write permission
  enforceWritePermission(worker, layer);

  // Set layer metadata
  const layered = {
    ...entity,
    layer,
    source_worker: worker,
  };

  // Validate layer-specific fields
  const errors = validateLayerFields(layered);
  if (errors.length > 0) {
    const messages = errors.map((e) => `${e.field}: ${e.message}`).join('; ');
    throw new Error(`Layer validation failed for '${layer}': ${messages}`);
  }

  return vault.create(layered);
}
