export { DataAggregator, loadAggregatorConfig } from './aggregator.js';
export type { AggregatedMetrics, AgentAggregation, SystemAggregation, Correlation, AggregatorConfig } from './aggregator.js';
export { MetricEngine } from './metric-engine.js';
export type { BusinessMetric, MetricQuery } from './metric-engine.js';
export { AnomalyDetector } from './anomaly-detector.js';
export type { Anomaly, DataQualityIssue, FreshnessStatus } from './anomaly-detector.js';
export { MaterializedViewManager } from './materialized-views.js';
export { LayerReportingService, loadOptimizationFlags } from './layer-reporting.js';
export type { SomaBusinessReport, GovernanceSummary, BiFeedEvent, FormattedMetric, OptimizationFlags } from './layer-reporting.js';
