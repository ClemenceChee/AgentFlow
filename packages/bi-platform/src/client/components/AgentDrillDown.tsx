import { useEffect } from 'react';
import { useAgentPerformance } from '../hooks/useAgentPerformance';
import { Sparkline } from './charts/Sparkline';

interface Props {
  agentId: string;
  onClose: () => void;
}

export function AgentDrillDown({ agentId, onClose }: Props) {
  const { data, loading, fetchAgent } = useAgentPerformance();

  useEffect(() => {
    fetchAgent(agentId);
  }, [agentId, fetchAgent]);

  return (
    <div className="bi-drill">
      <button className="bi-drill__close" onClick={onClose}>
        &times; Close
      </button>
      {loading && <div className="bi-loading">Loading agent details...</div>}
      {data && (
        <div>
          <h3 style={{ marginBottom: 'var(--s3)' }}>{data.agentName}</h3>
          <div className="bi-grid--3 bi-grid" style={{ marginBottom: 'var(--s3)' }}>
            <StatBox
              label="Success Rate"
              value={`${data.current.successRate.toFixed(1)}%`}
              color={data.current.successRate >= 90 ? 'var(--ok)' : 'var(--warn)'}
            />
            <StatBox
              label="Avg Response"
              value={`${data.current.avgResponseTimeMs.toFixed(0)}ms`}
            />
            <StatBox
              label="Total Executions"
              value={data.current.totalExecutions.toLocaleString()}
            />
          </div>

          {data.compliance.drifted && (
            <div className="badge badge--warn" style={{ marginBottom: 'var(--s3)' }}>
              Drift detected (score: {data.compliance.driftScore.toFixed(2)})
            </div>
          )}

          {data.compliance.alerts.length > 0 && (
            <div style={{ marginBottom: 'var(--s3)' }}>
              {data.compliance.alerts.map((a, i) => (
                <div
                  key={i}
                  className="badge badge--fail"
                  style={{ marginRight: 'var(--s2)', marginBottom: 'var(--s1)' }}
                >
                  {a}
                </div>
              ))}
            </div>
          )}

          {data.history.length > 0 && (
            <div>
              <div style={{ fontSize: 'var(--xs)', color: 'var(--t3)', marginBottom: 'var(--s2)' }}>
                Execution History
              </div>
              <Sparkline
                values={data.history.map((h) => h.executions)}
                color="var(--info)"
                width={300}
                height={40}
              />
              <table className="bi-table" style={{ marginTop: 'var(--s2)' }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Executions</th>
                    <th>Successful</th>
                    <th>Avg Duration</th>
                    <th>Error Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {data.history.slice(0, 10).map((h) => (
                    <tr key={h.date}>
                      <td>{h.date}</td>
                      <td>{h.executions.toLocaleString()}</td>
                      <td>{h.successful.toLocaleString()}</td>
                      <td>{h.avgDurationMs.toFixed(0)}ms</td>
                      <td style={{ color: h.errorRate > 10 ? 'var(--fail)' : 'var(--t2)' }}>
                        {h.errorRate.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ padding: 'var(--s2)' }}>
      <div style={{ fontSize: 'var(--xs)', color: 'var(--t3)' }}>{label}</div>
      <div
        style={{
          fontSize: 'var(--lg)',
          fontWeight: 700,
          fontFamily: 'var(--fm)',
          color: color || 'var(--t1)',
        }}
      >
        {value}
      </div>
    </div>
  );
}
