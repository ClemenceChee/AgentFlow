import { useMemo, useState } from 'react';
import { useSomaGovernance } from '../../../hooks/useSomaGovernance';
import { useSomaReport } from '../../../hooks/useSomaReport';
import type { SomaTier } from '../../../hooks/useSomaTier';
import { Badge, type BadgeKind, Card, Kpi } from '../atoms';

type View = 'intelligence' | 'review' | 'policies' | 'knowledge' | 'activity';

interface ViewDef {
  id: View;
  label: string;
  kbd?: string;
}

const VIEWS: ViewDef[] = [
  { id: 'intelligence', label: 'Intelligence' },
  { id: 'review', label: 'Review' },
  { id: 'policies', label: 'Policies' },
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'activity', label: 'Activity' },
];

const LAYER_COLORS: Record<string, string> = {
  Canon: 'var(--accent)',
  Emerging: 'var(--info)',
  Working: 'var(--warn)',
  Archive: 'var(--t-3)',
};

function layerBadge(layer: string): BadgeKind {
  if (layer === 'Canon') return 'accent';
  if (layer === 'Emerging') return 'info';
  if (layer === 'Working' || layer === 'Archive') return 'warn';
  return 'neutral';
}

function EmptyState({ message, hint }: { message: string; hint?: string }) {
  return (
    <div
      style={{
        padding: 'var(--s-8)',
        textAlign: 'center',
        color: 'var(--t-3)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--fs-12)',
      }}
    >
      <div>{message}</div>
      {hint && (
        <div style={{ marginTop: 'var(--s-3)', fontSize: 'var(--fs-11)', color: 'var(--t-3)' }}>
          {hint}
        </div>
      )}
    </div>
  );
}

export function SomaPage({ tier }: { tier: SomaTier }) {
  const [view, setView] = useState<View>('intelligence');
  const { report } = useSomaReport();
  const governance = useSomaGovernance();

  const counts = useMemo(() => {
    if (!report) return null;
    const r = report as unknown as {
      agents?: Array<unknown>;
      insights?: Array<unknown>;
      intelligence?: Array<unknown>;
      canon?: Array<unknown>;
    };
    const insights = r.insights?.length ?? r.intelligence?.length ?? 0;
    return {
      agents: r.agents?.length ?? 0,
      insights,
      canon: r.canon?.length ?? 0,
    };
  }, [report]);

  const pending = governance.data?.proposals?.length ?? 0;

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <div className="page__eyebrow">
            AgentFlow add-on {'\u00B7'} SOMA {tier.tier === 'pro' && '\u2726'}
          </div>
          <div className="page__title">Organizational intelligence</div>
          <div className="page__subtitle">
            Four-layer governance {'\u00B7'} adaptive guards {'\u00B7'} human-reviewed insights
          </div>
        </div>
        <div className="page__head-actions">
          <span className="topbar__tier is-active">
            <strong>{tier.tier.toUpperCase()}</strong> {'\u00B7'}{' '}
            {tier.somaVault ? 'vault synced' : 'vault offline'}
          </span>
          <button type="button" className="v2-btn v2-btn--sm">
            Open vault
          </button>
        </div>
      </div>

      <div className="v2-tabs" role="tablist">
        {VIEWS.map((v) => (
          <button
            type="button"
            key={v.id}
            className={`v2-tabs__tab ${view === v.id ? 'is-active' : ''}`}
            onClick={() => setView(v.id)}
            role="tab"
            aria-selected={view === v.id}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="page__body">
        {view === 'intelligence' && (
          <>
            <div className="v2-kpi-row">
              <Kpi label="Agents" value={counts?.agents ?? '\u2014'} />
              <Kpi label="Insights" value={counts?.insights ?? '\u2014'} />
              <Kpi label="Canon entries" value={counts?.canon ?? '\u2014'} />
              <Kpi
                label="Pending review"
                value={pending}
                sparkColor={pending > 0 ? 'var(--warn)' : 'var(--ok)'}
              />
              <Kpi label="Tier" value={tier.tier.toUpperCase()} />
              <Kpi
                label="Vault"
                value={tier.somaVault ? 'ready' : 'offline'}
                sparkColor={tier.somaVault ? 'var(--ok)' : 'var(--warn)'}
              />
            </div>

            {!report && (
              <Card title="Intelligence report">
                <EmptyState
                  message="No SOMA report yet."
                  hint="Run the pipeline (soma watch) to generate organizational intelligence."
                />
              </Card>
            )}

            {report && (
              <div className="v2-grid v2-grid-2-1">
                <Card title="Knowledge layers" sub="counts by layer">
                  <LayerStack
                    layers={[
                      {
                        name: 'Canon',
                        count: counts?.canon ?? 0,
                        desc: 'Ratified truth',
                      },
                      {
                        name: 'Emerging',
                        count: pending,
                        desc: 'Candidates under review',
                      },
                      {
                        name: 'Working',
                        count: counts?.insights ?? 0,
                        desc: 'Active operational notes',
                      },
                      {
                        name: 'Archive',
                        count: 0,
                        desc: 'Historical / cold',
                      },
                    ]}
                  />
                </Card>
                <Card title="Top insights">
                  <EmptyState message="No high-confidence insights available yet." />
                </Card>
              </div>
            )}
          </>
        )}

        {view === 'review' && (
          <>
            <div className="v2-kpi-row">
              <Kpi label="Pending" value={pending} />
              <Kpi label="Promoted (7d)" value={'\u2014'} />
              <Kpi label="Rejected (7d)" value={'\u2014'} />
              <Kpi label="Reviewers" value={'\u2014'} />
            </div>
            <Card title="Review queue" flush>
              {governance.data?.proposals?.length ? (
                <table className="v2-tbl">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Layer</th>
                      <th>Title</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {governance.data.proposals.map((p) => {
                      const id = (p as { id?: string }).id ?? '\u2014';
                      const layer = (p as { layer?: string }).layer ?? 'Emerging';
                      const title =
                        (p as { title?: string }).title ??
                        (p as { claim?: string }).claim ??
                        '\u2014';
                      return (
                        <tr key={id}>
                          <td className="mono">{id}</td>
                          <td>
                            <Badge kind={layerBadge(layer)}>{layer}</Badge>
                          </td>
                          <td>{title}</td>
                          <td>
                            <button type="button" className="v2-btn v2-btn--sm">
                              review
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <EmptyState
                  message="No proposals waiting for review."
                  hint="Proposals appear here when the synthesizer surfaces candidates."
                />
              )}
            </Card>
          </>
        )}

        {view === 'policies' && (
          <>
            <div className="v2-kpi-row">
              <Kpi label="Active policies" value={'\u2014'} />
              <Kpi label="Fires \u00B7 24h" value={'\u2014'} />
              <Kpi label="Violations" value={'\u2014'} />
              <Kpi label="Blocks" value={'\u2014'} />
            </div>
            <Card
              title="Policies"
              flush
              actions={
                <button type="button" className="v2-btn v2-btn--primary v2-btn--sm">
                  + new
                </button>
              }
            >
              <EmptyState
                message="No policies configured."
                hint="Promote insights to Canon to create enforceable policies."
              />
            </Card>
          </>
        )}

        {view === 'knowledge' && (
          <div className="v2-grid v2-grid-1-2">
            <Card title="Layers" flush>
              <LayerStack
                layers={[
                  {
                    name: 'Canon',
                    count: counts?.canon ?? 0,
                    desc: 'Ratified truth',
                  },
                  {
                    name: 'Emerging',
                    count: pending,
                    desc: 'Candidates under review',
                  },
                  {
                    name: 'Working',
                    count: counts?.insights ?? 0,
                    desc: 'Active operational notes',
                  },
                  {
                    name: 'Archive',
                    count: 0,
                    desc: 'Historical / cold',
                  },
                ]}
                listOnly
              />
            </Card>
            <Card title="Memories" flush>
              <EmptyState message="Memory browser arrives when the vault is populated." />
            </Card>
          </div>
        )}

        {view === 'activity' && (
          <Card title="Activity stream" flush>
            <EmptyState
              message="No activity recorded yet."
              hint="Activity flows here from the Harvester/Reconciler/Synthesizer/Cartographer workers."
            />
          </Card>
        )}
      </div>
    </div>
  );
}

interface LayerRow {
  name: string;
  count: number;
  desc: string;
}

function LayerStack({ layers, listOnly = false }: { layers: LayerRow[]; listOnly?: boolean }) {
  const total = Math.max(
    1,
    layers.reduce((s, l) => s + l.count, 0),
  );
  return (
    <div style={{ display: 'grid', gap: 8, padding: listOnly ? 0 : 'var(--s-5)' }}>
      {!listOnly && (
        <div
          style={{
            display: 'flex',
            height: 14,
            borderRadius: 3,
            overflow: 'hidden',
            border: '1px solid var(--bd)',
          }}
        >
          {layers.map((l) => (
            <div
              key={l.name}
              style={{
                width: `${(l.count / total) * 100}%`,
                background: LAYER_COLORS[l.name] ?? 'var(--t-3)',
              }}
              title={`${l.name} \u00B7 ${l.count}`}
            />
          ))}
        </div>
      )}
      <div style={{ display: 'grid', gap: 6 }}>
        {layers.map((l) => (
          <div
            key={l.name}
            style={{
              display: 'grid',
              gridTemplateColumns: '14px 100px 60px 1fr',
              gap: 10,
              alignItems: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--fs-12)',
              padding: listOnly ? '10px 16px' : 0,
              borderBottom: listOnly ? '1px solid var(--bd-weak)' : 'none',
            }}
          >
            <span
              style={{
                width: 12,
                height: 12,
                background: LAYER_COLORS[l.name] ?? 'var(--t-3)',
                borderRadius: 2,
              }}
            />
            <span style={{ fontWeight: 600 }}>{l.name}</span>
            <span
              className="num"
              style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
            >
              {l.count.toLocaleString()}
            </span>
            <span style={{ color: 'var(--t-3)', fontSize: 'var(--fs-11)' }}>{l.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
