/**
 * Trace adapter interface for converting external framework traces
 * into SOMA's GraphLike format for ingestion.
 *
 * @module
 */

import type { GraphLike } from '../decision-extractor.js';

/**
 * Generic adapter interface. Each framework adapter implements this
 * to convert its native trace format into GraphLike.
 */
export interface TraceAdapter<T> {
  /** Check if an unknown input can be adapted by this adapter. */
  canAdapt(input: unknown): input is T;
  /** Convert the framework-specific trace into a GraphLike. */
  adapt(input: T): GraphLike;
}
