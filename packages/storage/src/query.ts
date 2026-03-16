import Database from 'better-sqlite3';

export interface QueryFilters {
    agentId?: string | string[];
    trigger?: string | string[];
    success?: boolean;
    since?: number | Date;
    until?: number | Date;
    minExecutionTime?: number;
    maxExecutionTime?: number;
    hasFailures?: boolean;
    limit?: number;
    offset?: number;
    orderBy?: 'timestamp' | 'executionTime' | 'agentId';
    orderDirection?: 'ASC' | 'DESC';
}

export interface AggregationOptions {
    groupBy?: 'agentId' | 'trigger' | 'hour' | 'day' | 'week';
    metrics?: ('count' | 'successRate' | 'avgExecutionTime' | 'totalTime')[];
    since?: number | Date;
    until?: number | Date;
}

export class QueryBuilder {
    constructor(private db: Database.Database) {}

    public findExecutions(filters: QueryFilters = {}): any[] {
        const { sql, params } = this.buildExecutionsQuery(filters);
        return this.db.prepare(sql).all(...params);
    }

    public findExecution(id: number): any | null {
        return this.db.prepare('SELECT * FROM executions WHERE id = ?').get(id);
    }

    public countExecutions(filters: Omit<QueryFilters, 'limit' | 'offset'> = {}): number {
        const { sql, params } = this.buildExecutionsQuery(filters, true);
        const result = this.db.prepare(sql).get(...params) as any;
        return result?.count || 0;
    }

    private buildExecutionsQuery(filters: QueryFilters, countOnly = false): { sql: string; params: any[] } {
        const params: any[] = [];
        const conditions: string[] = [];

        // Agent ID filter
        if (filters.agentId) {
            if (Array.isArray(filters.agentId)) {
                const placeholders = filters.agentId.map(() => '?').join(',');
                conditions.push(`agentId IN (${placeholders})`);
                params.push(...filters.agentId);
            } else {
                conditions.push('agentId = ?');
                params.push(filters.agentId);
            }
        }

        // Trigger filter
        if (filters.trigger) {
            if (Array.isArray(filters.trigger)) {
                const placeholders = filters.trigger.map(() => '?').join(',');
                conditions.push(`trigger IN (${placeholders})`);
                params.push(...filters.trigger);
            } else {
                conditions.push('trigger = ?');
                params.push(filters.trigger);
            }
        }

        // Success filter
        if (filters.success !== undefined) {
            conditions.push('success = ?');
            params.push(filters.success);
        }

        // Time range filters
        if (filters.since) {
            const timestamp = filters.since instanceof Date ? filters.since.getTime() : filters.since;
            conditions.push('timestamp >= ?');
            params.push(timestamp);
        }

        if (filters.until) {
            const timestamp = filters.until instanceof Date ? filters.until.getTime() : filters.until;
            conditions.push('timestamp <= ?');
            params.push(timestamp);
        }

        // Execution time filters
        if (filters.minExecutionTime !== undefined) {
            conditions.push('executionTime >= ?');
            params.push(filters.minExecutionTime);
        }

        if (filters.maxExecutionTime !== undefined) {
            conditions.push('executionTime <= ?');
            params.push(filters.maxExecutionTime);
        }

        // Failure filter
        if (filters.hasFailures !== undefined) {
            if (filters.hasFailures) {
                conditions.push('failureCount > 0');
            } else {
                conditions.push('(failureCount = 0 OR failureCount IS NULL)');
            }
        }

        // Build query
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        if (countOnly) {
            return {
                sql: `SELECT COUNT(*) as count FROM executions ${whereClause}`,
                params
            };
        }

        let sql = `SELECT * FROM executions ${whereClause}`;

        // Order by
        const orderBy = filters.orderBy || 'timestamp';
        const direction = filters.orderDirection || 'DESC';
        sql += ` ORDER BY ${orderBy} ${direction}`;

        // Limit and offset
        if (filters.limit) {
            sql += ' LIMIT ?';
            params.push(filters.limit);
        }

        if (filters.offset) {
            sql += ' OFFSET ?';
            params.push(filters.offset);
        }

        return { sql, params };
    }

    public aggregate(options: AggregationOptions): any[] {
        const metrics = options.metrics || ['count', 'successRate'];
        const groupBy = options.groupBy || 'agentId';

        const params: any[] = [];
        const conditions: string[] = [];

        // Time range
        if (options.since) {
            const timestamp = options.since instanceof Date ? options.since.getTime() : options.since;
            conditions.push('timestamp >= ?');
            params.push(timestamp);
        }

        if (options.until) {
            const timestamp = options.until instanceof Date ? options.until.getTime() : options.until;
            conditions.push('timestamp <= ?');
            params.push(timestamp);
        }

        // Build SELECT clause
        const selectClauses = [this.getGroupByClause(groupBy)];

        for (const metric of metrics) {
            selectClauses.push(this.getMetricClause(metric));
        }

        // Build query
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const groupByClause = `GROUP BY ${this.getGroupByColumn(groupBy)}`;

        const sql = `
            SELECT ${selectClauses.join(', ')}
            FROM executions
            ${whereClause}
            ${groupByClause}
            ORDER BY ${this.getGroupByColumn(groupBy)}
        `;

        return this.db.prepare(sql).all(...params);
    }

    private getGroupByClause(groupBy: string): string {
        switch (groupBy) {
            case 'agentId':
                return 'agentId';
            case 'trigger':
                return 'trigger';
            case 'hour':
                return 'strftime("%Y-%m-%d %H:00", datetime(timestamp/1000, "unixepoch")) as timeGroup';
            case 'day':
                return 'strftime("%Y-%m-%d", datetime(timestamp/1000, "unixepoch")) as timeGroup';
            case 'week':
                return 'strftime("%Y-W%W", datetime(timestamp/1000, "unixepoch")) as timeGroup';
            default:
                return 'agentId';
        }
    }

    private getGroupByColumn(groupBy: string): string {
        switch (groupBy) {
            case 'agentId':
                return 'agentId';
            case 'trigger':
                return 'trigger';
            case 'hour':
            case 'day':
            case 'week':
                return 'timeGroup';
            default:
                return 'agentId';
        }
    }

    private getMetricClause(metric: string): string {
        switch (metric) {
            case 'count':
                return 'COUNT(*) as count';
            case 'successRate':
                return 'ROUND(AVG(CAST(success as FLOAT)) * 100, 2) as successRate';
            case 'avgExecutionTime':
                return 'ROUND(AVG(executionTime), 2) as avgExecutionTime';
            case 'totalTime':
                return 'ROUND(SUM(executionTime), 2) as totalTime';
            default:
                return 'COUNT(*) as count';
        }
    }

    // Convenience methods for common queries
    public getAgentSummary(agentId: string, days = 7): any {
        const since = Date.now() - (days * 24 * 60 * 60 * 1000);

        const executions = this.findExecutions({
            agentId,
            since,
            orderBy: 'timestamp',
            orderDirection: 'DESC'
        });

        const total = executions.length;
        const successful = executions.filter(e => e.success).length;
        const failed = total - successful;
        const successRate = total > 0 ? (successful / total) * 100 : 0;

        const executionTimes = executions
            .filter(e => e.executionTime > 0)
            .map(e => e.executionTime);

        const avgExecutionTime = executionTimes.length > 0 ?
            executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length : 0;

        const recentActivity = this.aggregate({
            groupBy: 'day',
            metrics: ['count', 'successRate'],
            since,
            until: Date.now()
        });

        return {
            agentId,
            period: `${days} days`,
            summary: {
                total,
                successful,
                failed,
                successRate: Math.round(successRate * 100) / 100,
                avgExecutionTime: Math.round(avgExecutionTime * 100) / 100
            },
            recentActivity,
            latestExecution: executions[0] || null
        };
    }

    public getSystemOverview(days = 7): any {
        const since = Date.now() - (days * 24 * 60 * 60 * 1000);

        const totalExecutions = this.countExecutions({ since });
        const failedExecutions = this.countExecutions({ since, success: false });
        const globalSuccessRate = totalExecutions > 0 ?
            ((totalExecutions - failedExecutions) / totalExecutions) * 100 : 0;

        const agentStats = this.aggregate({
            groupBy: 'agentId',
            metrics: ['count', 'successRate', 'avgExecutionTime'],
            since
        });

        const dailyTrends = this.aggregate({
            groupBy: 'day',
            metrics: ['count', 'successRate', 'avgExecutionTime'],
            since
        });

        const triggerStats = this.aggregate({
            groupBy: 'trigger',
            metrics: ['count', 'successRate'],
            since
        });

        return {
            period: `${days} days`,
            overview: {
                totalExecutions,
                failedExecutions,
                globalSuccessRate: Math.round(globalSuccessRate * 100) / 100,
                totalAgents: agentStats.length
            },
            agentStats: agentStats.slice(0, 10), // Top 10 agents
            dailyTrends,
            triggerStats
        };
    }

    public getFailureAnalysis(agentId?: string, days = 7): any {
        const since = Date.now() - (days * 24 * 60 * 60 * 1000);

        const failures = this.findExecutions({
            agentId,
            success: false,
            since,
            orderBy: 'timestamp',
            orderDirection: 'DESC'
        });

        // Analyze failure patterns
        const failuresByTrigger = failures.reduce((acc, failure) => {
            acc[failure.trigger] = (acc[failure.trigger] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const recentFailures = failures.slice(0, 20);

        return {
            agentId: agentId || 'all',
            period: `${days} days`,
            summary: {
                totalFailures: failures.length,
                failuresByTrigger
            },
            recentFailures: recentFailures.map(f => ({
                id: f.id,
                agentId: f.agentId,
                trigger: f.trigger,
                timestamp: f.timestamp,
                executionTime: f.executionTime,
                failureCount: f.failureCount
            }))
        };
    }

    // Performance analysis
    public getPerformanceAnalysis(agentId?: string, days = 7): any {
        const since = Date.now() - (days * 24 * 60 * 60 * 1000);

        const executions = this.findExecutions({
            agentId,
            since,
            orderBy: 'executionTime',
            orderDirection: 'DESC'
        }).filter(e => e.executionTime > 0);

        if (executions.length === 0) {
            return { error: 'No execution time data available' };
        }

        const times = executions.map(e => e.executionTime);
        times.sort((a, b) => a - b);

        const p50 = this.percentile(times, 0.5);
        const p90 = this.percentile(times, 0.9);
        const p99 = this.percentile(times, 0.99);

        const slowest = executions.slice(0, 10);

        return {
            agentId: agentId || 'all',
            period: `${days} days`,
            statistics: {
                totalSamples: times.length,
                min: Math.min(...times),
                max: Math.max(...times),
                avg: times.reduce((sum, time) => sum + time, 0) / times.length,
                p50,
                p90,
                p99
            },
            slowestExecutions: slowest.map(e => ({
                id: e.id,
                agentId: e.agentId,
                trigger: e.trigger,
                timestamp: e.timestamp,
                executionTime: e.executionTime
            }))
        };
    }

    private percentile(sortedArray: number[], p: number): number {
        const index = p * (sortedArray.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);

        if (lower === upper) {
            return sortedArray[lower];
        }

        const weight = index - lower;
        return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
    }
}