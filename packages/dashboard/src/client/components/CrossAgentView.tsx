/**
 * Cross-Agent Knowledge Flow — shows which agents' data contributed
 * to which SOMA recommendations.
 */

import { useEffect, useState } from 'react';

interface CrossAgentInsight {
  name: string;
  claim: string;
  sourceAgents: string[];
  tags: string[];
}

interface AgentPair {
  agents: string;
  count: number;
  insights: CrossAgentInsight[];
}

interface CrossAgentData {
  total: number;
  pairs: AgentPair[];
}

export function CrossAgentView() {
  const [data, setData] = useState<CrossAgentData | null>(null);

  useEffect(() => {
    fetch('/api/soma/cross-agent')
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data || data.total === 0) return null;

  return (
    <div className="cross-agent">
      <h4>Cross-Agent Knowledge Flow</h4>
      <p className="cross-agent__summary">
        {data.total} insights connect {data.pairs.length} agent pairs
      </p>

      {data.pairs.map((pair) => (
        <div key={pair.agents} className="cross-agent__pair">
          <div className="cross-agent__pair-header">
            <strong>{pair.agents}</strong>
            <span className="cross-agent__pair-count">{pair.count} insights</span>
          </div>
          {pair.insights.map((insight, i) => (
            <div key={i} className="cross-agent__insight">
              <div className="cross-agent__insight-name">{insight.name}</div>
              {insight.claim && <div className="cross-agent__insight-claim">{insight.claim}</div>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
