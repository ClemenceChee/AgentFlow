/**
 * Natural language query processing and translation engine.
 *
 * Tasks: 4.2 (NL processing), 4.3 (optimization), 4.4 (result interpretation),
 *        4.5 (role-based filtering), 4.7 (follow-up), 4.8 (formatting),
 *        4.9 (insights), 4.10 (monitoring)
 */

import type { UserRole } from '../auth/types.js';
import type { CacheClient } from '../cache/cache.js';
import type { DbPool } from '../db/pool.js';
import type { TerminologyMapper } from './terminology.js';

export interface QueryRequest {
  question: string;
  userId: string;
  userRole: UserRole;
  context?: QueryContext;
}

export interface QueryContext {
  previousQuestions?: string[];
  selectedAgent?: string;
  selectedPeriod?: string;
}

export interface QueryResult {
  answer: string;
  data: unknown;
  interpretation: string;
  insights: string[];
  suggestedFollowUps: string[];
  metadata: {
    queryType: string;
    dataSource: string;
    confidence: number;
    executionTimeMs: number;
    cached: boolean;
  };
}

export interface TranslatedQuery {
  sql: string;
  params: unknown[];
  source: string;
  queryType: string;
  confidence: number;
}

/** Patterns the translator can recognize. */
const QUERY_PATTERNS: Array<{
  pattern: RegExp;
  type: string;
  handler: string;
}> = [
  {
    pattern: /how\s+(are|is)\s+(.+)\s+performing/i,
    type: 'agent_performance',
    handler: 'agentPerformance',
  },
  { pattern: /what('s| is)\s+the\s+roi/i, type: 'roi_analysis', handler: 'roiAnalysis' },
  { pattern: /are\s+we\s+compliant/i, type: 'compliance_check', handler: 'complianceCheck' },
  { pattern: /show\s+(me\s+)?violations/i, type: 'violations', handler: 'violations' },
  {
    pattern: /what('s| is)\s+the\s+(failure|error)\s+rate/i,
    type: 'failure_rate',
    handler: 'failureRate',
  },
  {
    pattern: /how\s+much\s+(does|do|is|are)\s+(.+)\s+cost/i,
    type: 'cost_analysis',
    handler: 'costAnalysis',
  },
  { pattern: /top\s+(\d+)\s+agents/i, type: 'top_agents', handler: 'topAgents' },
  { pattern: /worst\s+performing/i, type: 'worst_agents', handler: 'worstAgents' },
  { pattern: /anomal(y|ies)/i, type: 'anomalies', handler: 'anomalies' },
  { pattern: /trend|trending/i, type: 'trend_analysis', handler: 'trendAnalysis' },
];

/** Role-based data access restrictions. */
const ROLE_ACCESS: Record<UserRole, string[]> = {
  executive: [
    'agent_performance',
    'roi_analysis',
    'compliance_check',
    'top_agents',
    'worst_agents',
    'trend_analysis',
    'cost_analysis',
    'anomalies',
    'violations',
    'failure_rate',
  ],
  manager: [
    'agent_performance',
    'roi_analysis',
    'compliance_check',
    'top_agents',
    'worst_agents',
    'trend_analysis',
    'cost_analysis',
    'anomalies',
    'violations',
    'failure_rate',
  ],
  analyst: [
    'agent_performance',
    'compliance_check',
    'top_agents',
    'worst_agents',
    'trend_analysis',
    'anomalies',
    'failure_rate',
  ],
  viewer: ['agent_performance', 'compliance_check', 'top_agents'],
  admin: [
    'agent_performance',
    'roi_analysis',
    'compliance_check',
    'top_agents',
    'worst_agents',
    'trend_analysis',
    'cost_analysis',
    'anomalies',
    'violations',
    'failure_rate',
  ],
};

export class QueryTranslator {
  constructor(
    _terminology: TerminologyMapper,
    private db: DbPool,
    private cache: CacheClient,
  ) {}

  /** Process a natural language business question. */
  async processQuery(request: QueryRequest): Promise<QueryResult> {
    const start = Date.now();
    const { question, userRole } = request;

    // Check cache
    const cacheKey = `query:${question.toLowerCase().trim()}:${userRole}`;
    const cached = await this.cache.get<QueryResult>(cacheKey);
    if (cached) {
      cached.metadata.cached = true;
      return cached;
    }

    // Match pattern
    const matched = this.matchPattern(question);
    if (!matched) {
      return {
        answer:
          "I couldn't understand that question. Try asking about agent performance, ROI, compliance, costs, or anomalies.",
        data: null,
        interpretation: 'Unrecognized query pattern',
        insights: [],
        suggestedFollowUps: [
          'How are our agents performing this month?',
          "What's the ROI of our support agents?",
          'Are we compliant with GDPR?',
          'Show me active violations',
        ],
        metadata: {
          queryType: 'unknown',
          dataSource: 'none',
          confidence: 0,
          executionTimeMs: Date.now() - start,
          cached: false,
        },
      };
    }

    // Check role access
    const allowedTypes = ROLE_ACCESS[userRole] ?? [];
    if (!allowedTypes.includes(matched.type)) {
      return {
        answer: `Your role (${userRole}) does not have access to ${matched.type.replace(/_/g, ' ')} data.`,
        data: null,
        interpretation: 'Access restricted by role',
        insights: [],
        suggestedFollowUps: [],
        metadata: {
          queryType: matched.type,
          dataSource: 'rbac',
          confidence: 1,
          executionTimeMs: Date.now() - start,
          cached: false,
        },
      };
    }

    // Execute query handler
    const translated = await this.translateToSql(matched, request);
    const { rows } = await this.db.query(translated.sql, translated.params);

    // Interpret and format results
    const result = this.formatResult(matched.type, rows, question, request);
    result.metadata = {
      queryType: matched.type,
      dataSource: translated.source,
      confidence: translated.confidence,
      executionTimeMs: Date.now() - start,
      cached: false,
    };

    await this.cache.set(cacheKey, result, 30);
    return result;
  }

  private matchPattern(
    question: string,
  ): { type: string; handler: string; match: RegExpMatchArray } | null {
    for (const p of QUERY_PATTERNS) {
      const match = question.match(p.pattern);
      if (match) return { type: p.type, handler: p.handler, match };
    }
    return null;
  }

  private async translateToSql(
    matched: { type: string; handler: string; match: RegExpMatchArray },
    _request: QueryRequest,
  ): Promise<TranslatedQuery> {
    const handlers: Record<string, () => TranslatedQuery> = {
      agentPerformance: () => ({
        sql: `SELECT agent_id, agent_name, SUM(total_executions) AS executions,
              AVG(error_rate) AS error_rate, AVG(avg_duration_ms) AS avg_duration
              FROM agent_metrics WHERE period_start > NOW() - INTERVAL '30 days'
              GROUP BY agent_id, agent_name ORDER BY executions DESC LIMIT 20`,
        params: [],
        source: 'agent_metrics',
        queryType: 'agent_performance',
        confidence: 0.85,
      }),
      roiAnalysis: () => ({
        sql: `SELECT category, SUM(amount) AS total, currency
              FROM financial_metrics WHERE period_start > NOW() - INTERVAL '30 days'
              GROUP BY category, currency`,
        params: [],
        source: 'financial_metrics',
        queryType: 'roi_analysis',
        confidence: 0.9,
      }),
      complianceCheck: () => ({
        sql: `SELECT regulation, COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status = 'compliant') AS compliant,
              COUNT(*) FILTER (WHERE status = 'violation') AS violations
              FROM compliance_records WHERE detected_at > NOW() - INTERVAL '90 days'
              GROUP BY regulation`,
        params: [],
        source: 'compliance_records',
        queryType: 'compliance_check',
        confidence: 0.9,
      }),
      violations: () => ({
        sql: `SELECT regulation, agent_id, severity, description, detected_at
              FROM compliance_records WHERE status = 'violation' AND resolved_at IS NULL
              ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END LIMIT 20`,
        params: [],
        source: 'compliance_records',
        queryType: 'violations',
        confidence: 0.95,
      }),
      failureRate: () => ({
        sql: `SELECT agent_id, agent_name, AVG(error_rate) AS avg_error_rate, SUM(failed) AS total_failures
              FROM agent_metrics WHERE period_start > NOW() - INTERVAL '30 days'
              GROUP BY agent_id, agent_name ORDER BY avg_error_rate DESC LIMIT 10`,
        params: [],
        source: 'agent_metrics',
        queryType: 'failure_rate',
        confidence: 0.9,
      }),
      costAnalysis: () => ({
        sql: `SELECT agent_id, SUM(amount) AS total_cost, currency
              FROM financial_metrics WHERE category = 'agent_cost' AND period_start > NOW() - INTERVAL '30 days'
              GROUP BY agent_id, currency ORDER BY total_cost DESC`,
        params: [],
        source: 'financial_metrics',
        queryType: 'cost_analysis',
        confidence: 0.85,
      }),
      topAgents: () => ({
        sql: `SELECT agent_id, agent_name, SUM(successful) AS successes, AVG(avg_duration_ms) AS avg_duration
              FROM agent_metrics WHERE period_start > NOW() - INTERVAL '30 days'
              GROUP BY agent_id, agent_name ORDER BY successes DESC LIMIT 10`,
        params: [],
        source: 'agent_metrics',
        queryType: 'top_agents',
        confidence: 0.9,
      }),
      worstAgents: () => ({
        sql: `SELECT agent_id, agent_name, AVG(error_rate) AS avg_error_rate, SUM(failed) AS total_failures
              FROM agent_metrics WHERE period_start > NOW() - INTERVAL '30 days'
              GROUP BY agent_id, agent_name HAVING SUM(total_executions) > 0
              ORDER BY avg_error_rate DESC LIMIT 10`,
        params: [],
        source: 'agent_metrics',
        queryType: 'worst_agents',
        confidence: 0.9,
      }),
      anomalies: () => ({
        sql: `SELECT source_system, metric_name, severity, description, deviation_pct, detected_at
              FROM anomalies WHERE acknowledged = false
              ORDER BY detected_at DESC LIMIT 20`,
        params: [],
        source: 'anomalies',
        queryType: 'anomalies',
        confidence: 0.95,
      }),
      trendAnalysis: () => ({
        sql: `SELECT DATE(period_start) AS day, SUM(total_executions) AS executions,
              AVG(error_rate) AS error_rate, AVG(avg_duration_ms) AS avg_duration
              FROM agent_metrics WHERE period_start > NOW() - INTERVAL '30 days'
              GROUP BY DATE(period_start) ORDER BY day`,
        params: [],
        source: 'agent_metrics',
        queryType: 'trend_analysis',
        confidence: 0.8,
      }),
    };

    const handler = handlers[matched.handler];
    if (!handler) {
      return { sql: 'SELECT 1', params: [], source: 'none', queryType: 'unknown', confidence: 0 };
    }
    return handler();
  }

  private formatResult(
    queryType: string,
    rows: Record<string, unknown>[],
    _question: string,
    _request: QueryRequest,
  ): QueryResult {
    const insights: string[] = [];
    const followUps: string[] = [];
    let answer: string;
    let interpretation: string;

    if (rows.length === 0) {
      answer = 'No data found for this query in the current period.';
      interpretation = `Query type: ${queryType}, no results`;
      followUps.push('Try expanding the time period', 'Check data freshness status');
    } else {
      interpretation = `Found ${rows.length} result(s) for ${queryType.replace(/_/g, ' ')}`;

      switch (queryType) {
        case 'agent_performance':
          answer = `Found ${rows.length} agent(s) with activity in the last 30 days.`;
          followUps.push(
            'Which agent has the highest failure rate?',
            "What's the cost breakdown by agent?",
          );
          break;
        case 'roi_analysis':
          answer = `Financial breakdown across ${rows.length} categor${rows.length === 1 ? 'y' : 'ies'}.`;
          followUps.push('Which agents generate the most revenue?', 'Show cost trends over time');
          break;
        case 'compliance_check':
          answer = `Compliance status across ${rows.length} regulation(s).`;
          followUps.push('Show me active violations', 'Which agents have compliance issues?');
          break;
        default:
          answer = `Here are the results for your query about ${queryType.replace(/_/g, ' ')}.`;
      }

      // Generate basic insights from data
      if (queryType === 'agent_performance' && rows.length > 0) {
        const highError = rows.filter((r) => Number(r.error_rate ?? 0) > 0.1);
        if (highError.length > 0) {
          insights.push(
            `${highError.length} agent(s) have error rates above 10% — consider investigation`,
          );
        }
      }
    }

    return {
      answer,
      data: rows,
      interpretation,
      insights,
      suggestedFollowUps: followUps,
      metadata: { queryType, dataSource: '', confidence: 0, executionTimeMs: 0, cached: false },
    };
  }
}
