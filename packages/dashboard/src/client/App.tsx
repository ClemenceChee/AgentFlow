import { useCallback, useEffect, useRef, useState } from 'react';
import { AgentProfile } from './components/AgentProfile';
import { AlertBanner } from './components/AlertBanner';
import { ExecSidebar } from './components/ExecSidebar';
import { ExecutionDetail } from './components/ExecutionDetail';
import { HealthBanner } from './components/HealthBanner';
import { SettingsPanel } from './components/SettingsPanel';
import { SomaPage } from './components/SomaPage';
import { SummaryBar } from './components/SummaryBar';
import { TopSection } from './components/TopSection';
import { useAgents } from './hooks/useAgents';
import { useProcessHealth } from './hooks/useProcessHealth';
import { useProcessModel } from './hooks/useProcessModel';
import { useSelectedTrace } from './hooks/useSelectedTrace';
import { useSomaTier } from './hooks/useSomaTier';
import { useTraces } from './hooks/useTraces';
import { pickInitialAgent } from './state';

type Page = 'agents' | 'soma';
type AgentView = 'profile' | 'execution';

export function App() {
  const processHealth = useProcessHealth();
  const traces = useTraces();
  const { grouped, flat: agents } = useAgents();
  const { trace, loading: traceLoading, selectedFilename, selectTrace, clearSelection } = useSelectedTrace();
  const somaTier = useSomaTier();

  const [page, setPage] = useState<Page>('agents');
  const [agentView, setAgentView] = useState<AgentView>('profile');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const autoInitDone = useRef(false);

  // Auto-select first agent on load
  useEffect(() => {
    if (autoInitDone.current || agents.length === 0) return;
    const agent = pickInitialAgent(agents);
    if (agent) setSelectedAgent(agent);
    autoInitDone.current = true;
  }, [agents]);

  const handleSelectAgent = useCallback((agentId: string) => {
    setSelectedAgent(agentId);
    setAgentView('profile');
    clearSelection();
  }, [clearSelection]);

  const handleSelectExecution = useCallback((filename: string, agentId: string) => {
    selectTrace(filename, agentId);
    setAgentView('execution');
  }, [selectTrace]);

  const processModel = useProcessModel(selectedAgent);

  return (
    <div className="dashboard">
      <HealthBanner processHealth={processHealth} agents={agents} traces={traces} onOpenSettings={() => setShowSettings(true)} />

      {/* Top-level page tabs */}
      <div className="page-tabs">
        <button className={`page-tabs__tab ${page === 'agents' ? 'page-tabs__tab--active' : ''}`} onClick={() => setPage('agents')}>
          {'\u{1F50D}'} Agents
        </button>
        <button className={`page-tabs__tab ${page === 'soma' ? 'page-tabs__tab--active' : ''}`} onClick={() => setPage('soma')}>
          {'\u{1F9E0}'} SOMA
        </button>
      </div>

      <AlertBanner processHealth={processHealth} />

      {/* Agents page */}
      {page === 'agents' && (
        <>
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
                <ExecutionDetail trace={trace} loading={traceLoading} />
              )}
              {selectedAgent && agentView === 'execution' && !trace && !traceLoading && (
                <div className="workspace__empty">Select an execution from the sidebar</div>
              )}
              {selectedAgent && agentView === 'execution' && traceLoading && (
                <div className="workspace__empty">Loading execution...</div>
              )}
            </div>
          </div>
        </>
      )}

      {/* SOMA page */}
      {page === 'soma' && <SomaPage tier={somaTier} />}

      <SummaryBar processHealth={processHealth} traces={traces} />
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}
