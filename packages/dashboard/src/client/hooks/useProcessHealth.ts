import { useCallback, useEffect, useState } from 'react';

export interface ServiceAudit {
  name: string;
  pidFile: {
    path: string;
    pid: number | null;
    alive: boolean;
    matchesProcess: boolean;
    stale: boolean;
    reason: string;
  } | null;
  systemd: {
    unit: string;
    activeState: string;
    subState: string;
    mainPid: number;
    restarts: number;
    result: string;
    crashLooping: boolean;
    failed: boolean;
  } | null;
  workers: {
    orchestratorPid: number | null;
    orchestratorAlive: boolean;
    startedAt: string;
    workers: {
      name: string;
      pid: number | null;
      declaredStatus: string;
      alive: boolean;
      stale: boolean;
    }[];
  } | null;
  problems: string[];
  metrics?: {
    cpu: string;
    mem: string;
    elapsed: string;
  };
}

export interface ProcessHealthData {
  pidFile: ServiceAudit['pidFile'];
  systemd: ServiceAudit['systemd'];
  workers: ServiceAudit['workers'];
  osProcesses: {
    pid: number;
    cpu: string;
    mem: string;
    elapsed: string;
    started: string;
    command: string;
    cmdline: string;
  }[];
  orphans: ProcessHealthData['osProcesses'];
  problems: string[];
  services: ServiceAudit[];
  topology?: { source: string; target: string }[];
}

const POLL_INTERVAL = 10_000;

export function useProcessHealth(): ProcessHealthData | null {
  const [data, setData] = useState<ProcessHealthData | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/process-health');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // Silently retry on next interval
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchData]);

  return data;
}
