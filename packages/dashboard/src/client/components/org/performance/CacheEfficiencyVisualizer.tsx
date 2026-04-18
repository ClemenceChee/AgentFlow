import React, { useState, useEffect, useMemo } from 'react';
import { useOrganizationalContext } from '../../../contexts/OrganizationalContext';

// Types for cache performance analysis
interface CacheMetrics {
  readonly cacheId: string;
  readonly cacheName: string;
  readonly cacheType: 'redis' | 'memory' | 'disk' | 'distributed' | 'query_result' | 'api_response';
  readonly teamId: string;
  readonly timestamp: number;
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly size: number; // bytes
  readonly maxSize: number; // bytes
  readonly entryCount: number;
  readonly maxEntries: number;
  readonly avgAccessTime: number; // milliseconds
  readonly ttl: number; // seconds
  readonly hitRate: number; // percentage
  readonly memoryUsage: number; // percentage
}

interface CachePattern {
  readonly patternId: string;
  readonly pattern: string;
  readonly frequency: number;
  readonly hitRate: number;
  readonly avgLatency: number;
  readonly examples: string[];
  readonly optimization: {
    readonly suggestion: string;
    readonly impact: 'low' | 'medium' | 'high';
    readonly effort: 'low' | 'medium' | 'high';
  };
}

interface CacheOptimization {
  readonly id: string;
  readonly cacheId: string;
  readonly type: 'ttl_adjustment' | 'size_increase' | 'prefetch_strategy' | 'eviction_policy' | 'partitioning' | 'warming';
  readonly priority: 'low' | 'medium' | 'high' | 'critical';
  readonly title: string;
  readonly description: string;
  readonly currentState: {
    readonly hitRate: number;
    readonly avgLatency: number;
    readonly memoryUsage: number;
  };
  readonly expectedImpact: {
    readonly hitRateIncrease: number; // percentage points
    readonly latencyReduction: number; // percentage
    readonly memoryChange: number; // percentage
    readonly throughputIncrease: number; // percentage
  };
  readonly implementation: {
    readonly complexity: 'simple' | 'moderate' | 'complex';
    readonly estimatedTime: string;
    readonly prerequisites: string[];
    readonly steps: string[];
    readonly risks: string[];
  };
  readonly cost: {
    readonly memoryIncrease: number; // MB
    readonly cpuOverhead: number; // percentage
    readonly monetaryCost: number; // dollars per month
  };
  readonly roi: {
    readonly score: number; // 0-100
    readonly paybackPeriod: string;
    readonly confidence: number; // 0-1
  };
}

interface CacheAlert {
  readonly id: string;
  readonly cacheId: string;
  readonly type: 'low_hit_rate' | 'high_memory_usage' | 'excessive_evictions' | 'slow_access' | 'size_limit_reached';
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly message: string;
  readonly threshold: number;
  readonly currentValue: number;
  readonly recommendations: string[];
  readonly triggeredAt: number;
}

interface CacheTopology {
  readonly nodes: Array<{
    readonly id: string;
    readonly type: 'cache' | 'application' | 'database';
    readonly label: string;
    readonly hitRate?: number;
    readonly latency?: number;
    readonly status: 'healthy' | 'warning' | 'critical';
  }>;
  readonly edges: Array<{
    readonly source: string;
    readonly target: string;
    readonly requestRate: number; // requests per second
    readonly hitRate: number; // percentage
    readonly avgLatency: number; // milliseconds
  }>;
}

type ViewMode = 'overview' | 'detailed' | 'patterns' | 'optimizations' | 'topology';
type TimeRange = '1h' | '24h' | '7d' | '30d';

interface Props {
  readonly className?: string;
  readonly teamId?: string;
  readonly cacheId?: string;
  readonly showRealTime?: boolean;
  readonly onOptimizationSelect?: (optimization: CacheOptimization) => void;
}

export const CacheEfficiencyVisualizer: React.FC<Props> = ({
  className = '',
  teamId,
  cacheId,
  showRealTime = true,
  onOptimizationSelect
}) => {
  const { selectedTeam, operatorContext } = useOrganizationalContext();
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [selectedCache, setSelectedCache] = useState<string | null>(cacheId || null);
  const [selectedOptimization, setSelectedOptimization] = useState<string | null>(null);
  const [showAlerts, setShowAlerts] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(showRealTime);
  const [sortBy, setSortBy] = useState<'hitRate' | 'size' | 'latency'>('hitRate');

  const effectiveTeamId = teamId || selectedTeam;

  // Mock cache data - replace with actual API calls
  const mockCacheMetrics: CacheMetrics[] = useMemo(() => [
    {
      cacheId: 'cache-query-001',
      cacheName: 'Query Result Cache',
      cacheType: 'redis',
      teamId: effectiveTeamId || 'team-frontend',
      timestamp: Date.now(),
      hits: 8547,
      misses: 1243,
      evictions: 89,
      size: 256 * 1024 * 1024, // 256MB
      maxSize: 512 * 1024 * 1024, // 512MB
      entryCount: 1547,
      maxEntries: 5000,
      avgAccessTime: 2.3,
      ttl: 3600,
      hitRate: 87.3,
      memoryUsage: 50.0
    },
    {
      cacheId: 'cache-api-002',
      cacheName: 'API Response Cache',
      cacheType: 'memory',
      teamId: effectiveTeamId || 'team-backend',
      timestamp: Date.now(),
      hits: 12847,
      misses: 2156,
      evictions: 156,
      size: 128 * 1024 * 1024, // 128MB
      maxSize: 256 * 1024 * 1024, // 256MB
      entryCount: 2847,
      maxEntries: 10000,
      avgAccessTime: 0.8,
      ttl: 1800,
      hitRate: 85.6,
      memoryUsage: 50.0
    },
    {
      cacheId: 'cache-session-003',
      cacheName: 'Session Cache',
      cacheType: 'distributed',
      teamId: effectiveTeamId || 'team-backend',
      timestamp: Date.now(),
      hits: 5674,
      misses: 934,
      evictions: 45,
      size: 64 * 1024 * 1024, // 64MB
      maxSize: 128 * 1024 * 1024, // 128MB
      entryCount: 934,
      maxEntries: 2000,
      avgAccessTime: 1.2,
      ttl: 7200,
      hitRate: 85.9,
      memoryUsage: 50.0
    },
    {
      cacheId: 'cache-trace-004',
      cacheName: 'Trace Analysis Cache',
      cacheType: 'disk',
      teamId: effectiveTeamId || 'team-analytics',
      timestamp: Date.now(),
      hits: 3421,
      misses: 1876,
      evictions: 234,
      size: 1024 * 1024 * 1024, // 1GB
      maxSize: 2048 * 1024 * 1024, // 2GB
      entryCount: 456,
      maxEntries: 1000,
      avgAccessTime: 15.6,
      ttl: 86400,
      hitRate: 64.6,
      memoryUsage: 50.0
    }
  ], [effectiveTeamId]);

  const mockPatterns: CachePattern[] = useMemo(() => [
    {
      patternId: 'pattern-001',
      pattern: '/api/traces/operator/*',
      frequency: 1547,
      hitRate: 92.4,
      avgLatency: 1.2,
      examples: ['/api/traces/operator/123', '/api/traces/operator/456'],
      optimization: {
        suggestion: 'Increase TTL for operator traces as they change infrequently',
        impact: 'medium',
        effort: 'low'
      }
    },
    {
      patternId: 'pattern-002',
      pattern: '/api/stats/team/*',
      frequency: 847,
      hitRate: 76.8,
      avgLatency: 3.4,
      examples: ['/api/stats/team/frontend', '/api/stats/team/backend'],
      optimization: {
        suggestion: 'Implement cache warming for team statistics',
        impact: 'high',
        effort: 'medium'
      }
    },
    {
      patternId: 'pattern-003',
      pattern: '/api/search/*',
      frequency: 2145,
      hitRate: 34.7,
      avgLatency: 12.8,
      examples: ['/api/search?q=error', '/api/search?q=performance'],
      optimization: {
        suggestion: 'Search queries have low hit rate - consider query normalization',
        impact: 'high',
        effort: 'high'
      }
    }
  ], []);

  const mockOptimizations: CacheOptimization[] = useMemo(() => [
    {
      id: 'opt-001',
      cacheId: 'cache-query-001',
      type: 'ttl_adjustment',
      priority: 'high',
      title: 'Optimize Query Cache TTL',
      description: 'Increase TTL for frequently accessed query results to reduce cache misses',
      currentState: {
        hitRate: 87.3,
        avgLatency: 2.3,
        memoryUsage: 50.0
      },
      expectedImpact: {
        hitRateIncrease: 5.2,
        latencyReduction: 15,
        memoryChange: 8,
        throughputIncrease: 12
      },
      implementation: {
        complexity: 'simple',
        estimatedTime: '2 hours',
        prerequisites: ['Test environment validation'],
        steps: [
          'Analyze cache access patterns',
          'Update TTL configuration',
          'Monitor hit rate changes',
          'Adjust if necessary'
        ],
        risks: ['Slightly increased memory usage', 'Potential stale data']
      },
      cost: {
        memoryIncrease: 20,
        cpuOverhead: 2,
        monetaryCost: 15
      },
      roi: {
        score: 85,
        paybackPeriod: '1 week',
        confidence: 0.9
      }
    },
    {
      id: 'opt-002',
      cacheId: 'cache-api-002',
      type: 'prefetch_strategy',
      priority: 'medium',
      title: 'Implement Cache Warming',
      description: 'Pre-populate cache with frequently requested API responses during low-traffic periods',
      currentState: {
        hitRate: 85.6,
        avgLatency: 0.8,
        memoryUsage: 50.0
      },
      expectedImpact: {
        hitRateIncrease: 8.1,
        latencyReduction: 25,
        memoryChange: 15,
        throughputIncrease: 18
      },
      implementation: {
        complexity: 'moderate',
        estimatedTime: '1 week',
        prerequisites: ['Cache warming scheduler', 'Monitoring setup'],
        steps: [
          'Identify warming candidates',
          'Implement warming scheduler',
          'Configure warming periods',
          'Monitor effectiveness'
        ],
        risks: ['Increased system load during warming', 'Complex scheduling logic']
      },
      cost: {
        memoryIncrease: 35,
        cpuOverhead: 5,
        monetaryCost: 25
      },
      roi: {
        score: 72,
        paybackPeriod: '3 weeks',
        confidence: 0.7
      }
    },
    {
      id: 'opt-003',
      cacheId: 'cache-trace-004',
      type: 'size_increase',
      priority: 'critical',
      title: 'Increase Trace Cache Size',
      description: 'Low hit rate due to frequent evictions - increase cache size to retain more entries',
      currentState: {
        hitRate: 64.6,
        avgLatency: 15.6,
        memoryUsage: 50.0
      },
      expectedImpact: {
        hitRateIncrease: 15.8,
        latencyReduction: 35,
        memoryChange: 50,
        throughputIncrease: 28
      },
      implementation: {
        complexity: 'simple',
        estimatedTime: '4 hours',
        prerequisites: ['Memory availability check', 'Monitoring setup'],
        steps: [
          'Check available system memory',
          'Update cache configuration',
          'Restart cache service',
          'Monitor performance'
        ],
        risks: ['Increased memory costs', 'Longer cold start times']
      },
      cost: {
        memoryIncrease: 100,
        cpuOverhead: 1,
        monetaryCost: 40
      },
      roi: {
        score: 92,
        paybackPeriod: '2 days',
        confidence: 0.95
      }
    }
  ], []);

  const mockAlerts: CacheAlert[] = useMemo(() => [
    {
      id: 'alert-cache-001',
      cacheId: 'cache-trace-004',
      type: 'low_hit_rate',
      severity: 'high',
      message: 'Trace cache hit rate below 70% threshold',
      threshold: 70,
      currentValue: 64.6,
      recommendations: [
        'Increase cache size to reduce evictions',
        'Optimize eviction policy',
        'Consider cache partitioning by trace type'
      ],
      triggeredAt: Date.now() - 300000
    },
    {
      id: 'alert-cache-002',
      cacheId: 'cache-api-002',
      type: 'excessive_evictions',
      severity: 'medium',
      message: 'High eviction rate detected in API cache',
      threshold: 100,
      currentValue: 156,
      recommendations: [
        'Review cache sizing configuration',
        'Implement cache warming',
        'Analyze access patterns'
      ],
      triggeredAt: Date.now() - 600000
    }
  ], []);

  const mockTopology: CacheTopology = useMemo(() => ({
    nodes: [
      { id: 'app-1', type: 'application', label: 'Dashboard App', status: 'healthy' },
      { id: 'cache-1', type: 'cache', label: 'Query Cache', hitRate: 87.3, latency: 2.3, status: 'healthy' },
      { id: 'cache-2', type: 'cache', label: 'API Cache', hitRate: 85.6, latency: 0.8, status: 'healthy' },
      { id: 'cache-3', type: 'cache', label: 'Trace Cache', hitRate: 64.6, latency: 15.6, status: 'warning' },
      { id: 'db-1', type: 'database', label: 'Primary DB', status: 'healthy' }
    ],
    edges: [
      { source: 'app-1', target: 'cache-1', requestRate: 125, hitRate: 87.3, avgLatency: 2.3 },
      { source: 'app-1', target: 'cache-2', requestRate: 89, hitRate: 85.6, avgLatency: 0.8 },
      { source: 'app-1', target: 'cache-3', requestRate: 45, hitRate: 64.6, avgLatency: 15.6 },
      { source: 'cache-1', target: 'db-1', requestRate: 15.9, hitRate: 0, avgLatency: 25.8 },
      { source: 'cache-2', target: 'db-1', requestRate: 12.8, hitRate: 0, avgLatency: 18.4 }
    ]
  }), []);

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      console.log('Refreshing cache metrics...');
      // Trigger data refresh
    }, 30000);

    return () => clearInterval(interval);
  }, [autoRefresh]);

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h`;
  };

  const getCacheTypeColor = (type: string): string => {
    switch (type) {
      case 'redis': return 'var(--org-alert-high)';
      case 'memory': return 'var(--org-success)';
      case 'disk': return 'var(--org-info)';
      case 'distributed': return 'var(--org-warning)';
      default: return 'var(--org-text-muted)';
    }
  };

  const getHitRateColor = (hitRate: number): string => {
    if (hitRate >= 90) return 'var(--org-success)';
    if (hitRate >= 80) return 'var(--org-info)';
    if (hitRate >= 70) return 'var(--org-warning)';
    return 'var(--org-alert-high)';
  };

  const renderOverview = () => {
    const sortedCaches = [...mockCacheMetrics].sort((a, b) => {
      switch (sortBy) {
        case 'hitRate': return b.hitRate - a.hitRate;
        case 'size': return b.size - a.size;
        case 'latency': return a.avgAccessTime - b.avgAccessTime;
        default: return 0;
      }
    });

    return (
      <div className="org-cache-overview">
        <div className="org-overview-stats">
          <div className="org-stat-card">
            <div className="org-stat-value">
              {(mockCacheMetrics.reduce((sum, cache) => sum + cache.hits, 0) /
                mockCacheMetrics.reduce((sum, cache) => sum + cache.hits + cache.misses, 0) * 100).toFixed(1)}%
            </div>
            <div className="org-stat-label">Overall Hit Rate</div>
          </div>
          <div className="org-stat-card">
            <div className="org-stat-value">{mockCacheMetrics.length}</div>
            <div className="org-stat-label">Active Caches</div>
          </div>
          <div className="org-stat-card">
            <div className="org-stat-value">
              {formatBytes(mockCacheMetrics.reduce((sum, cache) => sum + cache.size, 0))}
            </div>
            <div className="org-stat-label">Total Size</div>
          </div>
          <div className="org-stat-card">
            <div className="org-stat-value">{mockOptimizations.length}</div>
            <div className="org-stat-label">Optimization Opportunities</div>
          </div>
        </div>

        <div className="org-cache-controls">
          <div className="org-sort-controls">
            <label>Sort by:</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
              <option value="hitRate">Hit Rate</option>
              <option value="size">Size</option>
              <option value="latency">Latency</option>
            </select>
          </div>
        </div>

        <div className="org-cache-grid">
          {sortedCaches.map((cache) => (
            <div
              key={cache.cacheId}
              className={`org-cache-card ${selectedCache === cache.cacheId ? 'org-selected' : ''}`}
              onClick={() => setSelectedCache(selectedCache === cache.cacheId ? null : cache.cacheId)}
            >
              <div className="org-cache-header">
                <h4>{cache.cacheName}</h4>
                <div
                  className="org-cache-type-badge"
                  style={{ backgroundColor: getCacheTypeColor(cache.cacheType) }}
                >
                  {cache.cacheType}
                </div>
              </div>

              <div className="org-cache-metrics">
                <div className="org-metric-row">
                  <span>Hit Rate</span>
                  <span style={{ color: getHitRateColor(cache.hitRate) }}>
                    {cache.hitRate.toFixed(1)}%
                  </span>
                </div>
                <div className="org-metric-row">
                  <span>Access Time</span>
                  <span>{cache.avgAccessTime.toFixed(1)}ms</span>
                </div>
                <div className="org-metric-row">
                  <span>Size</span>
                  <span>{formatBytes(cache.size)}</span>
                </div>
                <div className="org-metric-row">
                  <span>Entries</span>
                  <span>{cache.entryCount.toLocaleString()}</span>
                </div>
              </div>

              <div className="org-cache-utilization">
                <div className="org-utilization-bar">
                  <div
                    className="org-utilization-fill"
                    style={{
                      width: `${(cache.size / cache.maxSize) * 100}%`,
                      backgroundColor: cache.size / cache.maxSize > 0.8 ? 'var(--org-warning)' : 'var(--org-info)'
                    }}
                  />
                </div>
                <span className="org-utilization-label">
                  {((cache.size / cache.maxSize) * 100).toFixed(1)}% utilized
                </span>
              </div>

              {selectedCache === cache.cacheId && (
                <div className="org-cache-details">
                  <div className="org-detailed-metrics">
                    <div className="org-metric-item">
                      <span>Hits</span>
                      <span>{cache.hits.toLocaleString()}</span>
                    </div>
                    <div className="org-metric-item">
                      <span>Misses</span>
                      <span>{cache.misses.toLocaleString()}</span>
                    </div>
                    <div className="org-metric-item">
                      <span>Evictions</span>
                      <span>{cache.evictions.toLocaleString()}</span>
                    </div>
                    <div className="org-metric-item">
                      <span>TTL</span>
                      <span>{formatDuration(cache.ttl)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderPatterns = () => (
    <div className="org-cache-patterns">
      <div className="org-section-header">
        <h3>Access Patterns Analysis</h3>
        <div className="org-pattern-summary">
          {mockPatterns.length} patterns identified across all caches
        </div>
      </div>

      <div className="org-patterns-list">
        {mockPatterns.map((pattern) => (
          <div key={pattern.patternId} className="org-pattern-card">
            <div className="org-pattern-header">
              <code className="org-pattern-code">{pattern.pattern}</code>
              <div className="org-pattern-stats">
                <span className="org-pattern-frequency">{pattern.frequency} requests</span>
                <span
                  className="org-pattern-hit-rate"
                  style={{ color: getHitRateColor(pattern.hitRate) }}
                >
                  {pattern.hitRate.toFixed(1)}% hit rate
                </span>
              </div>
            </div>

            <div className="org-pattern-details">
              <div className="org-pattern-metric">
                <span>Average Latency</span>
                <span>{pattern.avgLatency.toFixed(1)}ms</span>
              </div>
            </div>

            <div className="org-pattern-examples">
              <h5>Examples:</h5>
              <ul>
                {pattern.examples.map((example, index) => (
                  <li key={index}><code>{example}</code></li>
                ))}
              </ul>
            </div>

            <div className="org-pattern-optimization">
              <div className="org-optimization-header">
                <span className="org-optimization-title">Optimization Suggestion</span>
                <div className="org-optimization-badges">
                  <span className={`org-impact-badge org-impact-${pattern.optimization.impact}`}>
                    {pattern.optimization.impact} impact
                  </span>
                  <span className={`org-effort-badge org-effort-${pattern.optimization.effort}`}>
                    {pattern.optimization.effort} effort
                  </span>
                </div>
              </div>
              <p className="org-optimization-description">
                {pattern.optimization.suggestion}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderOptimizations = () => (
    <div className="org-cache-optimizations">
      <div className="org-section-header">
        <h3>Optimization Recommendations</h3>
        <div className="org-optimization-filters">
          <select defaultValue="all">
            <option value="all">All Priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
          </select>
          <select defaultValue="roi">
            <option value="roi">Sort by ROI</option>
            <option value="impact">Sort by Impact</option>
            <option value="effort">Sort by Effort</option>
          </select>
        </div>
      </div>

      <div className="org-optimizations-list">
        {mockOptimizations.map((optimization) => (
          <div
            key={optimization.id}
            className={`org-optimization-card ${selectedOptimization === optimization.id ? 'org-selected' : ''}`}
            onClick={() => setSelectedOptimization(selectedOptimization === optimization.id ? null : optimization.id)}
          >
            <div className="org-optimization-header">
              <h4>{optimization.title}</h4>
              <div className="org-optimization-badges">
                <span className={`org-priority-badge org-priority-${optimization.priority}`}>
                  {optimization.priority}
                </span>
                <span className="org-roi-badge">ROI: {optimization.roi.score}</span>
              </div>
            </div>

            <div className="org-optimization-description">
              {optimization.description}
            </div>

            <div className="org-optimization-preview">
              <div className="org-current-state">
                <h5>Current</h5>
                <div className="org-state-metrics">
                  <span>Hit Rate: {optimization.currentState.hitRate}%</span>
                  <span>Latency: {optimization.currentState.avgLatency}ms</span>
                  <span>Memory: {optimization.currentState.memoryUsage}%</span>
                </div>
              </div>
              <div className="org-expected-impact">
                <h5>Expected Impact</h5>
                <div className="org-impact-metrics">
                  <span className="org-positive">
                    +{optimization.expectedImpact.hitRateIncrease}% hit rate
                  </span>
                  <span className="org-positive">
                    -{optimization.expectedImpact.latencyReduction}% latency
                  </span>
                  <span className="org-positive">
                    +{optimization.expectedImpact.throughputIncrease}% throughput
                  </span>
                </div>
              </div>
            </div>

            {selectedOptimization === optimization.id && (
              <div className="org-optimization-details">
                <div className="org-implementation-plan">
                  <h5>Implementation Plan</h5>
                  <div className="org-plan-overview">
                    <span>Complexity: {optimization.implementation.complexity}</span>
                    <span>Time: {optimization.implementation.estimatedTime}</span>
                    <span>Confidence: {Math.round(optimization.roi.confidence * 100)}%</span>
                  </div>
                  <ol className="org-implementation-steps">
                    {optimization.implementation.steps.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ol>
                </div>

                <div className="org-cost-analysis">
                  <h5>Cost Analysis</h5>
                  <div className="org-cost-grid">
                    <div className="org-cost-item">
                      <span>Memory</span>
                      <span>+{optimization.cost.memoryIncrease} MB</span>
                    </div>
                    <div className="org-cost-item">
                      <span>CPU Overhead</span>
                      <span>+{optimization.cost.cpuOverhead}%</span>
                    </div>
                    <div className="org-cost-item">
                      <span>Monthly Cost</span>
                      <span>${optimization.cost.monetaryCost}</span>
                    </div>
                  </div>
                  <div className="org-payback-info">
                    <strong>Payback Period: {optimization.roi.paybackPeriod}</strong>
                  </div>
                </div>

                <div className="org-risks-prerequisites">
                  <div className="org-prerequisites">
                    <h6>Prerequisites:</h6>
                    <ul>
                      {optimization.implementation.prerequisites.map((prereq, index) => (
                        <li key={index}>{prereq}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="org-risks">
                    <h6>Risks:</h6>
                    <ul>
                      {optimization.implementation.risks.map((risk, index) => (
                        <li key={index}>{risk}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="org-optimization-actions">
                  <button
                    className="org-button org-button-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOptimizationSelect?.(optimization);
                    }}
                  >
                    Start Implementation
                  </button>
                  <button className="org-button org-button-secondary">
                    Save for Review
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const renderTopology = () => (
    <div className="org-cache-topology">
      <div className="org-section-header">
        <h3>Cache Topology</h3>
        <div className="org-topology-legend">
          <span className="org-legend-item">
            <span className="org-legend-color" style={{ backgroundColor: 'var(--org-primary)' }}></span>
            Applications
          </span>
          <span className="org-legend-item">
            <span className="org-legend-color" style={{ backgroundColor: 'var(--org-success)' }}></span>
            Caches
          </span>
          <span className="org-legend-item">
            <span className="org-legend-color" style={{ backgroundColor: 'var(--org-info)' }}></span>
            Databases
          </span>
        </div>
      </div>

      <div className="org-topology-visualization">
        <svg className="org-topology-svg" viewBox="0 0 800 500">
          {/* Render edges first */}
          {mockTopology.edges.map((edge, index) => {
            const sourceNode = mockTopology.nodes.find(n => n.id === edge.source);
            const targetNode = mockTopology.nodes.find(n => n.id === edge.target);
            if (!sourceNode || !targetNode) return null;

            // Simple layout positioning
            const positions = {
              'app-1': { x: 100, y: 100 },
              'cache-1': { x: 300, y: 80 },
              'cache-2': { x: 300, y: 150 },
              'cache-3': { x: 300, y: 220 },
              'db-1': { x: 500, y: 150 }
            };

            const sourcePos = positions[edge.source as keyof typeof positions] || { x: 0, y: 0 };
            const targetPos = positions[edge.target as keyof typeof positions] || { x: 0, y: 0 };

            const strokeWidth = Math.max(1, edge.requestRate / 50);
            const opacity = Math.max(0.3, edge.hitRate / 100);

            return (
              <g key={`edge-${index}`}>
                <line
                  x1={sourcePos.x}
                  y1={sourcePos.y}
                  x2={targetPos.x}
                  y2={targetPos.y}
                  stroke="var(--org-border)"
                  strokeWidth={strokeWidth}
                  opacity={opacity}
                />
                <text
                  x={(sourcePos.x + targetPos.x) / 2}
                  y={(sourcePos.y + targetPos.y) / 2 - 10}
                  textAnchor="middle"
                  className="org-topology-label"
                >
                  {edge.requestRate.toFixed(0)} RPS
                </text>
                <text
                  x={(sourcePos.x + targetPos.x) / 2}
                  y={(sourcePos.y + targetPos.y) / 2 + 5}
                  textAnchor="middle"
                  className="org-topology-label"
                >
                  {edge.hitRate > 0 ? `${edge.hitRate.toFixed(1)}%` : ''}
                </text>
              </g>
            );
          })}

          {/* Render nodes */}
          {mockTopology.nodes.map((node) => {
            const positions = {
              'app-1': { x: 100, y: 100 },
              'cache-1': { x: 300, y: 80 },
              'cache-2': { x: 300, y: 150 },
              'cache-3': { x: 300, y: 220 },
              'db-1': { x: 500, y: 150 }
            };

            const pos = positions[node.id as keyof typeof positions] || { x: 0, y: 0 };

            const nodeColor = node.type === 'application' ? 'var(--org-primary)' :
                             node.type === 'cache' ? 'var(--org-success)' : 'var(--org-info)';

            const statusColor = node.status === 'healthy' ? 'var(--org-success)' :
                               node.status === 'warning' ? 'var(--org-warning)' : 'var(--org-alert-high)';

            return (
              <g key={node.id}>
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r="30"
                  fill={nodeColor}
                  opacity="0.8"
                />
                <circle
                  cx={pos.x + 20}
                  cy={pos.y - 20}
                  r="5"
                  fill={statusColor}
                />
                <text
                  x={pos.x}
                  y={pos.y + 45}
                  textAnchor="middle"
                  className="org-topology-node-label"
                >
                  {node.label}
                </text>
                {node.hitRate && (
                  <text
                    x={pos.x}
                    y={pos.y + 60}
                    textAnchor="middle"
                    className="org-topology-stat"
                  >
                    {node.hitRate.toFixed(1)}%
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="org-topology-insights">
        <div className="org-insight-card">
          <h5>Topology Analysis</h5>
          <ul>
            <li>Query Cache shows excellent performance with 87.3% hit rate</li>
            <li>Trace Cache is underperforming - consider size optimization</li>
            <li>Database load is well-distributed across caches</li>
            <li>Application request pattern shows good cache utilization</li>
          </ul>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`org-cache-efficiency-visualizer ${className}`}>
      <div className="org-component-header">
        <h2>Cache Efficiency Visualizer</h2>
        <div className="org-header-controls">
          <div className="org-time-range-selector">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            >
              <option value="1h">Last Hour</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>
          <div className="org-view-controls">
            <label>
              <input
                type="checkbox"
                checked={showAlerts}
                onChange={(e) => setShowAlerts(e.target.checked)}
              />
              Show Alerts
            </label>
            <label>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto-refresh
            </label>
          </div>
        </div>
      </div>

      <div className="org-view-tabs">
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'detailed', label: 'Detailed View' },
          { key: 'patterns', label: `Patterns (${mockPatterns.length})` },
          { key: 'optimizations', label: `Optimizations (${mockOptimizations.length})` },
          { key: 'topology', label: 'Topology' }
        ].map((tab) => (
          <button
            key={tab.key}
            className={`org-tab-button ${viewMode === tab.key ? 'org-active' : ''}`}
            onClick={() => setViewMode(tab.key as ViewMode)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="org-cache-content">
        {viewMode === 'overview' && renderOverview()}
        {viewMode === 'detailed' && renderOverview()} {/* Same as overview for now */}
        {viewMode === 'patterns' && renderPatterns()}
        {viewMode === 'optimizations' && renderOptimizations()}
        {viewMode === 'topology' && renderTopology()}
      </div>

      {showAlerts && mockAlerts.length > 0 && (
        <div className="org-cache-alerts">
          <h4>Cache Alerts</h4>
          {mockAlerts.map((alert) => (
            <div
              key={alert.id}
              className="org-alert-card"
              style={{ borderLeftColor: getSeverityColor(alert.severity) }}
            >
              <div className="org-alert-header">
                <span className="org-alert-type">{alert.type.replace('_', ' ')}</span>
                <span className="org-alert-severity">{alert.severity}</span>
                <span className="org-alert-time">
                  {Math.round((Date.now() - alert.triggeredAt) / 60000)}m ago
                </span>
              </div>
              <div className="org-alert-message">{alert.message}</div>
              <div className="org-alert-recommendations">
                <h6>Recommendations:</h6>
                <ul>
                  {alert.recommendations.map((rec, index) => (
                    <li key={index}>{rec}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}

      {effectiveTeamId && (
        <div className="org-context-info">
          <div className="org-context-badge">
            Cache analysis for: {effectiveTeamId}
          </div>
        </div>
      )}
    </div>
  );
};

export default CacheEfficiencyVisualizer;