import Database from 'better-sqlite3';
import { TraceIngester } from './ingester.js';
import { QueryBuilder } from './query.js';
import { StorageAnalytics } from './analytics.js';

export interface ExecutionTrace {
    id?: number;
    agentId: string;
    trigger: string;
    name: string;
    timestamp: number;
    success: boolean;
    executionTime?: number;
    nodeCount?: number;
    failureCount?: number;
    metadata?: string; // JSON string
    traceData?: string; // JSON string of full trace
    filename?: string;
    createdAt?: number;
}

export interface StorageConfig {
    dbPath: string;
    tracesDir?: string;
    autoIngest?: boolean;
    retentionDays?: number;
}

export class AgentFlowStorage {
    private db: Database.Database;
    private ingester?: TraceIngester;
    private analytics: StorageAnalytics;

    constructor(private config: StorageConfig) {
        this.db = new Database(config.dbPath);
        this.setupDatabase();
        this.analytics = new StorageAnalytics(this.db);

        if (config.autoIngest && config.tracesDir) {
            this.ingester = new TraceIngester(config.tracesDir, this);
        }
    }

    private setupDatabase() {
        // Create tables
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS executions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agentId TEXT NOT NULL,
                trigger TEXT NOT NULL,
                name TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                success BOOLEAN NOT NULL,
                executionTime REAL,
                nodeCount INTEGER,
                failureCount INTEGER,
                metadata TEXT, -- JSON
                traceData TEXT, -- JSON
                filename TEXT,
                createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
                UNIQUE(filename) ON CONFLICT REPLACE
            );

            CREATE INDEX IF NOT EXISTS idx_executions_agent ON executions(agentId);
            CREATE INDEX IF NOT EXISTS idx_executions_timestamp ON executions(timestamp);
            CREATE INDEX IF NOT EXISTS idx_executions_success ON executions(success);
            CREATE INDEX IF NOT EXISTS idx_executions_trigger ON executions(trigger);
            CREATE INDEX IF NOT EXISTS idx_executions_created ON executions(createdAt);

            CREATE TABLE IF NOT EXISTS agents (
                agentId TEXT PRIMARY KEY,
                firstSeen INTEGER NOT NULL,
                lastSeen INTEGER NOT NULL,
                totalExecutions INTEGER DEFAULT 0,
                successfulExecutions INTEGER DEFAULT 0,
                failedExecutions INTEGER DEFAULT 0,
                avgExecutionTime REAL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS daily_stats (
                date TEXT NOT NULL, -- YYYY-MM-DD
                agentId TEXT NOT NULL,
                totalExecutions INTEGER DEFAULT 0,
                successfulExecutions INTEGER DEFAULT 0,
                failedExecutions INTEGER DEFAULT 0,
                avgExecutionTime REAL DEFAULT 0,
                PRIMARY KEY(date, agentId)
            );

            CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date);
        `);

        // Prepare statements for better performance
        this.insertExecution = this.db.prepare(`
            INSERT OR REPLACE INTO executions (
                agentId, trigger, name, timestamp, success, executionTime,
                nodeCount, failureCount, metadata, traceData, filename
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        this.updateAgentStats = this.db.prepare(`
            INSERT OR REPLACE INTO agents (
                agentId, firstSeen, lastSeen, totalExecutions,
                successfulExecutions, failedExecutions, avgExecutionTime
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        this.updateDailyStats = this.db.prepare(`
            INSERT OR REPLACE INTO daily_stats (
                date, agentId, totalExecutions, successfulExecutions,
                failedExecutions, avgExecutionTime
            ) VALUES (?, ?, ?, ?, ?, ?)
        `);
    }

    private insertExecution!: Database.Statement;
    private updateAgentStats!: Database.Statement;
    private updateDailyStats!: Database.Statement;

    public async ingestTrace(trace: any): Promise<void> {
        const transaction = this.db.transaction(() => {
            // Analyze trace for metrics
            const analysis = this.analyzeTrace(trace);

            // Insert execution record
            this.insertExecution.run(
                trace.agentId,
                trace.trigger || 'unknown',
                trace.name || `${trace.agentId} execution`,
                trace.timestamp,
                analysis.success,
                analysis.executionTime,
                analysis.nodeCount,
                analysis.failureCount,
                JSON.stringify(trace.metadata || {}),
                JSON.stringify(trace),
                trace.filename
            );

            // Update agent statistics
            this.updateAgentStatistics(trace.agentId, analysis);

            // Update daily statistics
            this.updateDailyStatistics(trace.agentId, trace.timestamp, analysis);
        });

        transaction();
    }

    private analyzeTrace(trace: any): {
        success: boolean;
        executionTime: number;
        nodeCount: number;
        failureCount: number;
    } {
        try {
            // Import AgentFlow functions for analysis
            const { getStats, getFailures } = require('../../core/dist/index.js');

            const stats = getStats(trace);
            const failures = getFailures(trace);

            return {
                success: failures.length === 0,
                executionTime: stats.totalTime || 0,
                nodeCount: stats.totalNodes || 0,
                failureCount: failures.length
            };
        } catch (error) {
            // Fallback analysis
            const nodes = this.extractNodes(trace);
            const failures = nodes.filter(node => this.isFailedNode(node));

            return {
                success: failures.length === 0,
                executionTime: this.estimateExecutionTime(nodes),
                nodeCount: nodes.length,
                failureCount: failures.length
            };
        }
    }

    private extractNodes(trace: any): any[] {
        if (Array.isArray(trace.nodes)) {
            return trace.nodes.map(([, node]: [string, any]) => node);
        }
        if (trace.nodes instanceof Map) {
            return Array.from(trace.nodes.values());
        }
        if (typeof trace.nodes === 'object') {
            return Object.values(trace.nodes);
        }
        return [];
    }

    private isFailedNode(node: any): boolean {
        return node.status === 'failed' ||
               !!node.error ||
               (node.metadata && node.metadata.error);
    }

    private estimateExecutionTime(nodes: any[]): number {
        if (nodes.length === 0) return 0;

        const times = nodes
            .filter(node => node.startTime && node.endTime)
            .map(node => node.endTime - node.startTime);

        return times.length > 0 ? Math.max(...times) : 0;
    }

    private updateAgentStatistics(agentId: string, analysis: any) {
        const existing = this.db.prepare('SELECT * FROM agents WHERE agentId = ?').get(agentId) as any;

        if (existing) {
            const newTotal = existing.totalExecutions + 1;
            const newSuccessful = existing.successfulExecutions + (analysis.success ? 1 : 0);
            const newFailed = existing.failedExecutions + (analysis.success ? 0 : 1);

            // Calculate new average execution time
            let newAvgTime = existing.avgExecutionTime;
            if (analysis.executionTime > 0) {
                newAvgTime = ((existing.avgExecutionTime * existing.totalExecutions) + analysis.executionTime) / newTotal;
            }

            this.updateAgentStats.run(
                agentId,
                existing.firstSeen,
                Date.now(),
                newTotal,
                newSuccessful,
                newFailed,
                newAvgTime
            );
        } else {
            this.updateAgentStats.run(
                agentId,
                Date.now(),
                Date.now(),
                1,
                analysis.success ? 1 : 0,
                analysis.success ? 0 : 1,
                analysis.executionTime || 0
            );
        }
    }

    private updateDailyStatistics(agentId: string, timestamp: number, analysis: any) {
        const date = new Date(timestamp).toISOString().split('T')[0];
        const existing = this.db.prepare(
            'SELECT * FROM daily_stats WHERE date = ? AND agentId = ?'
        ).get(date, agentId) as any;

        if (existing) {
            const newTotal = existing.totalExecutions + 1;
            const newSuccessful = existing.successfulExecutions + (analysis.success ? 1 : 0);
            const newFailed = existing.failedExecutions + (analysis.success ? 0 : 1);

            let newAvgTime = existing.avgExecutionTime;
            if (analysis.executionTime > 0) {
                newAvgTime = ((existing.avgExecutionTime * existing.totalExecutions) + analysis.executionTime) / newTotal;
            }

            this.updateDailyStats.run(date, agentId, newTotal, newSuccessful, newFailed, newAvgTime);
        } else {
            this.updateDailyStats.run(
                date,
                agentId,
                1,
                analysis.success ? 1 : 0,
                analysis.success ? 0 : 1,
                analysis.executionTime || 0
            );
        }
    }

    public query(): QueryBuilder {
        return new QueryBuilder(this.db);
    }

    public getAnalytics(): StorageAnalytics {
        return this.analytics;
    }

    public getExecutions(filters: {
        agentId?: string;
        since?: number;
        until?: number;
        success?: boolean;
        limit?: number;
        offset?: number;
    } = {}): ExecutionTrace[] {
        let sql = 'SELECT * FROM executions WHERE 1=1';
        const params: any[] = [];

        if (filters.agentId) {
            sql += ' AND agentId = ?';
            params.push(filters.agentId);
        }

        if (filters.since) {
            sql += ' AND timestamp >= ?';
            params.push(filters.since);
        }

        if (filters.until) {
            sql += ' AND timestamp <= ?';
            params.push(filters.until);
        }

        if (filters.success !== undefined) {
            sql += ' AND success = ?';
            params.push(filters.success);
        }

        sql += ' ORDER BY timestamp DESC';

        if (filters.limit) {
            sql += ' LIMIT ?';
            params.push(filters.limit);
        }

        if (filters.offset) {
            sql += ' OFFSET ?';
            params.push(filters.offset);
        }

        return this.db.prepare(sql).all(...params) as ExecutionTrace[];
    }

    public getAgents(): any[] {
        return this.db.prepare('SELECT * FROM agents ORDER BY lastSeen DESC').all();
    }

    public getDailyStats(agentId?: string, days: number = 30): any[] {
        const cutoff = new Date(Date.now() - (days * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];

        if (agentId) {
            return this.db.prepare(
                'SELECT * FROM daily_stats WHERE agentId = ? AND date >= ? ORDER BY date DESC'
            ).all(agentId, cutoff);
        } else {
            return this.db.prepare(
                'SELECT date, SUM(totalExecutions) as totalExecutions, SUM(successfulExecutions) as successfulExecutions, SUM(failedExecutions) as failedExecutions, AVG(avgExecutionTime) as avgExecutionTime FROM daily_stats WHERE date >= ? GROUP BY date ORDER BY date DESC'
            ).all(cutoff);
        }
    }

    public cleanup(retentionDays: number = 30): number {
        const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

        const result = this.db.prepare('DELETE FROM executions WHERE timestamp < ?').run(cutoff);
        console.log(`Cleaned up ${result.changes} old execution records`);

        // Clean up agents with no recent executions
        this.db.prepare('DELETE FROM agents WHERE lastSeen < ?').run(cutoff);

        // Clean up old daily stats
        const dateCutoff = new Date(cutoff).toISOString().split('T')[0];
        this.db.prepare('DELETE FROM daily_stats WHERE date < ?').run(dateCutoff);

        return result.changes || 0;
    }

    public close() {
        if (this.ingester) {
            this.ingester.stop();
        }
        this.db.close();
    }

    public vacuum() {
        this.db.exec('VACUUM');
    }

    // Export data for external analysis
    public export(format: 'json' | 'csv' = 'json', filters: any = {}): string {
        const executions = this.getExecutions(filters);

        if (format === 'csv') {
            const headers = 'agentId,trigger,timestamp,success,executionTime,nodeCount,failureCount\\n';
            const rows = executions.map(ex =>
                `${ex.agentId},${ex.trigger},${ex.timestamp},${ex.success},${ex.executionTime || 0},${ex.nodeCount || 0},${ex.failureCount || 0}`
            ).join('\\n');
            return headers + rows;
        }

        return JSON.stringify(executions, null, 2);
    }
}