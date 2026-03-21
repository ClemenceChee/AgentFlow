import { useState } from 'react';
import type { GovernanceData } from '../hooks/useSomaGovernance';

function LayerBar({ layers }: { layers: GovernanceData['layers'] }) {
  const _total = layers.archive + layers.working + layers.emerging + layers.canon;
  const items = [
    { label: 'L1 Archive', count: layers.archive, color: '#8b949e' },
    { label: 'L2 Working', count: layers.working, color: '#d29922' },
    { label: 'L3 Emerging', count: layers.emerging, color: '#58a6ff' },
    { label: 'L4 Canon', count: layers.canon, color: '#3fb950' },
  ];

  return (
    <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 6,
            border: `1px solid ${item.color}33`,
            background: `${item.color}11`,
          }}
        >
          <div style={{ fontSize: 11, color: item.color, fontWeight: 600 }}>{item.label}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--t1)' }}>{item.count}</div>
        </div>
      ))}
    </div>
  );
}

function GovStats({ gov }: { gov: GovernanceData['governance'] }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 16, fontSize: 12 }}>
      <span style={{ color: '#58a6ff' }}>
        {'\u25CB'} {gov.pending} pending
      </span>
      <span style={{ color: '#3fb950' }}>
        {'\u2714'} {gov.promoted} promoted
      </span>
      <span style={{ color: '#f85149' }}>
        {'\u2718'} {gov.rejected} rejected
      </span>
    </div>
  );
}

export function SomaGovernance({
  data,
  onPromote,
  onReject,
}: {
  data: GovernanceData | null;
  onPromote: (id: string) => Promise<boolean>;
  onReject: (id: string, reason: string) => Promise<boolean>;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  if (!data) return <div className="workspace__empty">Loading governance data...</div>;
  if (!data.available)
    return <div className="workspace__empty">SOMA not configured. Set --soma-vault on server.</div>;

  return (
    <div style={{ padding: 16, maxWidth: 900 }}>
      <h3 style={{ margin: '0 0 12px', color: 'var(--t1)' }}>SOMA Governance</h3>

      <LayerBar layers={data.layers} />
      <GovStats gov={data.governance} />

      {/* Pending proposals */}
      {data.insights.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h4 style={{ color: '#58a6ff', margin: '0 0 8px', fontSize: 13 }}>
            Pending Proposals ({data.insights.length})
          </h4>
          {data.insights.map((ins, i) => {
            const id = ins.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const isExpanded = expandedId === id;
            const isRejecting = rejectingId === id;
            const score =
              ins.confidence_score != null ? `${(ins.confidence_score * 100).toFixed(0)}%` : '?';

            return (
              <div
                key={i}
                style={{
                  padding: '8px 12px',
                  marginBottom: 4,
                  borderRadius: 4,
                  background: 'var(--bg2)',
                  border: '1px solid var(--bd)',
                }}
              >
                {/* biome-ignore lint/a11y/useSemanticElements: interactive element with role+keyboard handlers */}
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedId(isExpanded ? null : id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setExpandedId(isExpanded ? null : id);
                  }}
                >
                  <span style={{ color: '#58a6ff', fontSize: 11, fontWeight: 600, minWidth: 36 }}>
                    {score}
                  </span>
                  <span style={{ flex: 1, color: 'var(--t1)', fontSize: 13 }}>{ins.title}</span>
                  <span style={{ fontSize: 10, color: 'var(--t3)' }}>{ins.type}</span>
                  <button
                    type="button"
                    style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      background: '#238636',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 3,
                      cursor: 'pointer',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPromote(id);
                    }}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      background: '#da3633',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 3,
                      cursor: 'pointer',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setRejectingId(isRejecting ? null : id);
                      setRejectReason('');
                    }}
                  >
                    Reject
                  </button>
                </div>

                {isExpanded && ins.claim && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--t2)', paddingLeft: 44 }}>
                    {ins.claim}
                  </div>
                )}

                {isRejecting && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 4, paddingLeft: 44 }}>
                    <input
                      type="text"
                      placeholder="Rejection reason..."
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '4px 8px',
                        fontSize: 12,
                        background: 'var(--bg3)',
                        border: '1px solid var(--bd)',
                        color: 'var(--t1)',
                        borderRadius: 3,
                      }}
                    />
                    <button
                      type="button"
                      style={{
                        fontSize: 11,
                        padding: '4px 8px',
                        background: '#da3633',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 3,
                        cursor: 'pointer',
                      }}
                      onClick={() => {
                        onReject(id, rejectReason);
                        setRejectingId(null);
                      }}
                    >
                      Confirm
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {data.insights.length === 0 && (
        <div style={{ color: 'var(--t3)', fontSize: 13, marginBottom: 24 }}>
          No pending proposals.
        </div>
      )}

      {/* Canon entries */}
      {data.canon.length > 0 && (
        <div>
          <h4 style={{ color: '#3fb950', margin: '0 0 8px', fontSize: 13 }}>
            Canon ({data.canon.length})
          </h4>
          {data.canon.map((c, i) => (
            <div
              key={i}
              style={{
                padding: '6px 12px',
                marginBottom: 4,
                borderRadius: 4,
                background: 'var(--bg2)',
                border: '1px solid #3fb95033',
                fontSize: 13,
                color: 'var(--t1)',
              }}
            >
              <strong>{c.title}</strong>
              {c.ratified_by && (
                <span style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 8 }}>
                  ratified by {c.ratified_by}
                </span>
              )}
              {c.claim && (
                <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 4 }}>{c.claim}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {data.generatedAt && (
        <div style={{ marginTop: 16, fontSize: 10, color: 'var(--t3)' }}>
          Data from {new Date(data.generatedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}
