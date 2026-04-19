import { useEffect, useMemo, useState } from 'react';
import { useSomaGovernance } from '../hooks/useSomaGovernance';
import { useSomaReport } from '../hooks/useSomaReport';
import type { SomaTier } from '../hooks/useSomaTier';
import { CrossAgentView } from './CrossAgentView';
import { DriftChart } from './DriftChart';
import { SomaActivityFeed } from './SomaActivityFeed';
import { SomaGovernance } from './SomaGovernance';
import { SomaIntelligence } from './SomaIntelligence';
import { SomaKnowledgeExplorer } from './SomaKnowledgeExplorer';
import { SomaPolicyEditor } from './SomaPolicyEditor';

export type SomaView = 'intelligence' | 'review' | 'policies' | 'knowledge' | 'activity';

const PAID_VIEWS: SomaView[] = ['review', 'policies', 'knowledge', 'activity'];

interface ViewDef {
  id: SomaView;
  label: string;
  shortcut: string;
}

const VIEWS: ViewDef[] = [
  { id: 'intelligence', label: 'Intelligence', shortcut: '1' },
  { id: 'review', label: 'Review', shortcut: '2' },
  { id: 'policies', label: 'Policies', shortcut: '3' },
  { id: 'knowledge', label: 'Knowledge', shortcut: '4' },
  { id: 'activity', label: 'Activity', shortcut: '5' },
];

interface Props {
  tier: SomaTier;
}

export function SomaPage({ tier }: Props) {
  const [activeView, setActiveView] = useState<SomaView>('intelligence');
  const report = useSomaReport();
  const somaGov = useSomaGovernance();

  const isPro = tier.tier === 'pro';

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const num = Number.parseInt(e.key, 10);
      if (num >= 1 && num <= VIEWS.length) {
        const view = VIEWS[num - 1].id;
        if (!PAID_VIEWS.includes(view) || isPro) {
          setActiveView(view);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isPro]);

  const somaKpis = useMemo(() => {
    const r = report.report;
    if (!r) return null;
    return {
      agents: r.agents?.length ?? 0,
      insights: r.insights?.length ?? r.intelligence?.length ?? 0,
      pendingProposals: somaGov.data?.proposals?.length ?? 0,
      canonEntries: r.canon?.length ?? 0,
    };
  }, [report.report, somaGov.data]);

  if (tier.tier === 'teaser') {
    return (
      <div className="soma-page">
        <header className="soma-page__header">
          <div className="soma-page__eyebrow">AGENTFLOW ADD-ON · PREVIEW</div>
          <div className="soma-page__title-row">
            <h1 className="soma-page__title">SOMA Intelligence</h1>
          </div>
          <p className="soma-page__subtitle">
            AgentFlow tells you what happened. SOMA tells you what it means.
          </p>
        </header>

        <div className="soma-page__hero">
          <div className="soma-page__hero-content">
            <h2 className="soma-page__hero-title">Turn traces into organizational knowledge</h2>
            <p className="soma-page__hero-body">
              Four-layer governance · adaptive guards · human-reviewed insights · zero LLM cost
            </p>
            <button type="button" className="btn btn--primary">
              Unlock preview access
            </button>
          </div>
        </div>

        <div className="soma-page__features">
          <div className="soma-page__feature-card">
            <div className="soma-page__feature-icon">{'\u25A0'}</div>
            <h3 className="soma-page__feature-title">Governance Layers</h3>
            <p className="soma-page__feature-body">
              Four-layer architecture: Archive, Working, Emerging, Canon. Machine proposals flow
              through human review.
            </p>
          </div>
          <div className="soma-page__feature-card">
            <div className="soma-page__feature-icon">{'\u25B3'}</div>
            <h3 className="soma-page__feature-title">Guard Policies</h3>
            <p className="soma-page__feature-body">
              Enforcement rules that shape agent behavior. Warn, block, or abort on learned
              patterns.
            </p>
          </div>
          <div className="soma-page__feature-card">
            <div className="soma-page__feature-icon">{'\u25C7'}</div>
            <h3 className="soma-page__feature-title">Knowledge Explorer</h3>
            <p className="soma-page__feature-body">
              Browse insights, decisions, constraints, contradictions — organized by layer and
              confidence.
            </p>
          </div>
        </div>

        <div className="card">
          <div className="card__header">
            <h3 className="card__title">GET STARTED</h3>
          </div>
          <div className="soma-page__cta">
            <p>
              Configure with <code>--soma-vault ~/.soma/vault</code> to activate SOMA.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="soma-page">
      <header className="soma-page__header">
        <div className="soma-page__eyebrow">AGENTFLOW ADD-ON · SOMA {isPro ? '{\u2728}' : ''}</div>
        <div className="soma-page__title-row">
          <h1 className="soma-page__title">Organizational intelligence</h1>
        </div>
        <p className="soma-page__subtitle">
          Four-layer governance · adaptive guards · human-reviewed insights · zero LLM cost
        </p>
      </header>

      {somaKpis && (
        <div className="kpi-row">
          <div className="kpi">
            <div className="kpi__label">AGENTS</div>
            <div className="kpi__value">{somaKpis.agents}</div>
          </div>
          <div className="kpi">
            <div className="kpi__label">INSIGHTS</div>
            <div className="kpi__value">{somaKpis.insights}</div>
          </div>
          <div className="kpi">
            <div className="kpi__label">PENDING REVIEW</div>
            <div
              className={`kpi__value ${somaKpis.pendingProposals > 0 ? 'kpi__value--warn' : ''}`}
            >
              {somaKpis.pendingProposals}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi__label">CANON ENTRIES</div>
            <div className="kpi__value">{somaKpis.canonEntries}</div>
          </div>
          <div className="kpi">
            <div className="kpi__label">TIER</div>
            <div className="kpi__value kpi__value--ok">PRO</div>
          </div>
          <div className="kpi">
            <div className="kpi__label">VAULT</div>
            <div className="kpi__value kpi__value--ok">READY</div>
          </div>
        </div>
      )}

      <div className="tabs" role="tablist">
        {VIEWS.map((v) => {
          const locked = PAID_VIEWS.includes(v.id) && !isPro;
          return (
            <button
              type="button"
              key={v.id}
              role="tab"
              aria-selected={activeView === v.id}
              className={`tabs__item ${activeView === v.id ? 'tabs__item--active' : ''} ${locked ? 'tabs__item--locked' : ''}`}
              onClick={() => !locked && setActiveView(v.id)}
              disabled={locked}
              title={locked ? 'Upgrade to SOMA Pro to unlock' : v.label}
            >
              <span className="tabs__label">
                {v.label} {locked && '\u{1F512}'}
              </span>
              <kbd className="tabs__shortcut">{v.shortcut}</kbd>
            </button>
          );
        })}
      </div>

      <div className="soma-page__content">
        {activeView === 'intelligence' && report.report && (
          <SomaIntelligence report={report.report} agentId="" />
        )}
        {activeView === 'intelligence' && !report.report && (
          <div className="loading-state">Loading intelligence{'\u2026'}</div>
        )}
        {activeView === 'review' && isPro && (
          <SomaGovernance
            data={somaGov.data}
            onPromote={somaGov.promote}
            onReject={somaGov.reject}
          />
        )}
        {activeView === 'policies' && isPro && <SomaPolicyEditor />}
        {activeView === 'knowledge' && isPro && <SomaKnowledgeExplorer />}
        {activeView === 'activity' && isPro && <SomaActivityFeed />}

        {activeView === 'intelligence' && isPro && report.report?.agents && (
          <div className="soma-page__drift-charts">
            {report.report.agents.slice(0, 3).map((agent: { name: string }) => (
              <DriftChart key={agent.name} apiBase="" agentId={agent.name} />
            ))}
          </div>
        )}

        {activeView === 'intelligence' && isPro && <CrossAgentView />}

        {PAID_VIEWS.includes(activeView) && !isPro && (
          <div className="empty-state">
            <p>This feature requires SOMA Pro.</p>
            <p>
              Run <code>soma watch</code> to start generating insights and policies.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
