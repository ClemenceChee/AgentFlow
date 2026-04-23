import { useState, useEffect, useCallback } from 'react';

export interface Evidence {
  source: string;
  metric: string;
  value: number;
  context: string;
}

export interface ImpactProjection {
  category: string;
  estimatedValue: number;
  confidenceInterval: { low: number; high: number };
  timeframe: string;
  riskLevel: 'low' | 'medium' | 'high';
  effort: 'low' | 'medium' | 'high';
}

export interface Recommendation {
  id: string;
  type: 'performance' | 'cost' | 'compliance' | 'risk' | 'strategic';
  category: 'strategic' | 'operational' | 'tactical';
  title: string;
  description: string;
  confidence: number;
  evidence: Evidence[];
  impact: ImpactProjection;
  priority: 'critical' | 'high' | 'medium' | 'low';
  targetRoles: string[];
  actionItems: string[];
  businessDomain: string;
  createdAt: string;
}

export interface RecommendationsResponse {
  recommendations: Recommendation[];
  timestamp: string;
}

const POLL = 30_000;

export function useDecisionRecommendations(): RecommendationsResponse | null {
  const [data, setData] = useState<RecommendationsResponse | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/decisions/recommendations');
      if (res.ok) setData(await res.json());
    } catch { /* retry */ }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, POLL);
    return () => clearInterval(id);
  }, [fetchData]);

  return data;
}
