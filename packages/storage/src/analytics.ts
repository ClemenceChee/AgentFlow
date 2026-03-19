import type Database from 'better-sqlite3';

export class StorageAnalytics {
  constructor(private db: Database.Database) {}

  public getHealthScore(agentId?: string, days = 7): number {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    let sql = `
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
                AVG(executionTime) as avgTime,
                COUNT(DISTINCT DATE(datetime(timestamp/1000, 'unixepoch'))) as activeDays
            FROM executions
            WHERE timestamp >= ?
        `;

    const params = [since];

    if (agentId) {
      sql += ' AND agentId = ?';
      params.push(agentId);
    }

    const result = this.db.prepare(sql).get(...params) as any;

    if (!result || result.total === 0) return 0;

    // Calculate health score (0-100)
    const successRate = (result.successful / result.total) * 100;
    const consistencyScore = (result.activeDays / days) * 100; // Activity consistency
    const performanceScore = result.avgTime ? Math.max(0, 100 - result.avgTime / 1000) : 100; // Penalize slow executions

    // Weighted average
    const healthScore = successRate * 0.6 + consistencyScore * 0.3 + performanceScore * 0.1;

    return Math.min(100, Math.max(0, Math.round(healthScore)));
  }

  public detectAnomalies(agentId: string, days = 30): any[] {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    // Get execution data with hourly aggregation
    const hourlyData = this.db
      .prepare(`
            SELECT
                strftime('%Y-%m-%d %H:00', datetime(timestamp/1000, 'unixepoch')) as hour,
                COUNT(*) as count,
                AVG(executionTime) as avgTime,
                SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful
            FROM executions
            WHERE agentId = ? AND timestamp >= ?
            GROUP BY hour
            ORDER BY hour
        `)
      .all(agentId, since);

    const anomalies: any[] = [];

    if (hourlyData.length < 24) return anomalies; // Not enough data

    // Calculate baselines
    const counts = hourlyData.map((d) => d.count);
    const times = hourlyData.filter((d) => d.avgTime).map((d) => d.avgTime);
    const successRates = hourlyData.map((d) =>
      d.count > 0 ? (d.successful / d.count) * 100 : 100,
    );

    const countMean = this.mean(counts);
    const countStdDev = this.standardDeviation(counts);
    const timeMean = this.mean(times);
    const timeStdDev = this.standardDeviation(times);
    const successMean = this.mean(successRates);

    // Detect anomalies (2 standard deviations from mean)
    for (const data of hourlyData) {
      const countZScore = Math.abs((data.count - countMean) / countStdDev);
      const timeZScore = data.avgTime ? Math.abs((data.avgTime - timeMean) / timeStdDev) : 0;
      const successRate = data.count > 0 ? (data.successful / data.count) * 100 : 100;

      if (countZScore > 2) {
        anomalies.push({
          type: 'execution_volume',
          hour: data.hour,
          severity: countZScore > 3 ? 'high' : 'medium',
          value: data.count,
          expected: Math.round(countMean),
          description:
            data.count > countMean
              ? 'Unusually high execution volume'
              : 'Unusually low execution volume',
        });
      }

      if (timeZScore > 2 && data.avgTime) {
        anomalies.push({
          type: 'execution_time',
          hour: data.hour,
          severity: timeZScore > 3 ? 'high' : 'medium',
          value: Math.round(data.avgTime),
          expected: Math.round(timeMean),
          description: 'Unusually slow execution time',
        });
      }

      if (successRate < successMean - 20 && data.count >= 3) {
        // At least 3 executions
        anomalies.push({
          type: 'success_rate',
          hour: data.hour,
          severity: successRate < 50 ? 'high' : 'medium',
          value: Math.round(successRate),
          expected: Math.round(successMean),
          description: 'Unusually low success rate',
        });
      }
    }

    return anomalies.sort((a, b) => new Date(b.hour).getTime() - new Date(a.hour).getTime());
  }

  public getTrends(agentId?: string, days = 30): any {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    let sql = `
            SELECT
                strftime('%Y-%m-%d', datetime(timestamp/1000, 'unixepoch')) as date,
                COUNT(*) as count,
                AVG(executionTime) as avgTime,
                SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful
            FROM executions
            WHERE timestamp >= ?
        `;

    const params = [since];

    if (agentId) {
      sql += ' AND agentId = ?';
      params.push(agentId);
    }

    sql += ' GROUP BY date ORDER BY date';

    const dailyData = this.db.prepare(sql).all(...params);

    if (dailyData.length < 7) return { error: 'Insufficient data for trend analysis' };

    // Calculate trends
    const counts = dailyData.map((d) => d.count);
    const times = dailyData.filter((d) => d.avgTime).map((d) => d.avgTime);
    const successRates = dailyData.map((d) => (d.successful / d.count) * 100);

    return {
      period: `${days} days`,
      trends: {
        executionVolume: this.calculateTrend(counts),
        executionTime: this.calculateTrend(times),
        successRate: this.calculateTrend(successRates),
      },
      dailyData: dailyData.map((d) => ({
        date: d.date,
        count: d.count,
        avgTime: Math.round(d.avgTime || 0),
        successRate: Math.round((d.successful / d.count) * 100),
      })),
    };
  }

  public getResourceUtilization(days = 7): any {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    // Database size
    const dbSize = this.db
      .prepare('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()')
      .get() as any;

    // Execution statistics
    const execStats = this.db
      .prepare(`
            SELECT
                COUNT(*) as totalExecutions,
                COUNT(DISTINCT agentId) as activeAgents,
                AVG(executionTime) as avgExecutionTime,
                SUM(executionTime) as totalExecutionTime,
                MAX(timestamp) - MIN(timestamp) as timespan
            FROM executions
            WHERE timestamp >= ?
        `)
      .get(since) as any;

    // Storage breakdown
    const storageStats = this.db
      .prepare(`
            SELECT
                COUNT(*) as executionRecords,
                (SELECT COUNT(*) FROM agents) as agentRecords,
                (SELECT COUNT(*) FROM daily_stats) as dailyStatRecords
            FROM executions
        `)
      .get() as any;

    return {
      period: `${days} days`,
      database: {
        sizeBytes: dbSize?.size || 0,
        sizeMB: Math.round(((dbSize?.size || 0) / 1024 / 1024) * 100) / 100,
      },
      execution: {
        totalExecutions: execStats?.totalExecutions || 0,
        activeAgents: execStats?.activeAgents || 0,
        avgExecutionTime: Math.round(execStats?.avgExecutionTime || 0),
        totalProcessingTime: Math.round(execStats?.totalExecutionTime || 0),
        timespan: execStats?.timespan || 0,
      },
      storage: {
        executionRecords: storageStats?.executionRecords || 0,
        agentRecords: storageStats?.agentRecords || 0,
        dailyStatRecords: storageStats?.dailyStatRecords || 0,
      },
    };
  }

  public getAgentComparison(agentIds: string[], days = 7): any {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    const comparisons = agentIds.map((agentId) => {
      const stats = this.db
        .prepare(`
                SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
                    AVG(executionTime) as avgTime,
                    MAX(timestamp) as lastExecution
                FROM executions
                WHERE agentId = ? AND timestamp >= ?
            `)
        .get(agentId, since) as any;

      return {
        agentId,
        executions: stats?.total || 0,
        successRate: stats?.total ? (stats.successful / stats.total) * 100 : 0,
        avgExecutionTime: stats?.avgTime || 0,
        lastExecution: stats?.lastExecution || 0,
        healthScore: this.getHealthScore(agentId, days),
      };
    });

    // Sort by health score
    comparisons.sort((a, b) => b.healthScore - a.healthScore);

    return {
      period: `${days} days`,
      agents: comparisons,
      summary: {
        totalAgents: comparisons.length,
        totalExecutions: comparisons.reduce((sum, agent) => sum + agent.executions, 0),
        avgSuccessRate: this.mean(comparisons.map((agent) => agent.successRate)),
        avgHealthScore: this.mean(comparisons.map((agent) => agent.healthScore)),
      },
    };
  }

  public getFailurePatterns(days = 30): any {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    // Get failure data
    const failures = this.db
      .prepare(`
            SELECT
                agentId,
                trigger,
                timestamp,
                failureCount,
                metadata
            FROM executions
            WHERE success = 0 AND timestamp >= ?
            ORDER BY timestamp DESC
        `)
      .all(since);

    // Analyze patterns
    const byAgent = failures.reduce(
      (acc, failure) => {
        acc[failure.agentId] = (acc[failure.agentId] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const byTrigger = failures.reduce(
      (acc, failure) => {
        acc[failure.trigger] = (acc[failure.trigger] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const byHour = failures.reduce(
      (acc, failure) => {
        const hour = new Date(failure.timestamp).getHours();
        acc[hour] = (acc[hour] || 0) + 1;
        return acc;
      },
      {} as Record<number, number>,
    );

    return {
      period: `${days} days`,
      summary: {
        totalFailures: failures.length,
        affectedAgents: Object.keys(byAgent).length,
        mostFailedAgent: this.getMaxKey(byAgent),
        mostFailedTrigger: this.getMaxKey(byTrigger),
        peakFailureHour: parseInt(this.getMaxKey(byHour), 10),
      },
      patterns: {
        byAgent: Object.entries(byAgent)
          .map(([agentId, count]) => ({ agentId, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        byTrigger: Object.entries(byTrigger)
          .map(([trigger, count]) => ({ trigger, count }))
          .sort((a, b) => b.count - a.count),
        byHour: Object.entries(byHour)
          .map(([hour, count]) => ({ hour: parseInt(hour, 10), count }))
          .sort((a, b) => a.hour - b.hour),
      },
    };
  }

  // Utility methods
  private mean(values: number[]): number {
    return values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0;
  }

  private standardDeviation(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = this.mean(values);
    const squaredDiffs = values.map((val) => (val - mean) ** 2);
    const avgSquaredDiff = this.mean(squaredDiffs);

    return Math.sqrt(avgSquaredDiff);
  }

  private calculateTrend(values: number[]): {
    direction: 'up' | 'down' | 'stable';
    slope: number;
    confidence: number;
  } {
    if (values.length < 2) return { direction: 'stable', slope: 0, confidence: 0 };

    // Simple linear regression
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = values;

    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = y.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
    const sumXX = x.reduce((sum, val) => sum + val * val, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate R-squared for confidence
    const yMean = this.mean(y);
    const ssTotal = y.reduce((sum, val) => sum + (val - yMean) ** 2, 0);
    const ssResidual = y.reduce((sum, val, i) => {
      const predicted = slope * x[i] + intercept;
      return sum + (val - predicted) ** 2;
    }, 0);

    const rSquared = 1 - ssResidual / ssTotal;
    const confidence = Math.max(0, Math.min(100, rSquared * 100));

    let direction: 'up' | 'down' | 'stable' = 'stable';
    if (Math.abs(slope) > 0.1 && confidence > 50) {
      direction = slope > 0 ? 'up' : 'down';
    }

    return {
      direction,
      slope: Math.round(slope * 100) / 100,
      confidence: Math.round(confidence),
    };
  }

  private getMaxKey(obj: Record<string | number, number>): string {
    return Object.entries(obj).reduce(
      (max, [key, value]) => (value > (obj[max] || 0) ? key : max),
      Object.keys(obj)[0] || '',
    );
  }
}
