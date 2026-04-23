/**
 * Unit Tests for Organizational Cache System
 */

import { OrganizationalCache } from '../../../src/client/utils/organizational-cache';

describe('OrganizationalCache', () => {
  let cache: OrganizationalCache;

  beforeEach(() => {
    // Create a fresh cache instance for each test
    cache = new OrganizationalCache({
      maxMemory: 1024 * 1024, // 1MB for testing
      maxEntries: 100,
      cleanupInterval: 1000, // 1 second for testing
    });

    // Clear any existing cache data
    cache.clear();
  });

  afterEach(() => {
    if (cache) {
      cache.destroy();
    }
  });

  describe('basic operations', () => {
    it('stores and retrieves data correctly', () => {
      const testData = { name: 'test', value: 42 };

      cache.set('test-key', testData);
      const retrieved = cache.get('test-key');

      expect(retrieved).toEqual(testData);
    });

    it('returns null for non-existent keys', () => {
      const result = cache.get('non-existent');
      expect(result).toBeNull();
    });

    it('deletes entries correctly', () => {
      cache.set('test-key', { data: 'test' });
      expect(cache.has('test-key')).toBe(true);

      const deleted = cache.delete('test-key');
      expect(deleted).toBe(true);
      expect(cache.has('test-key')).toBe(false);
      expect(cache.get('test-key')).toBeNull();
    });

    it('checks existence correctly', () => {
      expect(cache.has('test-key')).toBe(false);

      cache.set('test-key', { data: 'test' });
      expect(cache.has('test-key')).toBe(true);
    });

    it('clears all entries', () => {
      cache.set('key1', { data: 'test1' });
      cache.set('key2', { data: 'test2' });

      cache.clear();

      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(false);
      expect(cache.getStats().entries).toBe(0);
    });
  });

  describe('TTL (Time To Live)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('respects custom TTL values', () => {
      const testData = { data: 'test' };

      cache.set('test-key', testData, { ttl: 1000 }); // 1 second TTL
      expect(cache.get('test-key')).toEqual(testData);

      // Advance time by 1.5 seconds
      jest.advanceTimersByTime(1500);
      expect(cache.get('test-key')).toBeNull();
    });

    it('uses default TTL for different data types', () => {
      cache.set('teams:list', { teams: [] });
      cache.set('operators:list', { operators: [] });
      cache.set('performance:overview', { metrics: {} });

      // All should be available immediately
      expect(cache.has('teams:list')).toBe(true);
      expect(cache.has('operators:list')).toBe(true);
      expect(cache.has('performance:overview')).toBe(true);

      // Advance time beyond performance TTL (1 minute) but within teams TTL (10 minutes)
      jest.advanceTimersByTime(2 * 60 * 1000); // 2 minutes

      expect(cache.has('teams:list')).toBe(true);
      expect(cache.has('operators:list')).toBe(true);
      expect(cache.has('performance:overview')).toBe(false);
    });

    it('updates TTL for existing entries', () => {
      cache.set('test-key', { data: 'test' }, { ttl: 1000 });

      // Update TTL
      const updated = cache.updateTTL('test-key', 2000);
      expect(updated).toBe(true);

      // Should still be available after original TTL
      jest.advanceTimersByTime(1500);
      expect(cache.get('test-key')).not.toBeNull();

      // Should expire after new TTL
      jest.advanceTimersByTime(1000);
      expect(cache.get('test-key')).toBeNull();
    });
  });

  describe('priority and eviction', () => {
    it('evicts low priority items when memory limit is reached', () => {
      // Fill cache with low priority items
      for (let i = 0; i < 150; i++) {
        cache.set(`low-${i}`, { data: `low-${i}` }, { priority: 'low' });
      }

      // Add a high priority item
      cache.set('high-priority', { data: 'important' }, { priority: 'high' });

      const stats = cache.getStats();
      expect(stats.entries).toBeLessThanOrEqual(100); // Respect maxEntries limit
      expect(cache.has('high-priority')).toBe(true); // High priority should remain
    });

    it('considers access patterns in eviction decisions', () => {
      // Add items
      cache.set('frequently-accessed', { data: 'popular' });
      cache.set('rarely-accessed', { data: 'unpopular' });

      // Access one item multiple times
      for (let i = 0; i < 10; i++) {
        cache.get('frequently-accessed');
      }

      // Fill cache to trigger eviction
      for (let i = 0; i < 150; i++) {
        cache.set(`filler-${i}`, { data: i });
      }

      // Frequently accessed item should be more likely to remain
      const frequentlyAccessedStillThere = cache.has('frequently-accessed');
      const _rarelyAccessedStillThere = cache.has('rarely-accessed');

      expect(frequentlyAccessedStillThere).toBe(true);
    });
  });

  describe('batch operations', () => {
    it('gets multiple entries at once', () => {
      const data1 = { value: 1 };
      const data2 = { value: 2 };
      const _data3 = { value: 3 };

      cache.set('key1', data1);
      cache.set('key2', data2);

      const results = cache.getMultiple(['key1', 'key2', 'key3']);

      expect(results.get('key1')).toEqual(data1);
      expect(results.get('key2')).toEqual(data2);
      expect(results.get('key3')).toBeNull();
    });

    it('sets multiple entries at once', () => {
      const entries = [
        { key: 'key1', data: { value: 1 } },
        { key: 'key2', data: { value: 2 } },
        { key: 'key3', data: { value: 3 } },
      ];

      cache.setMultiple(entries);

      entries.forEach(({ key, data }) => {
        expect(cache.get(key)).toEqual(data);
      });
    });
  });

  describe('pattern-based operations', () => {
    it('invalidates entries by string pattern', () => {
      cache.set('team:1', { teamId: '1' });
      cache.set('team:2', { teamId: '2' });
      cache.set('operator:1', { operatorId: '1' });

      const invalidated = cache.invalidatePattern('team:');

      expect(invalidated).toBe(2);
      expect(cache.has('team:1')).toBe(false);
      expect(cache.has('team:2')).toBe(false);
      expect(cache.has('operator:1')).toBe(true);
    });

    it('invalidates entries by regex pattern', () => {
      cache.set('user:123', { userId: '123' });
      cache.set('user:456', { userId: '456' });
      cache.set('team:789', { teamId: '789' });

      const invalidated = cache.invalidatePattern(/^user:/);

      expect(invalidated).toBe(2);
      expect(cache.has('user:123')).toBe(false);
      expect(cache.has('user:456')).toBe(false);
      expect(cache.has('team:789')).toBe(true);
    });
  });

  describe('dependencies', () => {
    it('invalidates dependent entries when dependency is deleted', () => {
      // Set up dependency relationship
      cache.set('team:1', { teamId: '1' });
      cache.set('team:1:members', { members: [] }, { dependencies: ['team:1'] });
      cache.set('team:1:stats', { stats: {} }, { dependencies: ['team:1'] });

      // Delete the dependency
      cache.delete('team:1');

      // Dependent entries should be invalidated
      expect(cache.has('team:1:members')).toBe(false);
      expect(cache.has('team:1:stats')).toBe(false);
    });
  });

  describe('statistics', () => {
    it('tracks cache statistics correctly', () => {
      // Start with empty cache
      let stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.entries).toBe(0);

      // Add data and access it
      cache.set('test-key', { data: 'test' });
      cache.get('test-key'); // Hit
      cache.get('non-existent'); // Miss

      stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.entries).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });

    it('tracks memory usage', () => {
      const largeData = { data: 'x'.repeat(1000) };

      cache.set('large-item', largeData);

      const stats = cache.getStats();
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });
  });

  describe('metadata', () => {
    it('returns metadata for cache entries', () => {
      const testData = { data: 'test' };
      cache.set('test-key', testData, { priority: 'high' });

      const metadata = cache.getMetadata('test-key');

      expect(metadata).toMatchObject({
        priority: 'high',
        accessCount: expect.any(Number),
        timestamp: expect.any(Number),
      });
    });

    it('returns null metadata for non-existent entries', () => {
      const metadata = cache.getMetadata('non-existent');
      expect(metadata).toBeNull();
    });
  });

  describe('cache warming', () => {
    beforeEach(() => {
      // Mock fetch for cache warming tests
      global.fetch = jest.fn();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('warms cache with common data', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ teams: ['team1', 'team2'] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ operators: ['op1', 'op2'] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ performance: { metric: 'value' } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ policies: ['policy1'] }),
        });

      await cache.warmCache();

      expect(cache.has('teams:list')).toBe(true);
      expect(cache.has('operators:recent')).toBe(true);
      expect(cache.has('performance:overview')).toBe(true);
      expect(cache.has('policy:status')).toBe(true);
    });

    it('handles warmup failures gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      // Should not throw
      await expect(cache.warmCache()).resolves.toBeUndefined();
    });
  });

  describe('export and import', () => {
    it('exports cache data as JSON', () => {
      cache.set('key1', { data: 'value1' });
      cache.set('key2', { data: 'value2' });

      const exported = cache.export();
      const parsed = JSON.parse(exported);

      expect(parsed).toHaveProperty('cache');
      expect(parsed).toHaveProperty('stats');
      expect(parsed).toHaveProperty('timestamp');
      expect(parsed.cache).toHaveLength(2);
    });

    it('imports cache data from JSON', () => {
      // Export initial state
      cache.set('original', { data: 'original' });
      const exported = cache.export();

      // Clear and import
      cache.clear();
      expect(cache.has('original')).toBe(false);

      const imported = cache.import(exported);
      expect(imported).toBe(true);
      expect(cache.get('original')).toEqual({ data: 'original' });
    });

    it('handles invalid import data gracefully', () => {
      const result = cache.import('invalid json');
      expect(result).toBe(false);

      // Cache should remain functional
      cache.set('test', { data: 'test' });
      expect(cache.get('test')).toEqual({ data: 'test' });
    });
  });
});

describe('OrganizationalCache error handling', () => {
  it('handles cache operation errors gracefully', () => {
    const cache = new OrganizationalCache();

    // These operations should not throw even with invalid inputs
    expect(() => cache.set('', null)).not.toThrow();
    expect(() => cache.get('')).not.toThrow();
    expect(() => cache.delete('')).not.toThrow();

    cache.destroy();
  });

  it('continues functioning after cleanup errors', () => {
    const cache = new OrganizationalCache();

    // Add some data
    cache.set('test', { data: 'test' });

    // Force cleanup (this might involve internal errors)
    (cache as any).cleanup();

    // Should still function
    cache.set('after-cleanup', { data: 'after' });
    expect(cache.get('after-cleanup')).toEqual({ data: 'after' });

    cache.destroy();
  });
});
