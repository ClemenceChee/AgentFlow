import './styles/tokens.css';
import './styles/shell.css';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ExecSidebar } from './components/ExecSidebar';
import { SettingsPanel } from './components/SettingsPanel';
import { Placeholder } from './components/v2/Placeholder';
import {
  AgentProfilePage,
  ExecutionDetailPage,
  GuardsPage,
  MiningPage,
  OrgLockedTeaser,
  OrgPage,
  OverviewPage,
  SomaLockedTeaser,
  SomaPage,
} from './components/v2/pages';
import { type PageId, Shell, useTweaks } from './components/v2/shell';
import { OrganizationalContextProvider } from './contexts/OrganizationalContext';
// Organizational-specific hooks/components intentionally kept out of the
// v2 Org page for now — Phase 7 will wire richer data sources.
import { useAgents } from './hooks/useAgents';
import { useProcessHealth } from './hooks/useProcessHealth';
import { useProcessModel } from './hooks/useProcessModel';
import { useSelectedTrace } from './hooks/useSelectedTrace';
import { useSomaTier } from './hooks/useSomaTier';
import { useTraces } from './hooks/useTraces';
import { pickInitialAgent } from './state';

declare const __APP_VERSION__: string;

type AgentView = 'profile' | 'execution';

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
  const [tweaks] = useTweaks();

  const [page, setPage] = useState<PageId>('agents');
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
      setPage('agents');
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

  const handlePage = useCallback(
    (p: PageId) => {
      setPage(p);
      if (p !== 'agents') {
        setAgentView('profile');
        clearSelection();
      }
    },
    [clearSelection],
  );

  const processModel = useProcessModel(selectedAgent);

  // Real tier from useSomaTier drives SOMA/Org gating.
  // The Tweaks panel overrides this for demo purposes in dev only.
  const effectiveTier = tweaks.tier;
  const somaLocked = effectiveTier === 'free';
  const orgLocked = effectiveTier !== 'enterprise';

  const healthState: 'healthy' | 'degraded' | 'offline' = (() => {
    if (!processHealth) return 'offline';
    const hasFailedService = processHealth.services.some((s) => s.systemd?.failed);
    const hasOrphans = (processHealth.orphans?.length ?? 0) > 0;
    if (hasFailedService) return 'degraded';
    if (hasOrphans) return 'degraded';
    return 'healthy';
  })();

  return (
    <>
      <Shell
        page={page}
        onPage={handlePage}
        grouped={grouped}
        selectedAgent={selectedAgent}
        onSelectAgent={handleSelectAgent}
        showSidebar={page === 'overview' || page === 'agents'}
        tracesCount={traces.length}
        version={typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : undefined}
        health={healthState}
      >
        {page === 'overview' && (
          <OverviewPage
            agents={agents}
            grouped={grouped}
            traces={traces}
            processHealth={processHealth}
            processModel={processModel.data}
            onSelectAgent={handleSelectAgent}
            onRefresh={() => window.location.reload()}
          />
        )}

        {page === 'agents' && (
          <OrganizationalContextProvider>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '320px 1fr',
                height: '100%',
                minHeight: 0,
              }}
            >
              <ExecSidebar
                key={selectedAgent ?? '__none__'}
                agentId={selectedAgent}
                sourceAgentIds={agents.find((a) => a.agentId === selectedAgent)?.sources}
                traces={traces}
                selectedFilename={selectedFilename}
                onSelect={handleSelectExecution}
              />
              <div style={{ overflowY: 'auto', minHeight: 0 }}>
                {!selectedAgent && <Placeholder page="agents" />}
                {selectedAgent && agentView === 'profile' && (
                  <AgentProfilePage
                    agentId={selectedAgent}
                    agents={agents}
                    traces={traces}
                    processModel={processModel.data}
                    onSelectTrace={handleSelectExecution}
                  />
                )}
                {selectedAgent && agentView === 'execution' && (
                  <ExecutionDetailPage
                    trace={trace}
                    loading={traceLoading}
                    onBack={() => {
                      setAgentView('profile');
                      clearSelection();
                    }}
                  />
                )}
              </div>
            </div>
          </OrganizationalContextProvider>
        )}

        {page === 'mining' && (
          <MiningPage agents={agents} traces={traces} processModel={processModel.data} />
        )}
        {page === 'guards' && <GuardsPage />}

        {page === 'soma' &&
          (somaLocked ? (
            <SomaLockedTeaser onUpgrade={() => setPage('soma')} />
          ) : (
            <SomaPage tier={somaTier} />
          ))}

        {page === 'org' &&
          (orgLocked ? (
            <OrgLockedTeaser onUpgrade={() => setPage('org')} />
          ) : (
            <OrgPage agents={agents} grouped={grouped} />
          ))}
      </Shell>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </>
  );
}
