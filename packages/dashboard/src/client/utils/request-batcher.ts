/**
 * Request Batching System for Organizational API Calls
 *
 * Efficiently batches multiple API requests to reduce HTTP overhead
 * and improve performance for organizational dashboard operations.
 */

interface BatchRequest {
  id: string;
  endpoint: string;
  params?: Record<string, any>;
  resolve: (data: any) => void;
  reject: (error: Error) => void;
  timestamp: number;
  priority: 'low' | 'normal' | 'high';
}

interface BatchConfig {
  /** Maximum number of requests per batch */
  maxBatchSize: number;
  /** Maximum time to wait before sending batch (ms) */
  maxWaitTime: number;
  /** Time to wait after last request before sending (ms) */
  debounceTime: number;
  /** Base URL for batch endpoint */
  batchEndpoint: string;
  /** Whether to enable batching (can be disabled for debugging) */
  enabled: boolean;
}

interface BatchResponse {
  results: Array<{
    id: string;
    success: boolean;
    data?: any;
    error?: {
      message: string;
      code?: string;
      status?: number;
    };
  }>;
}

interface RequestStats {
  totalRequests: number;
  batchedRequests: number;
  averageBatchSize: number;
  timeSaved: number; // Estimated time saved in ms
  errorRate: number;
}

class RequestBatcher {
  private pendingRequests = new Map<string, BatchRequest>();
  private batchTimer: NodeJS.Timeout | null = null;
  private config: BatchConfig;
  private stats: RequestStats = {
    totalRequests: 0,
    batchedRequests: 0,
    averageBatchSize: 0,
    timeSaved: 0,
    errorRate: 0
  };
  private errorCount = 0;
  private batchCount = 0;

  constructor(config: Partial<BatchConfig> = {}) {
    this.config = {
      maxBatchSize: 20,
      maxWaitTime: 100, // 100ms max wait
      debounceTime: 10,  // 10ms debounce
      batchEndpoint: '/api/batch',
      enabled: true,
      ...config
    };
  }

  /**
   * Add a request to the batch queue
   */
  async request<T = any>(
    endpoint: string,
    params?: Record<string, any>,
    options: {
      priority?: 'low' | 'normal' | 'high';
      bypassBatching?: boolean;
    } = {}
  ): Promise<T> {
    const { priority = 'normal', bypassBatching = false } = options;

    this.stats.totalRequests++;

    // If batching is disabled or bypassed, make direct request
    if (!this.config.enabled || bypassBatching) {
      return this.makeDirectRequest<T>(endpoint, params);
    }

    // Check if this is a batchable endpoint
    if (!this.isBatchableEndpoint(endpoint)) {
      return this.makeDirectRequest<T>(endpoint, params);
    }

    return new Promise<T>((resolve, reject) => {
      const id = this.generateRequestId();
      const request: BatchRequest = {
        id,
        endpoint,
        params,
        resolve,
        reject,
        timestamp: Date.now(),
        priority
      };

      this.pendingRequests.set(id, request);
      this.scheduleBatch();
    });
  }

  /**
   * Force immediate processing of pending requests
   */
  async flush(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.pendingRequests.size > 0) {
      await this.processBatch();
    }
  }

  /**
   * Get batching statistics
   */
  getStats(): RequestStats {
    return {
      ...this.stats,
      averageBatchSize: this.batchCount > 0 ? this.stats.batchedRequests / this.batchCount : 0,
      errorRate: this.stats.totalRequests > 0 ? this.errorCount / this.stats.totalRequests : 0
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      batchedRequests: 0,
      averageBatchSize: 0,
      timeSaved: 0,
      errorRate: 0
    };
    this.errorCount = 0;
    this.batchCount = 0;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<BatchConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Private Methods
   */

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private isBatchableEndpoint(endpoint: string): boolean {
    // Define which endpoints can be batched
    const batchablePatterns = [
      /^\/api\/teams/,
      /^\/api\/operators/,
      /^\/api\/performance/,
      /^\/api\/activity/,
      /^\/api\/sessions/,
      /^\/api\/policy/
    ];

    // Exclude certain endpoints that shouldn't be batched
    const excludePatterns = [
      /\/upload$/,
      /\/download$/,
      /\/stream$/,
      /\/websocket$/,
      /\/sse$/
    ];

    return batchablePatterns.some(pattern => pattern.test(endpoint)) &&
           !excludePatterns.some(pattern => pattern.test(endpoint));
  }

  private scheduleBatch(): void {
    // If we already have a timer, reset it (debouncing)
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    // Check if we should send immediately due to batch size or high priority requests
    const shouldSendImmediately =
      this.pendingRequests.size >= this.config.maxBatchSize ||
      Array.from(this.pendingRequests.values()).some(req => req.priority === 'high');

    if (shouldSendImmediately) {
      this.processBatch();
      return;
    }

    // Check if any request is approaching max wait time
    const now = Date.now();
    const oldestRequest = Array.from(this.pendingRequests.values())
      .sort((a, b) => a.timestamp - b.timestamp)[0];

    if (oldestRequest && (now - oldestRequest.timestamp) >= this.config.maxWaitTime) {
      this.processBatch();
      return;
    }

    // Schedule batch processing
    this.batchTimer = setTimeout(() => {
      this.processBatch();
    }, this.config.debounceTime);
  }

  private async processBatch(): Promise<void> {
    if (this.pendingRequests.size === 0) return;

    // Clear timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Get requests to process (up to max batch size)
    const requests = Array.from(this.pendingRequests.values())
      .sort((a, b) => {
        // Sort by priority (high > normal > low) then by timestamp
        const priorityOrder = { high: 3, normal: 2, low: 1 };
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
        return priorityDiff !== 0 ? priorityDiff : a.timestamp - b.timestamp;
      })
      .slice(0, this.config.maxBatchSize);

    // Remove processed requests from pending
    requests.forEach(req => this.pendingRequests.delete(req.id));

    // Update stats
    this.stats.batchedRequests += requests.length;
    this.batchCount++;

    try {
      await this.sendBatch(requests);

      // Calculate estimated time saved
      const estimatedTimeSaved = (requests.length - 1) * 50; // Assume 50ms per request overhead
      this.stats.timeSaved += estimatedTimeSaved;

    } catch (error) {
      console.error('Batch processing failed:', error);
      this.errorCount += requests.length;

      // Reject all requests in the batch
      requests.forEach(req => {
        req.reject(new Error(`Batch processing failed: ${error}`));
      });
    }

    // If there are still pending requests, schedule another batch
    if (this.pendingRequests.size > 0) {
      this.scheduleBatch();
    }
  }

  private async sendBatch(requests: BatchRequest[]): Promise<void> {
    const batchPayload = {
      requests: requests.map(req => ({
        id: req.id,
        endpoint: req.endpoint,
        params: req.params,
        priority: req.priority
      }))
    };

    try {
      const response = await fetch(this.config.batchEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(batchPayload)
      });

      if (!response.ok) {
        throw new Error(`Batch request failed: ${response.status} ${response.statusText}`);
      }

      const batchResponse: BatchResponse = await response.json();

      // Process individual responses
      batchResponse.results.forEach(result => {
        const request = requests.find(req => req.id === result.id);
        if (!request) return;

        if (result.success) {
          request.resolve(result.data);
        } else {
          const error = new Error(result.error?.message || 'Unknown batch error');
          if (result.error?.code) {
            (error as any).code = result.error.code;
          }
          if (result.error?.status) {
            (error as any).status = result.error.status;
          }
          request.reject(error);
          this.errorCount++;
        }
      });

    } catch (error) {
      // If batch request fails, try individual requests as fallback
      await this.fallbackToIndividualRequests(requests);
    }
  }

  private async fallbackToIndividualRequests(requests: BatchRequest[]): Promise<void> {
    console.warn(`Batch request failed, falling back to ${requests.length} individual requests`);

    const promises = requests.map(async (req) => {
      try {
        const result = await this.makeDirectRequest(req.endpoint, req.params);
        req.resolve(result);
      } catch (error) {
        req.reject(error as Error);
        this.errorCount++;
      }
    });

    await Promise.allSettled(promises);
  }

  private async makeDirectRequest<T = any>(
    endpoint: string,
    params?: Record<string, any>
  ): Promise<T> {
    const url = new URL(endpoint, window.location.origin);

    // Add query parameters if provided
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
}

// Create singleton instance
const requestBatcher = new RequestBatcher();

// Organizational API helper functions
export const organizationalAPI = {
  /**
   * Get team data with batching
   */
  async getTeam(teamId: string, options?: { priority?: 'low' | 'normal' | 'high' }) {
    return requestBatcher.request(`/api/teams/${teamId}`, undefined, options);
  },

  /**
   * Get multiple teams with batching
   */
  async getTeams(teamIds?: string[], options?: { priority?: 'low' | 'normal' | 'high' }) {
    if (teamIds && teamIds.length > 1) {
      // Batch multiple team requests
      const promises = teamIds.map(id =>
        requestBatcher.request(`/api/teams/${id}`, undefined, options)
      );
      return Promise.all(promises);
    }
    return requestBatcher.request('/api/teams', { ids: teamIds }, options);
  },

  /**
   * Get operator data with batching
   */
  async getOperator(operatorId: string, options?: { priority?: 'low' | 'normal' | 'high' }) {
    return requestBatcher.request(`/api/operators/${operatorId}`, undefined, options);
  },

  /**
   * Get multiple operators with batching
   */
  async getOperators(operatorIds?: string[], options?: { priority?: 'low' | 'normal' | 'high' }) {
    if (operatorIds && operatorIds.length > 1) {
      const promises = operatorIds.map(id =>
        requestBatcher.request(`/api/operators/${id}`, undefined, options)
      );
      return Promise.all(promises);
    }
    return requestBatcher.request('/api/operators', { ids: operatorIds }, options);
  },

  /**
   * Get performance data with batching
   */
  async getPerformanceData(type: string = 'overview', params?: Record<string, any>, options?: { priority?: 'low' | 'normal' | 'high' }) {
    return requestBatcher.request(`/api/performance/${type}`, params, options);
  },

  /**
   * Get activity data with batching
   */
  async getActivityData(type: string = 'overview', params?: Record<string, any>, options?: { priority?: 'low' | 'normal' | 'high' }) {
    return requestBatcher.request(`/api/activity/${type}`, params, options);
  },

  /**
   * Get session data with batching
   */
  async getSessionData(sessionId?: string, params?: Record<string, any>, options?: { priority?: 'low' | 'normal' | 'high' }) {
    const endpoint = sessionId ? `/api/sessions/${sessionId}` : '/api/sessions';
    return requestBatcher.request(endpoint, params, options);
  },

  /**
   * Get policy data with batching
   */
  async getPolicyData(params?: Record<string, any>, options?: { priority?: 'low' | 'normal' | 'high' }) {
    return requestBatcher.request('/api/policy/status', params, options);
  },

  /**
   * Batch multiple different requests
   */
  async batchRequests<T extends Record<string, any>>(
    requests: Array<{
      key: string;
      endpoint: string;
      params?: Record<string, any>;
      priority?: 'low' | 'normal' | 'high';
    }>
  ): Promise<T> {
    const promises = requests.map(async ({ key, endpoint, params, priority }) => ({
      key,
      result: await requestBatcher.request(endpoint, params, { priority })
    }));

    const results = await Promise.allSettled(promises);
    const data = {} as T;

    results.forEach((result, index) => {
      const { key } = requests[index];
      if (result.status === 'fulfilled') {
        data[key as keyof T] = result.value.result;
      } else {
        console.error(`Request failed for ${key}:`, result.reason);
        data[key as keyof T] = null;
      }
    });

    return data;
  },

  /**
   * Force flush pending batches
   */
  async flush() {
    return requestBatcher.flush();
  },

  /**
   * Get batching statistics
   */
  getStats() {
    return requestBatcher.getStats();
  },

  /**
   * Configure batching behavior
   */
  configure(config: Partial<BatchConfig>) {
    requestBatcher.updateConfig(config);
  }
};

// Auto-flush on page unload to prevent lost requests
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    requestBatcher.flush();
  });

  // Flush periodically to prevent requests from staying pending too long
  setInterval(() => {
    if (requestBatcher.getStats().batchedRequests > 0) {
      requestBatcher.flush();
    }
  }, 5000); // Flush every 5 seconds if there are pending requests
}

export { RequestBatcher, requestBatcher };
export type { BatchConfig, RequestStats };