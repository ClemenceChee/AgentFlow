import { useState } from 'react';
import { type AgentExecution, useAgentExecutions } from '../hooks/useAgentExecutions';
import {
  type GroupedIntelligence,
  type IntelligenceEntity,
  useAgentIntelligence,
} from '../hooks/useAgentIntelligence';

interface Props {
  agentId: string;
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'var(--ok)',
  medium: 'var(--warn)',
  low: 'var(--t3)',
};

const STATUS_COLORS: Record<string, string> = {
  completed: 'var(--ok)',
  failed: 'var(--fail)',
  running: 'var(--info)',
};

const TYPE_LABELS: Record<string, string> = {
  decisions: 'Decisions',
  insights: 'Insights',
  constraints: 'Constraints',
  policies: 'Policies',
  contradictions: 'Contradictions',
};

function EntityCard({ entity }: { entity: IntelligenceEntity }) {
  return (
    <div className="aicp-intelligence__entity">
      <div className="aicp-intelligence__entity-header">
        <span className="aicp-intelligence__entity-name">{entity.name}</span>
        {entity.confidence && (
          <span
            className="aicp-intelligence__confidence"
            style={{ color: CONFIDENCE_COLORS[entity.confidence] ?? 'var(--t3)' }}
          >
            {entity.confidence}
          </span>
        )}
      </div>
      {entity.claim && <div className="aicp-intelligence__claim">{entity.claim}</div>}
    </div>
  );
}

function ExecutionCard({ exec }: { exec: AgentExecution }) {
  const [expanded, setExpanded] = useState(false);
  const ts = new Date(exec.startTime).toLocaleString();
  const dur = exec.duration > 1000 ? `${(exec.duration / 1000).toFixed(1)}s` : `${exec.duration}ms`;
  const preview = exec.body && exec.body.length > 200 ? exec.body.slice(0, 200) + '…' : exec.body;

  return (
    <div className="aicp-intelligence__execution">
      <div
        className="aicp-intelligence__execution-header"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setExpanded(!expanded)}
      >
        <span
          className="aicp-intelligence__status-dot"
          style={{ background: STATUS_COLORS[exec.status] ?? 'var(--t3)' }}
        />
        <span className="aicp-intelligence__execution-ts">{ts}</span>
        <span className="aicp-intelligence__execution-dur">{dur}</span>
        <span className="aicp-intelligence__chevron">{expanded ? '▾' : '▸'}</span>
      </div>
      {expanded && exec.body ? (
        <pre className="aicp-intelligence__execution-body">{exec.body}</pre>
      ) : !expanded && preview ? (
        <div className="aicp-intelligence__execution-preview">{preview}</div>
      ) : null}
    </div>
  );
}

function IntelligenceSection({ grouped }: { grouped: GroupedIntelligence }) {
  const sections = (
    ['decisions', 'insights', 'constraints', 'policies', 'contradictions'] as const
  ).filter((key) => grouped[key].length > 0);

  if (sections.length === 0) {
    return <div className="aicp-intelligence__empty">No synthesized intelligence yet</div>;
  }

  return (
    <>
      {sections.map((key) => (
        <div key={key} className="aicp-intelligence__group">
          <div className="aicp-intelligence__group-header">
            <span className="aicp-intelligence__type-badge">{TYPE_LABELS[key]}</span>
            <span className="aicp-intelligence__count">{grouped[key].length}</span>
          </div>
          {grouped[key].slice(0, 5).map((entity) => (
            <EntityCard key={entity.id} entity={entity} />
          ))}
          {grouped[key].length > 5 && (
            <div className="aicp-intelligence__more">+{grouped[key].length - 5} more</div>
          )}
        </div>
      ))}
    </>
  );
}

export function IntelligencePanel({ agentId }: Props) {
  const intel = useAgentIntelligence(agentId);
  const execs = useAgentExecutions(agentId);

  if (intel.loading || execs.loading) {
    return (
      <div className="aicp-intelligence aicp-intelligence--loading">Loading intelligence…</div>
    );
  }

  if (intel.error || execs.error) {
    return (
      <div className="aicp-intelligence aicp-intelligence--error">
        Failed to load: {intel.error || execs.error}
      </div>
    );
  }

  return (
    <div className="aicp-intelligence">
      <div className="aicp-intelligence__section">
        <h4 className="aicp-intelligence__section-title">Synthesized Intelligence</h4>
        <IntelligenceSection grouped={intel.data} />
      </div>

      {execs.data.length > 0 && (
        <div className="aicp-intelligence__section">
          <h4 className="aicp-intelligence__section-title">Recent Executions</h4>
          {execs.data.map((exec) => (
            <ExecutionCard key={exec.id} exec={exec} />
          ))}
        </div>
      )}
    </div>
  );
}
