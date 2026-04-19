// packages/dashboard/src/client/App.tsx
//
// REBRAND: AgentFlow is the primary product. SOMA is a premium add-on that
// gates behind useSomaTier(). Process Mining and Guards are promoted to
// first-class top-level tabs (they are the core of the product, per README).
//
// Diff summary vs. current master:
//   + import ProcessMiningPage
//   + import GuardsPage
//   ~ Page type adds 'mining' | 'guards'
//   ~ Tab bar rebranded with AgentFlow wordmark + lock icon on gated tabs
//   ~ SOMA tab is disabled (not hidden) when tier.tier === 'teaser'

import { useCallback, useEffect, useRef, useState } from 'react';
import { AgentProfile } from './components/AgentProfile';
import { AicpPage } from './components/AicpPage';
import { AlertBanner } from './components/AlertBanner';
import { ExecSidebar } from './components/ExecSidebar';
import { ExecutionDetailWithOrgContext } from './components/ExecutionDetailWithOrgContext';
import { GuardsPage } from './components/GuardsPage';
import { HealthBanner } from './components/HealthBanner';
import { OrganizationalDashboard } from './components/OrganizationalDashboard';
import { ProcessMiningPage } from './components/ProcessMiningPage';
import { SettingsPanel } from './components/SettingsPanel';
import { SomaPage } from './components/SomaPage';
import { SummaryBar } from './components/SummaryBar';
import { TopSection } from './components/TopSection';
import { OrganizationalContextProvider } from './contexts/OrganizationalContext';
import { useAgents } from './hooks/useAgents';
import { useProcessHealth } from './hooks/useProcessHealth';
import { useProcessModel } from './hooks/useProcessModel';
import { useSelectedTrace } from './hooks/useSelectedTrace';
import { useSomaTier } from './hooks/useSomaTier';
import { useTraces } from './hooks/useTraces';
import { pickInitialAgent } from './state';

type Page = 'agents' | 'mining' | 'guards' | 'soma' | 'aicp' | 'organization';
type AgentView = 'profile' | 'execution';

interface TabDef {
  id: Page;
  icon: string;
  label: string;
  premium?: boolean;
}

const TABS: TabDef[] = [
  { id: 'agents',       icon: '\u{1F50D}', label: 'Agents' },
  { id: 'mining',       icon: '\u{1F4CA}', label: 'Process Mining' },
  { id: 'guards',       icon: '\u{1F6E1}', label: 'Guards' },
  { id: 'soma',         icon: '\u{1F9E0}', label: 'SOMA',         premium: true },
  { id: 'aicp',         icon: '\u{1F4C8}', label: 'AICP',         premium: true },
  { id: 'organization', icon: '\u{1F4E2}', label: 'Organization' },
];

export function App() {
  const processHealth = useProcessHealth();
  const traces = useTraces();
  const { grouped, flat: agents } = useAgents();
  const {
    trace,
    loading: traceLoading,
    selectedFilename,
    selectTrace,
    clearSelection,
  } = useSelectedTrace();
  const somaTier = useSomaTier();
  const somaLocked = somaTier.tier === 'teaser';

  const [page, setPage] = useState<Page>('agents');
  const [agentView, setAgentView] = useState<AgentView>('profile');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const autoInitDone = useRef(false);

  useEffect(() => {
    if (autoInitDone.current || agents.length === 0) return;
    const agent = pickInitialAgent(agents);
    if (agent) setSelectedAgent(agent);
    autoInitDone.current = true;
  }, [agents]);

  const handleSelectAgent = useCallback(
    (agentId: string) => {
      setSelectedAgent(agentId);
      setAgentView('profile');
      clearSelection();
    },
    [clearSelection],
  );

  const handleSelectExecution = useCallback(
    (filename: string, agentId: string) => {
      selectTrace(filename, agentId);
      setAgentView('execution');
    },
    [selectTrace],
  );

  const processModel = useProcessModel(selectedAgent);

  return (
    <div className="dashboard">
      <HealthBanner
        processHealth={processHealth}
        agents={agents}
        traces={traces}
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* Top-level page tabs */}
      <div className="page-tabs">
        <div className="page-tabs__brand">
          <span className="page-tabs__brand-mark" aria-hidden />
          <span className="page-tabs__brand-name">AgentFlow</span>
        </div>
        {TABS.map((t) => {
          const locked = t.id === 'soma' && somaLocked;
          return (
            <button
              type="button"
              key={t.id}
              className={`page-tabs__tab ${page === t.id ? 'page-tabs__tab--active' : ''} ${t.premium ? 'page-tabs__tab--premium' : ''} ${locked ? 'page-tabs__tab--locked' : ''}`}
              onClick={() => setPage(t.id)}
              title={locked ? 'Configure --soma-vault to unlock' : t.label}
            >
              {t.icon} {t.label}
              {t.premium && <span className="page-tabs__badge">{locked ? '\u{1F512}' : '\u2726'}</span>}
            </button>
          );
        })}
      </div>

      <AlertBanner processHealth={processHealth} />

      {/* Agents page */}
      {page === 'agents' && (
        <OrganizationalContextProvider>
          <TopSection
            processHealth={processHealth}
            grouped={grouped}
            selectedAgent={selectedAgent}
            onSelectAgent={handleSelectAgent}
          />
          <div className="workspace">
            <ExecSidebar
              key={selectedAgent ?? '__none__'}
              agentId={selectedAgent}
              sourceAgentIds={agents.find((a) => a.agentId === selectedAgent)?.sources}
              traces={traces}
              selectedFilename={selectedFilename}
              onSelect={handleSelectExecution}
            />
            <div className="workspace__main">
              {!selectedAgent && (
                <div className="workspace__empty">Select an agent above to inspect</div>
              )}
              {selectedAgent && agentView === 'profile' && (
                <AgentProfile
                  agentId={selectedAgent}
                  agents={agents}
                  traces={traces}
                  processModel={processModel.data}
                  processModelLoading={processModel.loading}
                />
              )}
              {selectedAgent && agentView === 'execution' && trace && (
                <ExecutionDetailWithOrgContext trace={trace} loading={traceLoading} />
              )}
              {selectedAgent && agentView === 'execution' && !trace && !traceLoading && (
                <div className="workspace__empty">Select an execution from the sidebar</div>
              )}
              {selectedAgent && agentView === 'execution' && traceLoading && (
                <div className="workspace__empty">Loading execution...</div>
              )}
            </div>
          </div>
        </OrganizationalContextProvider>
      )}

      {/* Process Mining page */}
      {page === 'mining' && (
        <div className="workspace__main">
          <ProcessMiningPage />
        </div>
      )}

      {/* Guards page */}
      {page === 'guards' && (
        <div className="workspace__main">
          <GuardsPage />
        </div>
      )}

      {/* SOMA page — still uses existing SomaPage, which already handles teaser state */}
      {page === 'soma' && <SomaPage tier={somaTier} />}

      {/* AICP page */}
      {page === 'aicp' && (
        <div className="workspace__main">
          <AicpPage />
        </div>
      )}

      {/* Organization page */}
      {page === 'organization' && (
        <div className="workspace__main">
          <OrganizationalContextProvider>
            <OrganizationalDashboard />
          </OrganizationalContextProvider>
        </div>
      )}

      <SummaryBar processHealth={processHealth} traces={traces} />
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}
