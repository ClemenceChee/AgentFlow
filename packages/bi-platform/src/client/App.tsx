import { useEffect, useMemo, useState } from 'react';
import { AlertBanner } from './components/AlertBanner';
import { ComplianceDashboard } from './components/ComplianceDashboard';
import { DecisionsDashboard } from './components/DecisionsDashboard';
import { ExecutiveDashboard } from './components/ExecutiveDashboard';
import { Header } from './components/Header';
import { HelpPanel } from './components/HelpPanel';
import { OperationalDashboard } from './components/OperationalDashboard';
import { StatusBar } from './components/StatusBar';
import { useAgents } from './hooks/useAgents';
import { useAnomalies } from './hooks/useAnomalies';
import { useCompliance } from './hooks/useCompliance';
import { useComplianceRisks } from './hooks/useComplianceRisks';
import { useCosts } from './hooks/useCosts';
import { useCronHealth } from './hooks/useCronHealth';
import { useDecisionAlerts } from './hooks/useDecisionAlerts';
import { useDecisionPatterns } from './hooks/useDecisionPatterns';
import { useDecisionRecommendations } from './hooks/useDecisionRecommendations';
import { useDecisionRoi } from './hooks/useDecisionRoi';
import { useFreshness } from './hooks/useFreshness';
import { useKnowledgeHealth } from './hooks/useKnowledgeHealth';
import { useKpis } from './hooks/useKpis';
import { useRoi } from './hooks/useRoi';
import { useTokenEconomics } from './hooks/useTokenEconomics';

declare const __APP_VERSION__: string;

export type Page = 'executive' | 'operational' | 'compliance' | 'decisions';

export function App() {
  const [page, setPage] = useState<Page>(() => {
    return (localStorage.getItem('bi-page') as Page) || 'executive';
  });
  const [showHelp, setShowHelp] = useState(false);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '1') switchPage('executive');
      else if (e.key === '2') switchPage('operational');
      else if (e.key === '3') switchPage('compliance');
      else if (e.key === '4') switchPage('decisions');
      else if (e.key === '?' && !e.ctrlKey) setShowHelp(true);
      else if (e.key === 'Escape') setShowHelp(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [switchPage]);

  const kpis = useKpis();
  const agents = useAgents();
  const anomalies = useAnomalies();
  const compliance = useCompliance();
  const freshness = useFreshness();
  const roi = useRoi();
  const costs = useCosts();
  const tokenEconomics = useTokenEconomics();
  const cronHealth = useCronHealth();
  const knowledgeHealth = useKnowledgeHealth();
  const decisionRecs = useDecisionRecommendations();
  const decisionPatterns = useDecisionPatterns();
  const decisionRoi = useDecisionRoi();
  const decisionRisks = useComplianceRisks();
  const decisionAlerts = useDecisionAlerts();

  const criticalAnomalies = useMemo(
    () =>
      (anomalies?.anomalies ?? []).filter(
        (a) => !a.acknowledged && (a.severity === 'critical' || a.severity === 'high'),
      ),
    [anomalies],
  );

  const switchPage = (p: Page) => {
    setPage(p);
    localStorage.setItem('bi-page', p);
  };

  return (
    <div className="bi">
      <Header
        page={page}
        onPageChange={switchPage}
        version={typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.1.0'}
        onHelp={() => setShowHelp(true)}
      />
      {criticalAnomalies.length > 0 && <AlertBanner anomalies={criticalAnomalies} />}
      <main className="bi-main">
        {page === 'executive' && (
          <ExecutiveDashboard
            kpis={kpis}
            agents={agents}
            anomalies={anomalies}
            roi={roi}
            freshness={freshness}
            tokenEconomics={tokenEconomics}
            knowledgeHealth={knowledgeHealth}
            cronHealth={cronHealth}
          />
        )}
        {page === 'operational' && (
          <OperationalDashboard
            agents={agents}
            costs={costs}
            anomalies={anomalies}
            freshness={freshness}
            tokenEconomics={tokenEconomics}
            cronHealth={cronHealth}
          />
        )}
        {page === 'compliance' && (
          <ComplianceDashboard compliance={compliance} anomalies={anomalies} />
        )}
        {page === 'decisions' && (
          <DecisionsDashboard
            recommendations={decisionRecs}
            patterns={decisionPatterns}
            roi={decisionRoi}
            complianceRisks={decisionRisks}
            alerts={decisionAlerts}
          />
        )}
      </main>
      <StatusBar freshness={freshness} agents={agents} />
      {showHelp && <HelpPanel onClose={() => setShowHelp(false)} />}
    </div>
  );
}
