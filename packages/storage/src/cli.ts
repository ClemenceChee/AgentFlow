import { AgentFlowStorage } from './storage.js';
import * as path from 'path';

export async function startCLI() {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || command === '--help') {
        printHelp();
        return;
    }

    const dbPath = getDbPath(args);

    try {
        switch (command) {
            case 'query':
                await handleQuery(dbPath, args.slice(1));
                break;
            case 'ingest':
                await handleIngest(dbPath, args.slice(1));
                break;
            case 'stats':
                await handleStats(dbPath, args.slice(1));
                break;
            case 'analyze':
                await handleAnalyze(dbPath, args.slice(1));
                break;
            case 'export':
                await handleExport(dbPath, args.slice(1));
                break;
            case 'cleanup':
                await handleCleanup(dbPath, args.slice(1));
                break;
            default:
                console.error(`Unknown command: ${command}`);
                printHelp();
                process.exit(1);
        }
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

function getDbPath(args: string[]): string {
    const dbIndex = args.findIndex(arg => arg === '--db');
    return dbIndex >= 0 && args[dbIndex + 1] ?
        args[dbIndex + 1] :
        './agentflow.db';
}

async function handleQuery(dbPath: string, args: string[]) {
    const storage = new AgentFlowStorage({ dbPath });

    const agentId = getArgValue(args, '--agent');
    const trigger = getArgValue(args, '--trigger');
    const since = getArgValue(args, '--since');
    const limit = parseInt(getArgValue(args, '--limit') || '50');
    const success = getArgValue(args, '--success');

    const filters: any = { limit };

    if (agentId) filters.agentId = agentId;
    if (trigger) filters.trigger = trigger;
    if (since) filters.since = new Date(since).getTime();
    if (success !== null) filters.success = success === 'true';

    const executions = storage.getExecutions(filters);

    console.log(`\\n📊 Query Results (${executions.length} executions):`);
    console.log('=' * 50);

    for (const execution of executions) {
        const timestamp = new Date(execution.timestamp).toLocaleString();
        const status = execution.success ? '✅' : '❌';
        const time = execution.executionTime ? `${execution.executionTime}ms` : 'N/A';

        console.log(`${status} ${execution.agentId} [${execution.trigger}] - ${timestamp} (${time})`);
    }

    storage.close();
}

async function handleIngest(dbPath: string, args: string[]) {
    const tracesDir = getArgValue(args, '--traces') || './traces';

    const storage = new AgentFlowStorage({
        dbPath,
        tracesDir,
        autoIngest: true
    });

    console.log(`🔄 Starting ingestion from: ${tracesDir}`);
    console.log('Press Ctrl+C to stop...');

    // Keep process alive
    process.on('SIGINT', () => {
        console.log('\\n⏹️  Stopping ingestion...');
        storage.close();
        process.exit(0);
    });

    // Show periodic stats
    setInterval(() => {
        const agents = storage.getAgents();
        console.log(`📈 Active agents: ${agents.length}`);
    }, 30000);

    // Keep alive
    await new Promise(() => {}); // Wait indefinitely
}

async function handleStats(dbPath: string, args: string[]) {
    const storage = new AgentFlowStorage({ dbPath });
    const agentId = getArgValue(args, '--agent');
    const days = parseInt(getArgValue(args, '--days') || '7');

    if (agentId) {
        // Agent-specific stats
        const summary = storage.query().getAgentSummary(agentId, days);

        console.log(`\\n📊 Agent Statistics: ${agentId}`);
        console.log('=' * 50);
        console.log(`Period: ${summary.period}`);
        console.log(`Total Executions: ${summary.summary.total}`);
        console.log(`Successful: ${summary.summary.successful} (${summary.summary.successRate}%)`);
        console.log(`Failed: ${summary.summary.failed}`);
        console.log(`Avg Execution Time: ${summary.summary.avgExecutionTime}ms`);

        if (summary.latestExecution) {
            const latest = new Date(summary.latestExecution.timestamp).toLocaleString();
            console.log(`Latest Execution: ${latest}`);
        }

        console.log('\\n📈 Recent Activity:');
        for (const activity of summary.recentActivity.slice(0, 7)) {
            console.log(`  ${activity.timeGroup}: ${activity.count} executions (${activity.successRate}% success)`);
        }
    } else {
        // System overview
        const overview = storage.query().getSystemOverview(days);

        console.log(`\\n📊 System Overview`);
        console.log('=' * 50);
        console.log(`Period: ${overview.period}`);
        console.log(`Total Executions: ${overview.overview.totalExecutions.toLocaleString()}`);
        console.log(`Failed Executions: ${overview.overview.failedExecutions.toLocaleString()}`);
        console.log(`Global Success Rate: ${overview.overview.globalSuccessRate}%`);
        console.log(`Total Agents: ${overview.overview.totalAgents}`);

        console.log('\\n🏆 Top Agents:');
        for (const agent of overview.agentStats.slice(0, 5)) {
            console.log(`  ${agent.agentId}: ${agent.count} executions (${agent.successRate}% success)`);
        }

        console.log('\\n🎯 Triggers:');
        for (const trigger of overview.triggerStats.slice(0, 5)) {
            console.log(`  ${trigger.trigger}: ${trigger.count} executions (${trigger.successRate}% success)`);
        }
    }

    storage.close();
}

async function handleAnalyze(dbPath: string, args: string[]) {
    const storage = new AgentFlowStorage({ dbPath });
    const analytics = storage.getAnalytics();

    const agentId = getArgValue(args, '--agent');
    const type = getArgValue(args, '--type') || 'health';
    const days = parseInt(getArgValue(args, '--days') || '7');

    console.log(`\\n🔍 Analysis: ${type.toUpperCase()}`);
    console.log('=' * 50);

    switch (type) {
        case 'health':
            if (agentId) {
                const score = analytics.getHealthScore(agentId, days);
                console.log(`Health Score for ${agentId}: ${score}/100`);

                if (score >= 90) console.log('🟢 Excellent health');
                else if (score >= 70) console.log('🟡 Good health');
                else if (score >= 50) console.log('🟠 Moderate health');
                else console.log('🔴 Poor health');
            } else {
                const agents = storage.getAgents();
                console.log('Agent Health Scores:');
                for (const agent of agents.slice(0, 10)) {
                    const score = analytics.getHealthScore(agent.agentId, days);
                    const indicator = score >= 70 ? '🟢' : score >= 50 ? '🟡' : '🔴';
                    console.log(`  ${indicator} ${agent.agentId}: ${score}/100`);
                }
            }
            break;

        case 'anomalies':
            if (!agentId) {
                console.error('Agent ID required for anomaly detection (--agent)');
                process.exit(1);
            }

            const anomalies = analytics.detectAnomalies(agentId, days);
            if (anomalies.length === 0) {
                console.log(`✅ No anomalies detected for ${agentId}`);
            } else {
                console.log(`⚠️  Found ${anomalies.length} anomalies for ${agentId}:`);
                for (const anomaly of anomalies) {
                    const severity = anomaly.severity === 'high' ? '🔴' : '🟡';
                    console.log(`  ${severity} ${anomaly.type} at ${anomaly.hour}: ${anomaly.description}`);
                    console.log(`     Value: ${anomaly.value}, Expected: ~${anomaly.expected}`);
                }
            }
            break;

        case 'trends':
            const trends = analytics.getTrends(agentId, days);
            if (trends.error) {
                console.log(trends.error);
            } else {
                console.log(`📈 Trends (${trends.period}):`);
                console.log(`  Execution Volume: ${trends.trends.executionVolume.direction} (${trends.trends.executionVolume.slope})`);
                console.log(`  Execution Time: ${trends.trends.executionTime.direction} (${trends.trends.executionTime.slope})`);
                console.log(`  Success Rate: ${trends.trends.successRate.direction} (${trends.trends.successRate.slope})`);
            }
            break;

        case 'failures':
            const failures = analytics.getFailurePatterns(days);
            console.log(`❌ Failure Patterns (${failures.period}):`);
            console.log(`  Total Failures: ${failures.summary.totalFailures}`);
            console.log(`  Affected Agents: ${failures.summary.affectedAgents}`);
            console.log(`  Most Failed Agent: ${failures.summary.mostFailedAgent}`);
            console.log(`  Most Failed Trigger: ${failures.summary.mostFailedTrigger}`);
            console.log(`  Peak Failure Hour: ${failures.summary.peakFailureHour}:00`);
            break;

        default:
            console.error(`Unknown analysis type: ${type}`);
            console.log('Available types: health, anomalies, trends, failures');
    }

    storage.close();
}

async function handleExport(dbPath: string, args: string[]) {
    const storage = new AgentFlowStorage({ dbPath });

    const format = getArgValue(args, '--format') || 'json';
    const output = getArgValue(args, '--output') || `export-${Date.now()}.${format}`;
    const agentId = getArgValue(args, '--agent');
    const since = getArgValue(args, '--since');
    const limit = parseInt(getArgValue(args, '--limit') || '1000');

    const filters: any = { limit };
    if (agentId) filters.agentId = agentId;
    if (since) filters.since = new Date(since).getTime();

    console.log('📤 Exporting data...');

    const data = storage.export(format as any, filters);

    const fs = await import('fs');
    fs.writeFileSync(output, data);

    console.log(`✅ Exported to ${output} (${data.length} bytes)`);

    storage.close();
}

async function handleCleanup(dbPath: string, args: string[]) {
    const storage = new AgentFlowStorage({ dbPath });

    const days = parseInt(getArgValue(args, '--days') || '30');
    const dryRun = args.includes('--dry-run');

    console.log(`🧹 ${dryRun ? 'Simulating' : 'Running'} cleanup (retention: ${days} days)`);

    if (!dryRun) {
        const removed = storage.cleanup(days);
        console.log(`✅ Cleaned up ${removed} old records`);

        console.log('📦 Optimizing database...');
        storage.vacuum();
        console.log('✅ Database optimized');
    } else {
        const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
        const toRemove = storage.getExecutions({
            until: cutoff
        }).length;
        console.log(`Would remove ${toRemove} old records`);
    }

    storage.close();
}

function getArgValue(args: string[], flag: string): string | null {
    const index = args.findIndex(arg => arg === flag);
    return index >= 0 && args[index + 1] ? args[index + 1] : null;
}

function printHelp() {
    console.log(`
🗃️  AgentFlow Storage CLI - Manage and query agent execution data

Usage:
  agentflow-query <command> [options]

Commands:
  query     Query execution records
  ingest    Start live ingestion from traces directory
  stats     Show statistics and summaries
  analyze   Run advanced analytics
  export    Export data to files
  cleanup   Clean up old records

Global Options:
  --db <path>       Database file path (default: ./agentflow.db)

Query Options:
  --agent <id>      Filter by agent ID
  --trigger <name>  Filter by trigger type
  --since <date>    Filter since date (ISO format)
  --success <bool>  Filter by success status (true/false)
  --limit <num>     Limit results (default: 50)

Ingest Options:
  --traces <dir>    Traces directory to watch (default: ./traces)

Stats Options:
  --agent <id>      Show stats for specific agent
  --days <num>      Time period in days (default: 7)

Analyze Options:
  --agent <id>      Analyze specific agent
  --type <type>     Analysis type: health, anomalies, trends, failures
  --days <num>      Time period in days (default: 7)

Export Options:
  --format <fmt>    Output format: json, csv (default: json)
  --output <file>   Output file path
  --agent <id>      Filter by agent ID
  --since <date>    Filter since date
  --limit <num>     Limit results (default: 1000)

Cleanup Options:
  --days <num>      Retention period in days (default: 30)
  --dry-run         Simulate cleanup without making changes

Examples:
  agentflow-query query --agent my-agent --limit 100
  agentflow-query stats --days 30
  agentflow-query analyze --type health --agent my-agent
  agentflow-query ingest --traces ./agent-logs
  agentflow-query export --format csv --agent my-agent --output data.csv
  agentflow-query cleanup --days 7 --dry-run

Visit: https://github.com/ClemenceChee/AgentFlow
`);
}