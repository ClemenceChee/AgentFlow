import { useCallback, useEffect, useRef, useState } from 'react';
import { AgentProfile } from './components/AgentProfile';
import { AlertBanner } from './components/AlertBanner';
import { ExecSidebar } from './components/ExecSidebar';
import { ExecutionDetail } from './components/ExecutionDetail';
import { HealthBanner } from './components/HealthBanner';
import { SettingsPanel } from './components/SettingsPanel';
import { SummaryBar } from './components/SummaryBar';
import { TopSection } from './components/TopSection';
import { useAgents } from './hooks/useAgents';
import { useProcessHealth } from './hooks/useProcessHealth';
import { useProcessModel } from './hooks/useProcessModel';
import { useSelectedTrace } from './hooks/useSelectedTrace';
import { useSomaGovernance } from './hooks/useSomaGovernance';
import { useTraces } from './hooks/useTraces';
import { SomaGovernance } from './components/SomaGovernance';
import { pickInitialAgent } from './state';

type ViewMode = 'profile' | 'execution' | 'governance';

export function App() {
  const processHealth = useProcessHealth();
  const traces = useTraces();
  const { grouped, flat: agents } = useAgents();
  const { trace, loading: traceLoading, selectedFilename, selectTrace, clearSelection } = useSelectedTrace();

  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('profile');
  const [showSettings, setShowSettings] = useState(false);
  const somaGov = useSomaGovernance();
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
    setViewMode('profile');
    clearSelection();
  }, [clearSelection]);

  const handleSelectExecution = useCallback((filename: string) => {
    selectTrace(filename);
    setViewMode('execution');
  }, [selectTrace]);

  const processModel = useProcessModel(selectedAgent);

  return (
    <div className="dashboard">
      <HealthBanner processHealth={processHealth} agents={agents} traces={traces} onOpenSettings={() => setShowSettings(true)} />
      <div style={{ display: 'flex', gap: 8, padding: '4px 12px', background: 'var(--bg2)', borderBottom: '1px solid var(--bd)' }}>
        <button
          style={{ fontSize: 11, padding: '3px 10px', background: viewMode !== 'governance' ? 'transparent' : 'var(--bg3)', color: 'var(--t1)', border: '1px solid var(--bd)', borderRadius: 3, cursor: 'pointer' }}
          onClick={() => setViewMode(viewMode === 'governance' ? 'profile' : 'governance')}>
          {'\u{1F3DB}'} Governance
        </button>
      </div>
      <AlertBanner processHealth={processHealth} />

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
          {viewMode === 'governance' && (
            <SomaGovernance data={somaGov.data} onPromote={somaGov.promote} onReject={somaGov.reject} />
          )}
          {viewMode !== 'governance' && !selectedAgent && (
            <div className="workspace__empty">Select an agent above to inspect</div>
          )}
          {selectedAgent && viewMode === 'profile' && (
            <AgentProfile
              agentId={selectedAgent}
              agents={agents}
              traces={traces}
              processModel={processModel.data}
              processModelLoading={processModel.loading}
            />
          )}
          {selectedAgent && viewMode === 'execution' && trace && (
            <ExecutionDetail trace={trace} loading={traceLoading} />
          )}
          {selectedAgent && viewMode === 'execution' && !trace && !traceLoading && (
            <div className="workspace__empty">Select an execution from the sidebar</div>
          )}
          {selectedAgent && viewMode === 'execution' && traceLoading && (
            <div className="workspace__empty">Loading execution...</div>
          )}
        </div>
      </div>

      <SummaryBar processHealth={processHealth} traces={traces} />
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}
