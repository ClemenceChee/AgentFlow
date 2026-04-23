/**
 * Organizational Data Caching System
 *
 * Provides intelligent client-side caching for organizational data with TTL,
 * invalidation strategies, memory management, and cache warming capabilities.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  lastAccessed: number;
  accessCount: number;
  expiry: number;
  size: number; // Estimated size in bytes
  priority: 'low' | 'normal' | 'high';
  dependencies: string[]; // Cache keys this entry depends on
}

interface CacheStats {
  hits: number;
  misses: number;
  entries: number;
  memoryUsage: number; // Bytes
  hitRate: number;
  oldestEntry: number;
  newestEntry: number;
  totalRequests: number;
}

interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  priority?: 'low' | 'normal' | 'high';
  dependencies?: string[]; // Keys this entry depends on
  maxSize?: number; // Maximum entry size in bytes
}

interface CacheConfig {
  maxMemory: number; // Maximum memory usage in bytes (default: 50MB)
  maxEntries: number; // Maximum number of entries (default: 1000)
  cleanupInterval: number; // Cleanup interval in ms (default: 5 minutes)
  compressionThreshold: number; // Compress entries larger than this (default: 1KB)
}

// Default cache expiration times for different data types
const DEFAULT_CACHE_TTL = {
  teams: 10 * 60 * 1000,          // 10 minutes
  operators: 5 * 60 * 1000,       // 5 minutes
  sessions: 3 * 60 * 1000,        // 3 minutes
  performance: 1 * 60 * 1000,     // 1 minute
  realtime: 30 * 1000,            // 30 seconds
  policies: 15 * 60 * 1000,       // 15 minutes
  activity: 2 * 60 * 1000,        // 2 minutes
  correlation: 5 * 60 * 1000,     // 5 minutes
  default: 5 * 60 * 1000          // Default 5 minutes
};

class OrganizationalCache {
  private cache = new Map<string, CacheEntry<any>>();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    entries: 0,
    memoryUsage: 0,
    hitRate: 0,
    oldestEntry: 0,
    newestEntry: 0,
    totalRequests: 0
  };
  private config: CacheConfig;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private compressionWorker: Worker | null = null;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxMemory: 50 * 1024 * 1024,    // 50MB
      maxEntries: 1000,
      cleanupInterval: 5 * 60 * 1000,  // 5 minutes
      compressionThreshold: 1024,      // 1KB
      ...config
    };

    this.startCleanupTimer();
    this.initializeCompressionWorker();
  }

  /**
   * Get data from cache
   */
  get<T>(key: string): T | null {
    this.stats.totalRequests++;

    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // Check if entry has expired
    if (Date.now() > entry.expiry) {
      this.delete(key);
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // Update access statistics
    entry.lastAccessed = Date.now();
    entry.accessCount++;
    this.stats.hits++;
    this.updateHitRate();

    return entry.data;
  }

  /**
   * Set data in cache
   */
  set<T>(key: string, data: T, options: CacheOptions = {}): void {
    const {
      ttl = this.getDefaultTTL(key),
      priority = 'normal',
      dependencies = [],
      maxSize = Infinity
    } = options;

    const dataSize = this.estimateSize(data);

    // Check size limits
    if (dataSize > maxSize) {
      console.warn(`Cache entry too large for key: ${key}`);
      return;
    }

    // Clean up if needed before adding
    this.ensureCapacity(dataSize);

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 0,
      expiry: Date.now() + ttl,
      size: dataSize,
      priority,
      dependencies
    };

    this.cache.set(key, entry);
    this.updateStats();

    // Schedule compression for large entries
    if (dataSize > this.config.compressionThreshold && this.compressionWorker) {
      this.scheduleCompression(key);
    }
  }

  /**
   * Delete entry from cache
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.stats.memoryUsage -= entry.size;
      this.cache.delete(key);
      this.updateStats();

      // Invalidate dependent entries
      this.invalidateDependents(key);
      return true;
    }
    return false;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.resetStats();
  }

  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    return entry ? Date.now() <= entry.expiry : false;
  }

  /**
   * Get multiple entries at once
   */
  getMultiple<T>(keys: string[]): Map<string, T | null> {
    const results = new Map<string, T | null>();
    keys.forEach(key => {
      results.set(key, this.get<T>(key));
    });
    return results;
  }

  /**
   * Set multiple entries at once
   */
  setMultiple<T>(entries: Array<{ key: string; data: T; options?: CacheOptions }>): void {
    entries.forEach(({ key, data, options }) => {
      this.set(key, data, options);
    });
  }

  /**
   * Invalidate cache entries by pattern
   */
  invalidatePattern(pattern: RegExp | string): number {
    let invalidated = 0;
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

    for (const [key] of this.cache) {
      if (regex.test(key)) {
        this.delete(key);
        invalidated++;
      }
    }

    return invalidated;
  }

  /**
   * Update cache entry TTL
   */
  updateTTL(key: string, ttl: number): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      entry.expiry = Date.now() + ttl;
      return true;
    }
    return false;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Get cache entry metadata
   */
  getMetadata(key: string): Omit<CacheEntry<any>, 'data'> | null {
    const entry = this.cache.get(key);
    if (entry) {
      const { data, ...metadata } = entry;
      return metadata;
    }
    return null;
  }

  /**
   * Warm cache with commonly accessed data
   */
  async warmCache(): Promise<void> {
    const warmupEntries = [
      { key: 'teams:list', url: '/api/teams' },
      { key: 'operators:recent', url: '/api/operators?recent=true' },
      { key: 'performance:overview', url: '/api/performance/overview' },
      { key: 'policy:status', url: '/api/policy/status' }
    ];

    const warmupPromises = warmupEntries.map(async ({ key, url }) => {
      try {
        if (!this.has(key)) {
          const response = await fetch(url);
          if (response.ok) {
            const data = await response.json();
            this.set(key, data, { priority: 'high' });
          }
        }
      } catch (error) {
        console.debug(`Cache warmup failed for ${key}:`, error);
      }
    });

    await Promise.allSettled(warmupPromises);
  }

  /**
   * Export cache for persistence
   */
  export(): string {
    const exportData = {
      cache: Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        ...entry,
        data: this.serializeData(entry.data)
      })),
      stats: this.stats,
      timestamp: Date.now()
    };

    return JSON.stringify(exportData);
  }

  /**
   * Import cache from persistence
   */
  import(serializedData: string): boolean {
    try {
      const importData = JSON.parse(serializedData);
      const now = Date.now();

      // Only import non-expired entries
      importData.cache.forEach(({ key, data, ...entry }: any) => {
        if (entry.expiry > now) {
          this.cache.set(key, {
            ...entry,
            data: this.deserializeData(data)
          });
        }
      });

      this.updateStats();
      return true;
    } catch (error) {
      console.error('Failed to import cache:', error);
      return false;
    }
  }

  /**
   * Private Methods
   */

  private getDefaultTTL(key: string): number {
    const keyType = key.split(':')[0] as keyof typeof DEFAULT_CACHE_TTL;
    return DEFAULT_CACHE_TTL[keyType] || DEFAULT_CACHE_TTL.default;
  }

  private estimateSize(data: any): number {
    try {
      return new Blob([JSON.stringify(data)]).size;
    } catch {
      return JSON.stringify(data).length * 2; // Fallback approximation
    }
  }

  private updateHitRate(): void {
    this.stats.hitRate = this.stats.totalRequests > 0
      ? this.stats.hits / this.stats.totalRequests
      : 0;
  }

  private updateStats(): void {
    this.stats.entries = this.cache.size;
    this.stats.memoryUsage = Array.from(this.cache.values())
      .reduce((total, entry) => total + entry.size, 0);

    const timestamps = Array.from(this.cache.values()).map(e => e.timestamp);
    this.stats.oldestEntry = timestamps.length > 0 ? Math.min(...timestamps) : 0;
    this.stats.newestEntry = timestamps.length > 0 ? Math.max(...timestamps) : 0;
  }

  private resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      entries: 0,
      memoryUsage: 0,
      hitRate: 0,
      oldestEntry: 0,
      newestEntry: 0,
      totalRequests: 0
    };
  }

  private ensureCapacity(newEntrySize: number): void {
    // Remove expired entries first
    this.cleanup();

    // Check if we need to remove entries to fit new data
    while (
      (this.stats.memoryUsage + newEntrySize > this.config.maxMemory ||
       this.stats.entries >= this.config.maxEntries) &&
      this.cache.size > 0
    ) {
      this.evictLeastUseful();
    }
  }

  private evictLeastUseful(): void {
    let leastUsefulKey: string | null = null;
    let lowestScore = Infinity;

    // Calculate usefulness score for each entry
    for (const [key, entry] of this.cache) {
      const age = Date.now() - entry.timestamp;
      const timeSinceAccess = Date.now() - entry.lastAccessed;
      const priorityWeight = entry.priority === 'high' ? 0.5 : entry.priority === 'normal' ? 1 : 2;

      // Lower score = less useful
      const score = (entry.accessCount + 1) /
                   ((age / 1000 + 1) * (timeSinceAccess / 1000 + 1) * priorityWeight);

      if (score < lowestScore) {
        lowestScore = score;
        leastUsefulKey = key;
      }
    }

    if (leastUsefulKey) {
      this.delete(leastUsefulKey);
    }
  }

  private invalidateDependents(key: string): void {
    for (const [entryKey, entry] of this.cache) {
      if (entry.dependencies.includes(key)) {
        this.delete(entryKey);
      }
    }
  }

  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache) {
      if (entry.expiry <= now) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => this.delete(key));
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  private initializeCompressionWorker(): void {
    // Initialize compression worker for large entries if supported
    if (typeof Worker !== 'undefined') {
      try {
        // Note: In a real implementation, this would point to a separate worker file
        // For now, we'll skip compression to avoid complexity
        this.compressionWorker = null;
      } catch {
        this.compressionWorker = null;
      }
    }
  }

  private scheduleCompression(key: string): void {
    // Placeholder for compression scheduling
    // In a real implementation, this would compress large cache entries
  }

  private serializeData(data: any): any {
    // Simple serialization - could be enhanced with compression
    return data;
  }

  private deserializeData(data: any): any {
    // Simple deserialization - counterpart to serializeData
    return data;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    if (this.compressionWorker) {
      this.compressionWorker.terminate();
      this.compressionWorker = null;
    }

    this.clear();
  }
}

// Create singleton instance
const organizationalCache = new OrganizationalCache();

// Auto-warmup cache when available
if (typeof window !== 'undefined') {
  // Wait for app to initialize before warming up
  setTimeout(() => {
    organizationalCache.warmCache().catch(() => {
      // Silently fail - warmup is optional
    });
  }, 2000);

  // Export cache before page unload for persistence
  window.addEventListener('beforeunload', () => {
    try {
      const cacheData = organizationalCache.export();
      localStorage.setItem('org-cache', cacheData);
    } catch {
      // Ignore storage errors
    }
  });

  // Import cache on page load
  try {
    const savedCache = localStorage.getItem('org-cache');
    if (savedCache) {
      organizationalCache.import(savedCache);
    }
  } catch {
    // Ignore import errors
  }
}

export { OrganizationalCache, organizationalCache };
export type { CacheOptions, CacheStats, CacheConfig };