import { useState } from 'react';
import { useSomaGovernance } from '../hooks/useSomaGovernance';
import { useSomaReport } from '../hooks/useSomaReport';
import type { SomaTier } from '../hooks/useSomaTier';
import { DriftChart } from './DriftChart';
import { SomaActivityFeed } from './SomaActivityFeed';
import { SomaGovernance } from './SomaGovernance';
import { SomaIntelligence } from './SomaIntelligence';
import { SomaKnowledgeExplorer } from './SomaKnowledgeExplorer';
import { SomaPolicyEditor } from './SomaPolicyEditor';

export type SomaView = 'intelligence' | 'review' | 'policies' | 'knowledge' | 'activity';

const PAID_VIEWS: SomaView[] = ['review', 'policies', 'knowledge', 'activity'];

const VIEW_LABELS: Record<SomaView, { icon: string; label: string }> = {
  intelligence: { icon: '\u{1F9E0}', label: 'Intelligence' },
  review: { icon: '\u{1F3DB}', label: 'Review' },
  policies: { icon: '\u{1F6E1}', label: 'Policies' },
  knowledge: { icon: '\u{1F4DA}', label: 'Knowledge' },
  activity: { icon: '\u{1F4E1}', label: 'Activity' },
};

interface Props {
  tier: SomaTier;
}

export function SomaPage({ tier }: Props) {
  const [activeView, setActiveView] = useState<SomaView>('intelligence');
  const report = useSomaReport();
  const somaGov = useSomaGovernance();

  // Teaser mode — no vault configured
  if (tier.tier === 'teaser') {
    return (
      <div className="soma-page">
        <div className="soma-page__teaser">
          <div className="soma-page__teaser-icon">{'\u{1F9E0}'}</div>
          <h2>SOMA Intelligence</h2>
          <p>Turn your agent traces into organizational knowledge.</p>
          <div className="soma-page__teaser-features">
            <div className="soma-page__teaser-card">
              <strong>Governance Layers</strong>
              <p>
                Four-layer knowledge architecture: Archive, Working, Emerging, Canon.
                Machine-proposed insights flow through human review before becoming organizational
                truth.
              </p>
            </div>
            <div className="soma-page__teaser-card">
              <strong>Guard Policies</strong>
              <p>
                Define enforcement rules that shape agent behavior. Warn, block, or abort based on
                learned patterns.
              </p>
            </div>
            <div className="soma-page__teaser-card">
              <strong>Knowledge Explorer</strong>
              <p>
                Browse everything SOMA has learned — insights, decisions, constraints,
                contradictions — organized by layer and confidence.
              </p>
            </div>
          </div>
          <p className="soma-page__teaser-cta">
            Configure with <code>--soma-vault ~/.soma/vault</code> to get started.
          </p>
        </div>
      </div>
    );
  }

  const isPro = tier.tier === 'pro';

  return (
    <div className="soma-page">
      <div className="soma-page__tabs">
        {(Object.entries(VIEW_LABELS) as [SomaView, { icon: string; label: string }][]).map(
          ([view, { icon, label }]) => {
            const locked = PAID_VIEWS.includes(view) && !isPro;
            return (
              <button
                type="button"
                key={view}
                className={`soma-page__tab ${activeView === view ? 'soma-page__tab--active' : ''} ${locked ? 'soma-page__tab--locked' : ''}`}
                onClick={() => !locked && setActiveView(view)}
                title={locked ? 'Configure SOMA governance to unlock' : label}
              >
                {icon} {label} {locked && '\u{1F512}'}
              </button>
            );
          },
        )}
      </div>

      <div className="soma-page__content">
        {activeView === 'intelligence' && report.report && (
          <SomaIntelligence report={report.report} agentId="" />
        )}
        {activeView === 'intelligence' && !report.report && (
          <div className="soma-page__loading">Loading intelligence data...</div>
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

        {/* Drift chart (pro tier, shown on intelligence view) */}
        {activeView === 'intelligence' && isPro && report.report?.agents && (
          <div style={{ padding: '0 16px 16px' }}>
            {report.report.agents.slice(0, 3).map((agent: { name: string }) => (
              <DriftChart key={agent.name} apiBase="" agentId={agent.name} />
            ))}
          </div>
        )}

        {PAID_VIEWS.includes(activeView) && !isPro && (
          <div className="soma-page__locked">
            <div className="soma-page__locked-icon">{'\u{1F512}'}</div>
            <h3>{VIEW_LABELS[activeView].label}</h3>
            <p>
              This feature requires SOMA governance data. Run <code>soma watch</code> to start
              generating insights and policies.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
