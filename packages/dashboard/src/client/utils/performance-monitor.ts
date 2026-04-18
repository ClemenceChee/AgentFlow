/**
 * Performance Monitoring System for Organizational Features
 *
 * Comprehensive performance tracking and metrics collection for
 * organizational dashboard components and operations.
 */

interface PerformanceMetric {
  name: string;
  value: number;
  unit: 'ms' | 'bytes' | 'count' | 'percentage' | 'ratio';
  timestamp: number;
  category: 'render' | 'api' | 'cache' | 'user-interaction' | 'memory' | 'network';
  metadata?: Record<string, any>;
}

interface ComponentMetrics {
  componentName: string;
  mountTime: number;
  renderCount: number;
  averageRenderTime: number;
  lastRenderTime: number;
  propsChangeCount: number;
  memoryUsage: number;
  firstContentfulPaint?: number;
  largestContentfulPaint?: number;
}

interface APIMetrics {
  endpoint: string;
  method: string;
  averageResponseTime: number;
  requestCount: number;
  errorCount: number;
  cacheHitRate: number;
  batchingEfficiency?: number;
  lastRequestTime: number;
}

interface UserInteractionMetrics {
  action: string;
  component: string;
  duration: number;
  frequency: number;
  errorRate: number;
}

interface CacheMetrics {
  hitRate: number;
  missRate: number;
  totalSize: number;
  entryCount: number;
  averageEntrySize: number;
  evictionCount: number;
  memoryPressure: number;
}

interface PerformanceReport {
  timestamp: number;
  components: ComponentMetrics[];
  apis: APIMetrics[];
  interactions: UserInteractionMetrics[];
  cache: CacheMetrics;
  system: {
    memoryUsage: number;
    cpuUsage?: number;
    networkLatency?: number;
    frameRate: number;
  };
  warnings: Array<{
    type: 'slow-render' | 'memory-leak' | 'cache-miss' | 'api-error' | 'user-friction';
    message: string;
    component?: string;
    severity: 'low' | 'medium' | 'high';
    recommendation?: string;
  }>;
}

class OrganizationalPerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private componentMetrics = new Map<string, ComponentMetrics>();
  private apiMetrics = new Map<string, APIMetrics>();
  private interactionMetrics = new Map<string, UserInteractionMetrics>();
  private isEnabled = process.env.NODE_ENV === 'development' || localStorage.getItem('org-perf-monitor') === 'true';
  private maxMetrics = 1000; // Prevent memory overflow
  private reportInterval: NodeJS.Timeout | null = null;
  private observer: PerformanceObserver | null = null;

  constructor() {
    if (this.isEnabled) {
      this.initializePerformanceObserver();
      this.startReporting();
      this.setupMemoryMonitoring();
    }
  }

  /**
   * Record a performance metric
   */
  recordMetric(metric: Omit<PerformanceMetric, 'timestamp'>): void {
    if (!this.isEnabled) return;

    const fullMetric: PerformanceMetric = {
      ...metric,
      timestamp: Date.now()
    };

    this.metrics.push(fullMetric);

    // Prevent memory overflow
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }

    // Trigger immediate analysis for critical metrics
    if (metric.category === 'render' && metric.value > 16) {
      this.analyzeSlowRender(metric);
    }
  }

  /**
   * Record component render metrics
   */
  recordComponentRender(componentName: string, renderTime: number, propsChanged: boolean = false): void {
    if (!this.isEnabled) return;

    let componentMetric = this.componentMetrics.get(componentName);
    if (!componentMetric) {
      componentMetric = {
        componentName,
        mountTime: Date.now(),
        renderCount: 0,
        averageRenderTime: 0,
        lastRenderTime: 0,
        propsChangeCount: 0,
        memoryUsage: 0
      };
      this.componentMetrics.set(componentName, componentMetric);
    }

    componentMetric.renderCount++;
    componentMetric.lastRenderTime = renderTime;
    componentMetric.averageRenderTime = (
      (componentMetric.averageRenderTime * (componentMetric.renderCount - 1) + renderTime) /
      componentMetric.renderCount
    );

    if (propsChanged) {
      componentMetric.propsChangeCount++;
    }

    this.recordMetric({
      name: `${componentName}_render`,
      value: renderTime,
      unit: 'ms',
      category: 'render',
      metadata: { propsChanged, renderCount: componentMetric.renderCount }
    });
  }

  /**
   * Record API call metrics
   */
  recordAPICall(
    endpoint: string,
    method: string,
    responseTime: number,
    success: boolean,
    cacheHit: boolean = false,
    batchSize?: number
  ): void {
    if (!this.isEnabled) return;

    const key = `${method}:${endpoint}`;
    let apiMetric = this.apiMetrics.get(key);
    if (!apiMetric) {
      apiMetric = {
        endpoint,
        method,
        averageResponseTime: 0,
        requestCount: 0,
        errorCount: 0,
        cacheHitRate: 0,
        lastRequestTime: 0
      };
      this.apiMetrics.set(key, apiMetric);
    }

    apiMetric.requestCount++;
    apiMetric.lastRequestTime = responseTime;
    apiMetric.averageResponseTime = (
      (apiMetric.averageResponseTime * (apiMetric.requestCount - 1) + responseTime) /
      apiMetric.requestCount
    );

    if (!success) {
      apiMetric.errorCount++;
    }

    if (cacheHit) {
      apiMetric.cacheHitRate = (
        (apiMetric.cacheHitRate * (apiMetric.requestCount - 1) + 1) /
        apiMetric.requestCount
      );
    }

    if (batchSize) {
      apiMetric.batchingEfficiency = batchSize;
    }

    this.recordMetric({
      name: `api_${endpoint.replace(/[^a-zA-Z0-9]/g, '_')}`,
      value: responseTime,
      unit: 'ms',
      category: 'api',
      metadata: { method, success, cacheHit, batchSize }
    });
  }

  /**
   * Record user interaction metrics
   */
  recordUserInteraction(action: string, component: string, duration: number, success: boolean = true): void {
    if (!this.isEnabled) return;

    const key = `${component}:${action}`;
    let interactionMetric = this.interactionMetrics.get(key);
    if (!interactionMetric) {
      interactionMetric = {
        action,
        component,
        duration: 0,
        frequency: 0,
        errorRate: 0
      };
      this.interactionMetrics.set(key, interactionMetric);
    }

    interactionMetric.frequency++;
    interactionMetric.duration = (
      (interactionMetric.duration * (interactionMetric.frequency - 1) + duration) /
      interactionMetric.frequency
    );

    if (!success) {
      interactionMetric.errorRate = (
        (interactionMetric.errorRate * (interactionMetric.frequency - 1) + 1) /
        interactionMetric.frequency
      );
    }

    this.recordMetric({
      name: `interaction_${action}`,
      value: duration,
      unit: 'ms',
      category: 'user-interaction',
      metadata: { component, success }
    });
  }

  /**
   * Record cache operation metrics
   */
  recordCacheOperation(operation: 'hit' | 'miss' | 'set' | 'eviction', key: string, size?: number): void {
    if (!this.isEnabled) return;

    this.recordMetric({
      name: `cache_${operation}`,
      value: size || 1,
      unit: size ? 'bytes' : 'count',
      category: 'cache',
      metadata: { key, operation }
    });
  }

  /**
   * Get comprehensive performance report
   */
  getPerformanceReport(): PerformanceReport {
    const timestamp = Date.now();
    const warnings: PerformanceReport['warnings'] = [];

    // Analyze component performance
    const components = Array.from(this.componentMetrics.values());
    components.forEach(component => {
      if (component.averageRenderTime > 16) {
        warnings.push({
          type: 'slow-render',
          message: `${component.componentName} has slow average render time: ${component.averageRenderTime.toFixed(2)}ms`,
          component: component.componentName,
          severity: component.averageRenderTime > 50 ? 'high' : 'medium',
          recommendation: 'Consider optimizing with React.memo or useMemo'
        });
      }

      if (component.renderCount > 100 && component.propsChangeCount < component.renderCount * 0.1) {
        warnings.push({
          type: 'memory-leak',
          message: `${component.componentName} may have unnecessary re-renders`,
          component: component.componentName,
          severity: 'medium',
          recommendation: 'Check prop stability and memoization'
        });
      }
    });

    // Analyze API performance
    const apis = Array.from(this.apiMetrics.values());
    apis.forEach(api => {
      const errorRate = api.errorCount / api.requestCount;
      if (errorRate > 0.1) {
        warnings.push({
          type: 'api-error',
          message: `High error rate for ${api.endpoint}: ${(errorRate * 100).toFixed(1)}%`,
          severity: 'high',
          recommendation: 'Check API reliability and error handling'
        });
      }

      if (api.cacheHitRate < 0.5 && api.requestCount > 10) {
        warnings.push({
          type: 'cache-miss',
          message: `Low cache hit rate for ${api.endpoint}: ${(api.cacheHitRate * 100).toFixed(1)}%`,
          severity: 'medium',
          recommendation: 'Review caching strategy and TTL settings'
        });
      }
    });

    // Calculate cache metrics
    const cacheMetrics = this.calculateCacheMetrics();

    // Calculate system metrics
    const systemMetrics = this.getSystemMetrics();

    return {
      timestamp,
      components,
      apis,
      interactions: Array.from(this.interactionMetrics.values()),
      cache: cacheMetrics,
      system: systemMetrics,
      warnings
    };
  }

  /**
   * Get metrics for a specific time period
   */
  getMetricsInTimeRange(startTime: number, endTime: number): PerformanceMetric[] {
    return this.metrics.filter(
      metric => metric.timestamp >= startTime && metric.timestamp <= endTime
    );
  }

  /**
   * Export metrics for external analysis
   */
  exportMetrics(): string {
    const report = this.getPerformanceReport();
    return JSON.stringify(report, null, 2);
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics = [];
    this.componentMetrics.clear();
    this.apiMetrics.clear();
    this.interactionMetrics.clear();
  }

  /**
   * Enable/disable monitoring
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (enabled) {
      localStorage.setItem('org-perf-monitor', 'true');
      this.initializePerformanceObserver();
      this.startReporting();
    } else {
      localStorage.removeItem('org-perf-monitor');
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
      if (this.reportInterval) {
        clearInterval(this.reportInterval);
        this.reportInterval = null;
      }
    }
  }

  /**
   * Private Methods
   */

  private initializePerformanceObserver(): void {
    if (typeof PerformanceObserver === 'undefined') return;

    this.observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach(entry => {
        switch (entry.entryType) {
          case 'measure':
            this.recordMetric({
              name: entry.name,
              value: entry.duration,
              unit: 'ms',
              category: entry.name.includes('render') ? 'render' : 'api'
            });
            break;
          case 'navigation':
            const nav = entry as PerformanceNavigationTiming;
            this.recordMetric({
              name: 'page_load',
              value: nav.loadEventEnd - nav.fetchStart,
              unit: 'ms',
              category: 'network'
            });
            break;
          case 'paint':
            this.recordMetric({
              name: entry.name.replace('-', '_'),
              value: entry.startTime,
              unit: 'ms',
              category: 'render'
            });
            break;
        }
      });
    });

    this.observer.observe({ entryTypes: ['measure', 'navigation', 'paint'] });
  }

  private startReporting(): void {
    if (this.reportInterval) {
      clearInterval(this.reportInterval);
    }

    // Generate performance report every 30 seconds in development
    if (process.env.NODE_ENV === 'development') {
      this.reportInterval = setInterval(() => {
        const report = this.getPerformanceReport();
        if (report.warnings.length > 0) {
          console.group('🔍 Organizational Performance Report');
          console.table(report.warnings);
          console.groupEnd();
        }
      }, 30000);
    }
  }

  private setupMemoryMonitoring(): void {
    if ('memory' in performance) {
      setInterval(() => {
        const memory = (performance as any).memory;
        this.recordMetric({
          name: 'memory_usage',
          value: memory.usedJSHeapSize,
          unit: 'bytes',
          category: 'memory',
          metadata: {
            totalJSHeapSize: memory.totalJSHeapSize,
            jsHeapSizeLimit: memory.jsHeapSizeLimit
          }
        });
      }, 5000);
    }
  }

  private analyzeSlowRender(metric: PerformanceMetric): void {
    console.warn(`🐌 Slow render detected: ${metric.name} took ${metric.value}ms`, metric.metadata);
  }

  private calculateCacheMetrics(): CacheMetrics {
    const cacheOps = this.metrics.filter(m => m.category === 'cache');
    const hits = cacheOps.filter(m => m.name === 'cache_hit').length;
    const misses = cacheOps.filter(m => m.name === 'cache_miss').length;
    const total = hits + misses;

    return {
      hitRate: total > 0 ? hits / total : 0,
      missRate: total > 0 ? misses / total : 0,
      totalSize: cacheOps
        .filter(m => m.name === 'cache_set')
        .reduce((sum, m) => sum + m.value, 0),
      entryCount: cacheOps.filter(m => m.name === 'cache_set').length,
      averageEntrySize: total > 0 ?
        cacheOps.filter(m => m.name === 'cache_set').reduce((sum, m) => sum + m.value, 0) / total : 0,
      evictionCount: cacheOps.filter(m => m.name === 'cache_eviction').length,
      memoryPressure: 0.5 // Placeholder - would need actual memory pressure calculation
    };
  }

  private getSystemMetrics(): PerformanceReport['system'] {
    const memoryMetrics = this.metrics
      .filter(m => m.name === 'memory_usage')
      .slice(-1)[0];

    return {
      memoryUsage: memoryMetrics?.value || 0,
      frameRate: this.calculateFrameRate(),
      networkLatency: this.calculateNetworkLatency()
    };
  }

  private calculateFrameRate(): number {
    // Simple frame rate calculation based on render metrics
    const renderMetrics = this.metrics
      .filter(m => m.category === 'render' && m.timestamp > Date.now() - 1000);

    return renderMetrics.length > 0 ? 60 : 0; // Simplified
  }

  private calculateNetworkLatency(): number {
    const apiMetrics = this.metrics
      .filter(m => m.category === 'api' && m.timestamp > Date.now() - 10000);

    if (apiMetrics.length === 0) return 0;

    return apiMetrics.reduce((sum, m) => sum + m.value, 0) / apiMetrics.length;
  }
}

// Create singleton instance
const organizationalPerformanceMonitor = new OrganizationalPerformanceMonitor();

// React hook for component performance monitoring
import React from 'react';

export function usePerformanceMonitoring(componentName: string) {
  const renderStartTime = React.useRef<number>(0);

  React.useEffect(() => {
    renderStartTime.current = performance.now();
  });

  React.useEffect(() => {
    const renderTime = performance.now() - renderStartTime.current;
    organizationalPerformanceMonitor.recordComponentRender(componentName, renderTime);
  });

  return {
    recordInteraction: (action: string, duration: number, success?: boolean) => {
      organizationalPerformanceMonitor.recordUserInteraction(action, componentName, duration, success);
    },
    recordMetric: (name: string, value: number, unit: PerformanceMetric['unit'], metadata?: any) => {
      organizationalPerformanceMonitor.recordMetric({
        name,
        value,
        unit,
        category: 'user-interaction',
        metadata
      });
    }
  };
}

// API monitoring wrapper
export function withAPIMonitoring<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  endpoint: string,
  method: string = 'GET'
): T {
  return (async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
    const startTime = performance.now();
    let success = false;
    let cacheHit = false;

    try {
      const result = await fn(...args);
      success = true;
      // Check if result came from cache (simplified check)
      cacheHit = result && typeof result === 'object' && result.__fromCache;
      return result;
    } catch (error) {
      success = false;
      throw error;
    } finally {
      const responseTime = performance.now() - startTime;
      organizationalPerformanceMonitor.recordAPICall(endpoint, method, responseTime, success, cacheHit);
    }
  }) as T;
}

export { organizationalPerformanceMonitor };
export type {
  PerformanceMetric,
  ComponentMetrics,
  APIMetrics,
  UserInteractionMetrics,
  CacheMetrics,
  PerformanceReport
};