import { describe, it, expect, vi } from 'vitest';
import { loadFeatureFlags, isEnabled, getResourceUsage, getPerformanceRecommendations, loadScalingConfig, loadOnboardingConfig } from '../deployment.js';

describe('Feature Flags', () => {
  it('loads default flags', () => {
    const flags = loadFeatureFlags();
    expect(flags.dashboard_enabled).toBe(true);
    expect(flags.streaming_enabled).toBe(true);
  });

  it('isEnabled checks flag existence', () => {
    expect(isEnabled({ foo: true }, 'foo')).toBe(true);
    expect(isEnabled({ foo: false }, 'foo')).toBe(false);
    expect(isEnabled({}, 'bar')).toBe(false);
  });

  it('reads flags from env', () => {
    process.env.BI_FF_CUSTOM_FLAG = 'true';
    const flags = loadFeatureFlags();
    expect(flags.custom_flag).toBe(true);
    delete process.env.BI_FF_CUSTOM_FLAG;
  });
});

describe('Resource Usage', () => {
  it('returns valid resource metrics', () => {
    const usage = getResourceUsage();
    expect(usage.memoryUsedMb).toBeGreaterThan(0);
    expect(usage.heapUsedMb).toBeGreaterThan(0);
    expect(usage.heapTotalMb).toBeGreaterThan(0);
  });
});

describe('Performance Recommendations', () => {
  it('returns no recommendations for healthy resources', () => {
    const recs = getPerformanceRecommendations({
      memoryUsedMb: 100, memoryTotalMb: 1000, memoryPct: 10,
      cpuPct: 5, heapUsedMb: 50, heapTotalMb: 512,
      activeConnections: 10, eventLoopDelayMs: 1,
    });
    expect(recs).toEqual([]);
  });

  it('recommends memory optimization for high usage', () => {
    const recs = getPerformanceRecommendations({
      memoryUsedMb: 900, memoryTotalMb: 1000, memoryPct: 90,
      cpuPct: 5, heapUsedMb: 600, heapTotalMb: 700,
      activeConnections: 10, eventLoopDelayMs: 1,
    });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.some((r) => r.area === 'Memory')).toBe(true);
    expect(recs.some((r) => r.area === 'Heap')).toBe(true);
  });
});

describe('Scaling Config', () => {
  it('loads defaults', () => {
    const config = loadScalingConfig();
    expect(config.maxConnections).toBe(1000);
    expect(config.requestTimeout).toBe(30_000);
  });
});

describe('Onboarding Config', () => {
  it('loads defaults', () => {
    const config = loadOnboardingConfig();
    expect(config.selfRegistrationEnabled).toBe(false);
    expect(config.defaultRole).toBe('viewer');
  });
});
