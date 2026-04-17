import { useState, useEffect, useCallback } from 'react';

export interface RegulationSummary {
  regulation: string;
  compliancePct: number;
  totalRecords: number;
  violations: number;
  remediations: number;
}

export interface ComplianceResponse {
  overallComplianceScore: number;
  regulations: RegulationSummary[];
  timestamp: string;
}

export interface Violation {
  id: string;
  regulation: string;
  agentId: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  detectedAt: string;
}

export interface ViolationsResponse {
  activeViolations: number;
  violations: Violation[];
  timestamp: string;
}

const POLL = 30_000;

export function useCompliance(): { overview: ComplianceResponse | null; violations: ViolationsResponse | null } {
  const [overview, setOverview] = useState<ComplianceResponse | null>(null);
  const [violations, setViolations] = useState<ViolationsResponse | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [oRes, vRes] = await Promise.all([
        fetch('/api/v1/compliance'),
        fetch('/api/v1/compliance/violations'),
      ]);
      if (oRes.ok) setOverview(await oRes.json());
      if (vRes.ok) setViolations(await vRes.json());
    } catch { /* retry */ }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, POLL);
    return () => clearInterval(id);
  }, [fetchData]);

  return { overview, violations };
}
