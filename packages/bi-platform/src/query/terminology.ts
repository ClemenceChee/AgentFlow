/**
 * Business terminology to technical query mapping system.
 *
 * Tasks: 4.1 (terminology mapping), 4.6 (ambiguity resolution)
 */

export interface TermMapping {
  businessTerm: string;
  technicalField: string;
  system: 'soma' | 'agentflow' | 'opsintel' | 'bi';
  table?: string;
  description: string;
  aliases: string[];
}

export interface ResolvedTerm {
  field: string;
  system: string;
  table?: string;
  confidence: number;
  alternatives?: TermMapping[];
}

/** Core terminology mappings — extensible via configuration. */
const TERM_MAPPINGS: TermMapping[] = [
  // Performance metrics
  {
    businessTerm: 'success rate',
    technicalField: 'successful::float / NULLIF(total_executions, 0)',
    system: 'bi',
    table: 'agent_metrics',
    description: 'Ratio of successful to total executions',
    aliases: ['completion rate', 'pass rate'],
  },
  {
    businessTerm: 'failure rate',
    technicalField: 'error_rate',
    system: 'bi',
    table: 'agent_metrics',
    description: 'Ratio of failed to total executions',
    aliases: ['error rate', 'failure ratio'],
  },
  {
    businessTerm: 'response time',
    technicalField: 'avg_duration_ms',
    system: 'bi',
    table: 'agent_metrics',
    description: 'Average execution duration in milliseconds',
    aliases: ['latency', 'duration', 'processing time'],
  },
  {
    businessTerm: 'executions',
    technicalField: 'total_executions',
    system: 'bi',
    table: 'agent_metrics',
    description: 'Total number of agent executions',
    aliases: ['runs', 'invocations', 'calls'],
  },

  // Financial
  {
    businessTerm: 'cost',
    technicalField: 'amount',
    system: 'bi',
    table: 'financial_metrics',
    description: 'Monetary cost of agent operations',
    aliases: ['spend', 'expense', 'price'],
  },
  {
    businessTerm: 'roi',
    technicalField: '(revenue - cost) / cost * 100',
    system: 'bi',
    table: 'financial_metrics',
    description: 'Return on investment percentage',
    aliases: ['return on investment', 'return'],
  },
  {
    businessTerm: 'revenue impact',
    technicalField: 'amount',
    system: 'bi',
    table: 'financial_metrics',
    description: 'Revenue attributed to agent operations',
    aliases: ['revenue', 'income'],
  },

  // Compliance
  {
    businessTerm: 'compliance score',
    technicalField: 'compliance_pct',
    system: 'bi',
    table: 'compliance_records',
    description: 'Percentage of compliant records',
    aliases: ['compliance rate', 'compliance percentage'],
  },
  {
    businessTerm: 'violations',
    technicalField: "status = 'violation'",
    system: 'bi',
    table: 'compliance_records',
    description: 'Active compliance violations',
    aliases: ['breaches', 'non-compliance', 'infractions'],
  },

  // SOMA
  {
    businessTerm: 'insights',
    technicalField: 'insights',
    system: 'soma',
    description: 'Knowledge insights from organizational intelligence',
    aliases: ['findings', 'observations', 'intelligence'],
  },
  {
    businessTerm: 'policies',
    technicalField: 'policies',
    system: 'soma',
    description: 'Active policies governing agent behavior',
    aliases: ['rules', 'guidelines', 'controls'],
  },
  {
    businessTerm: 'drift',
    technicalField: 'drifted',
    system: 'opsintel',
    description: 'Behavioral drift from established patterns',
    aliases: ['deviation', 'divergence'],
  },

  // Time periods
  {
    businessTerm: 'this month',
    technicalField: "period_start >= DATE_TRUNC('month', NOW())",
    system: 'bi',
    description: 'Current calendar month',
    aliases: ['current month'],
  },
  {
    businessTerm: 'last quarter',
    technicalField:
      "period_start >= DATE_TRUNC('quarter', NOW()) - INTERVAL '3 months' AND period_start < DATE_TRUNC('quarter', NOW())",
    system: 'bi',
    description: 'Previous calendar quarter',
    aliases: ['prior quarter', 'previous quarter'],
  },
  {
    businessTerm: 'last 30 days',
    technicalField: "period_start > NOW() - INTERVAL '30 days'",
    system: 'bi',
    description: 'Rolling 30-day window',
    aliases: ['past month', 'recent'],
  },
];

export class TerminologyMapper {
  private mappings: TermMapping[];

  constructor(customMappings?: TermMapping[]) {
    this.mappings = [...TERM_MAPPINGS, ...(customMappings ?? [])];
  }

  /** Resolve a business term to its technical equivalent. */
  resolve(term: string): ResolvedTerm | null {
    const normalized = term.toLowerCase().trim();

    // Exact match
    const exact = this.mappings.find(
      (m) => m.businessTerm === normalized || m.aliases.includes(normalized),
    );
    if (exact) {
      return {
        field: exact.technicalField,
        system: exact.system,
        table: exact.table,
        confidence: 1.0,
      };
    }

    // Fuzzy match — find mappings containing the term or vice versa
    const fuzzy = this.mappings.filter(
      (m) =>
        m.businessTerm.includes(normalized) ||
        normalized.includes(m.businessTerm) ||
        m.aliases.some((a) => a.includes(normalized) || normalized.includes(a)),
    );

    if (fuzzy.length === 1) {
      return {
        field: fuzzy[0].technicalField,
        system: fuzzy[0].system,
        table: fuzzy[0].table,
        confidence: 0.7,
      };
    }

    if (fuzzy.length > 1) {
      return {
        field: fuzzy[0].technicalField,
        system: fuzzy[0].system,
        table: fuzzy[0].table,
        confidence: 0.5,
        alternatives: fuzzy,
      };
    }

    return null;
  }

  /** Get all available business terms. */
  getAvailableTerms(): Array<{ term: string; description: string; aliases: string[] }> {
    return this.mappings.map((m) => ({
      term: m.businessTerm,
      description: m.description,
      aliases: m.aliases,
    }));
  }
}
