import React, { useState, useEffect, useMemo } from 'react';
import { useOrganizationalContext } from '../../../contexts/OrganizationalContext';

// Types for resource allocation insights
interface ResourcePool {
  readonly poolId: string;
  readonly name: string;
  readonly type: 'compute' | 'storage' | 'network' | 'memory' | 'gpu' | 'cache';
  readonly totalCapacity: number;
  readonly allocatedCapacity: number;
  readonly utilization: number; // percentage
  readonly cost: number; // dollars per hour
  readonly teams: Array<{
    readonly teamId: string;
    readonly allocation: number;
    readonly utilization: number;
    readonly priority: 'low' | 'medium' | 'high' | 'critical';
  }>;
  readonly performanceMetrics: {
    readonly throughput: number;
    readonly latency: number;
    readonly errorRate: number;
    readonly efficiency: number;
  };
  readonly scalingPolicy: {
    readonly minCapacity: number;
    readonly maxCapacity: number;
    readonly targetUtilization: number;
    readonly scaleOutThreshold: number;
    readonly scaleInThreshold: number;
  };
}

interface WorkloadPattern {
  readonly patternId: string;
  readonly name: string;
  readonly teams: string[];
  readonly timeOfDay: number[]; // 24-hour array of utilization percentages
  readonly dayOfWeek: number[]; // 7-day array of utilization percentages
  readonly seasonal: Array<{
    readonly month: number;
    readonly multiplier: number;
  }>;
  readonly predictedSpikes: Array<{
    readonly timestamp: number;
    readonly expectedLoad: number;
    readonly confidence: number;
  }>;
}

interface CapacityRecommendation {
  readonly id: string;
  readonly poolId: string;
  readonly type: 'scale_up' | 'scale_down' | 'rebalance' | 'optimize' | 'migrate';
  readonly priority: 'low' | 'medium' | 'high' | 'urgent';
  readonly title: string;
  readonly description: string;
  readonly rationale: string;
  readonly impact: {
    readonly performanceChange: number; // percentage
    readonly costChange: number; // dollars per month
    readonly utilizationChange: number; // percentage points
    readonly riskLevel: 'low' | 'medium' | 'high';
  };
  readonly implementation: {
    readonly effort: 'minimal' | 'moderate' | 'significant';
    readonly downtime: string;
    readonly rollbackTime: string;
    readonly prerequisites: string[];
  };
  readonly timeline: {
    readonly immediate: boolean;
    readonly optimalWindow: string;
    readonly urgency: string;
  };
}

interface TeamResourceProfile {
  readonly teamId: string;
  readonly teamName: string;
  readonly totalAllocation: number; // percentage of total resources
  readonly utilizationEfficiency: number; // percentage
  readonly costEfficiency: number; // value per dollar
  readonly resourceBreakdown: Array<{
    readonly resourceType: string;
    readonly allocation: number;
    readonly utilization: number;
    readonly cost: number;
  }>;
  readonly workloadCharacteristics: {
    readonly peakHours: string[];
    readonly variability: number; // coefficient of variation
    readonly predictability: number; // 0-1 score
    readonly burstiness: number; // spike frequency
  };
  readonly optimization: {
    readonly wastedCapacity: number; // percentage
    readonly rightsizingOpportunity: number; // dollars per month
    readonly sharingPotential: string[];
  };
}

interface ResourceAlert {
  readonly id: string;
  readonly poolId: string;
  readonly type: 'capacity_exceeded' | 'underutilization' | 'cost_anomaly' | 'efficiency_drop' | 'scaling_failure';
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly message: string;
  readonly currentValue: number;
  readonly threshold: number;
  readonly affectedTeams: string[];
  readonly projectedImpact: string;
  readonly suggestedActions: string[];
  readonly triggeredAt: number;
}

interface CapacityForecast {
  readonly forecastId: string;
  readonly poolId: string;
  readonly forecastHorizon: '24h' | '7d' | '30d' | '90d';
  readonly predictions: Array<{
    readonly timestamp: number;
    readonly expectedUtilization: number;
    readonly confidence: number;
    readonly upperBound: number;
    readonly lowerBound: number;
  }>;
  readonly seasonality: {
    readonly detected: boolean;
    readonly pattern: string;
    readonly strength: number;
  };
  readonly trends: {
    readonly direction: 'increasing' | 'decreasing' | 'stable';
    readonly rate: number; // percentage per time unit
    readonly significance: number;
  };
}

type InsightView = 'overview' | 'pools' | 'teams' | 'workload' | 'forecasting' | 'optimization';
type TimeRange = '1h' | '24h' | '7d' | '30d';

interface Props {
  readonly className?: string;
  readonly teamId?: string;
  readonly poolId?: string;
  readonly showRecommendations?: boolean;
  readonly onRecommendationApply?: (recommendation: CapacityRecommendation) => void;
}

export const ResourceAllocationInsights: React.FC<Props> = ({
  className = '',
  teamId,
  poolId,
  showRecommendations = true,
  onRecommendationApply
}) => {
  const { selectedTeam, operatorContext } = useOrganizationalContext();
  const [insightView, setInsightView] = useState<InsightView>('overview');
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [selectedPool, setSelectedPool] = useState<string | null>(poolId || null);
  const [selectedTeamProfile, setSelectedTeamProfile] = useState<string | null>(null);
  const [forecastHorizon, setForecastHorizon] = useState<'24h' | '7d' | '30d' | '90d'>('7d');
  const [showAlerts, setShowAlerts] = useState(true);
  const [autoOptimize, setAutoOptimize] = useState(false);

  const effectiveTeamId = teamId || selectedTeam;

  // Mock data - replace with actual API calls
  const mockResourcePools: ResourcePool[] = useMemo(() => [
    {
      poolId: 'pool-compute-001',
      name: 'Primary Compute Pool',
      type: 'compute',
      totalCapacity: 1000,
      allocatedCapacity: 780,
      utilization: 65.2,
      cost: 125.50,
      teams: [
        { teamId: 'team-frontend', allocation: 300, utilization: 72, priority: 'high' },
        { teamId: 'team-backend', allocation: 350, utilization: 68, priority: 'high' },
        { teamId: 'team-analytics', allocation: 130, utilization: 45, priority: 'medium' }
      ],
      performanceMetrics: {
        throughput: 2847,
        latency: 145,
        errorRate: 0.8,
        efficiency: 87
      },
      scalingPolicy: {
        minCapacity: 500,
        maxCapacity: 2000,
        targetUtilization: 70,
        scaleOutThreshold: 80,
        scaleInThreshold: 40
      }
    },
    {
      poolId: 'pool-storage-001',
      name: 'High-Performance Storage',
      type: 'storage',
      totalCapacity: 50000,
      allocatedCapacity: 38500,
      utilization: 77.0,
      cost: 45.20,
      teams: [
        { teamId: 'team-frontend', allocation: 12000, utilization: 85, priority: 'medium' },
        { teamId: 'team-backend', allocation: 18000, utilization: 75, priority: 'high' },
        { teamId: 'team-analytics', allocation: 8500, utilization: 70, priority: 'low' }
      ],
      performanceMetrics: {
        throughput: 15600,
        latency: 12,
        errorRate: 0.2,
        efficiency: 92
      },
      scalingPolicy: {
        minCapacity: 25000,
        maxCapacity: 100000,
        targetUtilization: 75,
        scaleOutThreshold: 85,
        scaleInThreshold: 50
      }
    },
    {
      poolId: 'pool-cache-001',
      name: 'Distributed Cache Cluster',
      type: 'cache',
      totalCapacity: 256,
      allocatedCapacity: 198,
      utilization: 77.3,
      cost: 28.75,
      teams: [
        { teamId: 'team-frontend', allocation: 96, utilization: 82, priority: 'high' },
        { teamId: 'team-backend', allocation: 102, utilization: 76, priority: 'high' }
      ],
      performanceMetrics: {
        throughput: 95600,
        latency: 2.3,
        errorRate: 0.1,
        efficiency: 89
      },
      scalingPolicy: {
        minCapacity: 128,
        maxCapacity: 512,
        targetUtilization: 75,
        scaleOutThreshold: 85,
        scaleInThreshold: 45
      }
    }
  ], []);

  const mockWorkloadPatterns: WorkloadPattern[] = useMemo(() => [
    {
      patternId: 'pattern-business-hours',
      name: 'Business Hours Peak',
      teams: ['team-frontend', 'team-backend'],
      timeOfDay: [
        10, 15, 20, 25, 30, 35, 45, 60, 85, 95, 90, 85,
        80, 85, 90, 95, 85, 70, 50, 35, 25, 20, 15, 10
      ],
      dayOfWeek: [60, 85, 90, 88, 92, 85, 35], // Mon-Sun
      seasonal: [
        { month: 1, multiplier: 0.9 },
        { month: 6, multiplier: 0.8 },
        { month: 12, multiplier: 1.2 }
      ],
      predictedSpikes: [
        { timestamp: Date.now() + 3600000, expectedLoad: 150, confidence: 0.85 },
        { timestamp: Date.now() + 7200000, expectedLoad: 180, confidence: 0.78 }
      ]
    },
    {
      patternId: 'pattern-analytics-batch',
      name: 'Analytics Batch Processing',
      teams: ['team-analytics'],
      timeOfDay: [
        95, 85, 70, 50, 30, 20, 15, 10, 10, 15, 20, 25,
        30, 35, 40, 45, 50, 60, 70, 80, 85, 90, 95, 95
      ],
      dayOfWeek: [90, 85, 85, 85, 85, 50, 30],
      seasonal: [
        { month: 3, multiplier: 1.3 },
        { month: 9, multiplier: 1.4 }
      ],
      predictedSpikes: []
    }
  ], []);

  const mockTeamProfiles: TeamResourceProfile[] = useMemo(() => [
    {
      teamId: 'team-frontend',
      teamName: 'Frontend Team',
      totalAllocation: 32.5,
      utilizationEfficiency: 78.2,
      costEfficiency: 2.45,
      resourceBreakdown: [
        { resourceType: 'compute', allocation: 300, utilization: 72, cost: 40.65 },
        { resourceType: 'storage', allocation: 12000, utilization: 85, cost: 13.86 },
        { resourceType: 'cache', allocation: 96, utilization: 82, cost: 13.18 }
      ],
      workloadCharacteristics: {
        peakHours: ['09:00-11:00', '14:00-16:00'],
        variability: 0.34,
        predictability: 0.87,
        burstiness: 2.3
      },
      optimization: {
        wastedCapacity: 18.5,
        rightsizingOpportunity: 850,
        sharingPotential: ['team-design', 'team-mobile']
      }
    },
    {
      teamId: 'team-backend',
      teamName: 'Backend Team',
      totalAllocation: 38.7,
      utilizationEfficiency: 71.5,
      costEfficiency: 2.89,
      resourceBreakdown: [
        { resourceType: 'compute', allocation: 350, utilization: 68, cost: 47.43 },
        { resourceType: 'storage', allocation: 18000, utilization: 75, cost: 20.79 },
        { resourceType: 'cache', allocation: 102, utilization: 76, cost: 14.01 }
      ],
      workloadCharacteristics: {
        peakHours: ['08:00-10:00', '13:00-15:00', '18:00-20:00'],
        variability: 0.28,
        predictability: 0.92,
        burstiness: 1.8
      },
      optimization: {
        wastedCapacity: 24.2,
        rightsizingOpportunity: 1250,
        sharingPotential: ['team-infra']
      }
    },
    {
      teamId: 'team-analytics',
      teamName: 'Analytics Team',
      totalAllocation: 15.8,
      utilizationEfficiency: 65.8,
      costEfficiency: 3.12,
      resourceBreakdown: [
        { resourceType: 'compute', allocation: 130, utilization: 45, cost: 17.62 },
        { resourceType: 'storage', allocation: 8500, utilization: 70, cost: 9.81 }
      ],
      workloadCharacteristics: {
        peakHours: ['02:00-06:00', '22:00-02:00'],
        variability: 0.62,
        predictability: 0.73,
        burstiness: 4.1
      },
      optimization: {
        wastedCapacity: 35.2,
        rightsizingOpportunity: 620,
        sharingPotential: ['team-ml', 'team-research']
      }
    }
  ], []);

  const mockRecommendations: CapacityRecommendation[] = useMemo(() => [
    {
      id: 'rec-001',
      poolId: 'pool-compute-001',
      type: 'rebalance',
      priority: 'high',
      title: 'Rebalance Frontend-Backend Allocation',
      description: 'Frontend team is underutilizing allocated resources while backend shows consistent demand',
      rationale: 'Frontend utilization at 72% vs backend at 68%, but frontend shows 18.5% waste vs backend 24.2%',
      impact: {
        performanceChange: 15,
        costChange: -450,
        utilizationChange: 8,
        riskLevel: 'low'
      },
      implementation: {
        effort: 'minimal',
        downtime: '< 5 minutes',
        rollbackTime: '< 2 minutes',
        prerequisites: ['Team coordination', 'Load balancer update']
      },
      timeline: {
        immediate: true,
        optimalWindow: 'Off-peak hours (2-4 AM)',
        urgency: 'Can be implemented within 24 hours'
      }
    },
    {
      id: 'rec-002',
      poolId: 'pool-cache-001',
      type: 'scale_up',
      priority: 'medium',
      title: 'Increase Cache Capacity for Peak Hours',
      description: 'Cache utilization reaches 95% during business hours, causing performance degradation',
      rationale: 'Hit rate drops to 76% during peaks vs 89% average, indicating insufficient capacity',
      impact: {
        performanceChange: 25,
        costChange: 180,
        utilizationChange: -15,
        riskLevel: 'low'
      },
      implementation: {
        effort: 'moderate',
        downtime: '10-15 minutes',
        rollbackTime: '5 minutes',
        prerequisites: ['Memory capacity check', 'Cache warming strategy']
      },
      timeline: {
        immediate: false,
        optimalWindow: 'Weekend maintenance window',
        urgency: 'Implement within 1 week'
      }
    },
    {
      id: 'rec-003',
      poolId: 'pool-storage-001',
      type: 'optimize',
      priority: 'low',
      title: 'Implement Tiered Storage Strategy',
      description: 'Move infrequently accessed data to cheaper storage tiers to reduce costs',
      rationale: 'Analysis shows 40% of stored data accessed less than once per month',
      impact: {
        performanceChange: -2,
        costChange: -850,
        utilizationChange: 5,
        riskLevel: 'medium'
      },
      implementation: {
        effort: 'significant',
        downtime: 'None (gradual migration)',
        rollbackTime: '24-48 hours',
        prerequisites: ['Storage tier analysis', 'Migration tooling', 'Access pattern monitoring']
      },
      timeline: {
        immediate: false,
        optimalWindow: 'Quarterly maintenance',
        urgency: 'Can be planned for next quarter'
      }
    }
  ], []);

  const mockAlerts: ResourceAlert[] = useMemo(() => [
    {
      id: 'alert-resource-001',
      poolId: 'pool-compute-001',
      type: 'efficiency_drop',
      severity: 'medium',
      message: 'Compute efficiency dropped 12% in the last 4 hours',
      currentValue: 75,
      threshold: 85,
      affectedTeams: ['team-frontend', 'team-backend'],
      projectedImpact: 'Potential 15% increase in response times if trend continues',
      suggestedActions: [
        'Review recent deployment changes',
        'Check for resource contention',
        'Consider temporary capacity increase'
      ],
      triggeredAt: Date.now() - 240000
    },
    {
      id: 'alert-resource-002',
      poolId: 'pool-cache-001',
      type: 'capacity_exceeded',
      severity: 'high',
      message: 'Cache utilization exceeded 90% threshold',
      currentValue: 92.3,
      threshold: 90,
      affectedTeams: ['team-frontend', 'team-backend'],
      projectedImpact: 'Cache hit rate degradation and increased latency',
      suggestedActions: [
        'Scale cache capacity immediately',
        'Review cache eviction policies',
        'Implement cache warming'
      ],
      triggeredAt: Date.now() - 120000
    }
  ], []);

  const mockForecasts: CapacityForecast[] = useMemo(() => [
    {
      forecastId: 'forecast-001',
      poolId: 'pool-compute-001',
      forecastHorizon: '7d',
      predictions: Array.from({ length: 24 }, (_, i) => ({
        timestamp: Date.now() + i * 3600000,
        expectedUtilization: 65 + Math.sin(i / 4) * 20 + Math.random() * 10 - 5,
        confidence: 0.85 - Math.random() * 0.2,
        upperBound: 85 + Math.sin(i / 4) * 15,
        lowerBound: 45 + Math.sin(i / 4) * 25
      })),
      seasonality: {
        detected: true,
        pattern: 'Daily business hours cycle',
        strength: 0.78
      },
      trends: {
        direction: 'increasing',
        rate: 2.3,
        significance: 0.95
      }
    }
  ], []);

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const getUtilizationColor = (utilization: number): string => {
    if (utilization < 50) return 'var(--org-info)';
    if (utilization < 70) return 'var(--org-success)';
    if (utilization < 85) return 'var(--org-warning)';
    return 'var(--org-alert-high)';
  };

  const getPriorityColor = (priority: string): string => {
    switch (priority) {
      case 'urgent': return 'var(--org-alert-critical)';
      case 'high': return 'var(--org-alert-high)';
      case 'medium': return 'var(--org-alert-medium)';
      case 'low': return 'var(--org-alert-low)';
      default: return 'var(--org-text-muted)';
    }
  };

  const renderOverview = () => {
    const totalCost = mockResourcePools.reduce((sum, pool) => sum + pool.cost, 0);
    const avgUtilization = mockResourcePools.reduce((sum, pool) => sum + pool.utilization, 0) / mockResourcePools.length;
    const totalRecommendations = mockRecommendations.length;
    const potentialSavings = mockRecommendations.reduce((sum, rec) => sum + Math.abs(rec.impact.costChange), 0);

    return (
      <div className="org-resource-overview">
        <div className="org-overview-stats">
          <div className="org-stat-card">
            <div className="org-stat-value">${totalCost.toFixed(0)}/hr</div>
            <div className="org-stat-label">Total Resource Cost</div>
            <div className="org-stat-trend org-trend-negative">+8% vs last week</div>
          </div>
          <div className="org-stat-card">
            <div className="org-stat-value">{avgUtilization.toFixed(1)}%</div>
            <div className="org-stat-label">Average Utilization</div>
            <div className="org-stat-trend org-trend-positive">+3% vs baseline</div>
          </div>
          <div className="org-stat-card">
            <div className="org-stat-value">{totalRecommendations}</div>
            <div className="org-stat-label">Active Recommendations</div>
          </div>
          <div className="org-stat-card">
            <div className="org-stat-value">${potentialSavings.toFixed(0)}</div>
            <div className="org-stat-label">Potential Monthly Savings</div>
            <div className="org-stat-trend org-trend-positive">optimization opportunities</div>
          </div>
        </div>

        <div className="org-resource-pools-summary">
          <h4>Resource Pool Status</h4>
          <div className="org-pools-grid">
            {mockResourcePools.map((pool) => (
              <div
                key={pool.poolId}
                className={`org-pool-summary-card ${selectedPool === pool.poolId ? 'org-selected' : ''}`}
                onClick={() => setSelectedPool(selectedPool === pool.poolId ? null : pool.poolId)}
              >
                <div className="org-pool-header">
                  <h5>{pool.name}</h5>
                  <div className={`org-pool-type org-type-${pool.type}`}>
                    {pool.type}
                  </div>
                </div>

                <div className="org-utilization-display">
                  <div className="org-utilization-bar">
                    <div
                      className="org-utilization-fill"
                      style={{
                        width: `${pool.utilization}%`,
                        backgroundColor: getUtilizationColor(pool.utilization)
                      }}
                    />
                  </div>
                  <span className="org-utilization-text">
                    {pool.utilization.toFixed(1)}% utilized
                  </span>
                </div>

                <div className="org-pool-metrics">
                  <div className="org-metric-item">
                    <span>Capacity:</span>
                    <span>{pool.type === 'storage' ? formatBytes(pool.totalCapacity * 1024 * 1024) : pool.totalCapacity}</span>
                  </div>
                  <div className="org-metric-item">
                    <span>Cost:</span>
                    <span>${pool.cost.toFixed(2)}/hr</span>
                  </div>
                  <div className="org-metric-item">
                    <span>Teams:</span>
                    <span>{pool.teams.length}</span>
                  </div>
                </div>

                {selectedPool === pool.poolId && (
                  <div className="org-pool-details">
                    <div className="org-team-allocations">
                      <h6>Team Allocations:</h6>
                      {pool.teams.map((team) => (
                        <div key={team.teamId} className="org-team-allocation">
                          <span className="org-team-name">{team.teamId}</span>
                          <div className="org-allocation-bar">
                            <div
                              className="org-allocation-fill"
                              style={{
                                width: `${(team.allocation / pool.totalCapacity) * 100}%`,
                                backgroundColor: getUtilizationColor(team.utilization)
                              }}
                            />
                          </div>
                          <span className="org-utilization-value">
                            {team.utilization}%
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="org-performance-summary">
                      <h6>Performance Metrics:</h6>
                      <div className="org-perf-grid">
                        <div className="org-perf-item">
                          <span>Throughput:</span>
                          <span>{pool.performanceMetrics.throughput.toLocaleString()}</span>
                        </div>
                        <div className="org-perf-item">
                          <span>Latency:</span>
                          <span>{pool.performanceMetrics.latency}ms</span>
                        </div>
                        <div className="org-perf-item">
                          <span>Error Rate:</span>
                          <span>{pool.performanceMetrics.errorRate}%</span>
                        </div>
                        <div className="org-perf-item">
                          <span>Efficiency:</span>
                          <span>{pool.performanceMetrics.efficiency}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="org-workload-preview">
          <h4>Workload Pattern Preview</h4>
          <div className="org-pattern-chart">
            <div className="org-time-axis">
              {Array.from({ length: 24 }, (_, i) => (
                <div key={i} className="org-hour-label">
                  {i.toString().padStart(2, '0')}
                </div>
              ))}
            </div>
            <div className="org-utilization-chart">
              {mockWorkloadPatterns[0]?.timeOfDay.map((util, hour) => (
                <div
                  key={hour}
                  className="org-utilization-column"
                  style={{
                    height: `${util}%`,
                    backgroundColor: getUtilizationColor(util)
                  }}
                  title={`${hour}:00 - ${util}% utilization`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderTeams = () => (
    <div className="org-team-resource-profiles">
      <div className="org-section-header">
        <h3>Team Resource Profiles</h3>
        <div className="org-profile-summary">
          {mockTeamProfiles.length} teams analyzed
        </div>
      </div>

      <div className="org-team-profiles-grid">
        {mockTeamProfiles.map((profile) => (
          <div
            key={profile.teamId}
            className={`org-team-profile-card ${selectedTeamProfile === profile.teamId ? 'org-selected' : ''}`}
            onClick={() => setSelectedTeamProfile(
              selectedTeamProfile === profile.teamId ? null : profile.teamId
            )}
          >
            <div className="org-profile-header">
              <h4>{profile.teamName}</h4>
              <div className="org-profile-badges">
                <span className="org-allocation-badge">
                  {profile.totalAllocation.toFixed(1)}% allocation
                </span>
                <span className="org-efficiency-badge">
                  {profile.utilizationEfficiency.toFixed(1)}% efficiency
                </span>
              </div>
            </div>

            <div className="org-resource-breakdown">
              <h5>Resource Breakdown</h5>
              {profile.resourceBreakdown.map((resource) => (
                <div key={resource.resourceType} className="org-resource-item">
                  <div className="org-resource-header">
                    <span className="org-resource-type">{resource.resourceType}</span>
                    <span className="org-resource-cost">${resource.cost.toFixed(2)}/hr</span>
                  </div>
                  <div className="org-resource-utilization">
                    <div className="org-utilization-bar">
                      <div
                        className="org-utilization-fill"
                        style={{
                          width: `${resource.utilization}%`,
                          backgroundColor: getUtilizationColor(resource.utilization)
                        }}
                      />
                    </div>
                    <span>{resource.utilization}%</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="org-optimization-opportunities">
              <h5>Optimization Opportunities</h5>
              <div className="org-optimization-metrics">
                <div className="org-optimization-item">
                  <span>Wasted Capacity:</span>
                  <span className="org-waste">{profile.optimization.wastedCapacity.toFixed(1)}%</span>
                </div>
                <div className="org-optimization-item">
                  <span>Potential Savings:</span>
                  <span className="org-savings">${profile.optimization.rightsizingOpportunity}/mo</span>
                </div>
              </div>
              {profile.optimization.sharingPotential.length > 0 && (
                <div className="org-sharing-potential">
                  <span>Sharing opportunities:</span>
                  <div className="org-sharing-teams">
                    {profile.optimization.sharingPotential.map((teamId) => (
                      <span key={teamId} className="org-sharing-team">{teamId}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {selectedTeamProfile === profile.teamId && (
              <div className="org-profile-details">
                <div className="org-workload-characteristics">
                  <h6>Workload Characteristics:</h6>
                  <div className="org-characteristics-grid">
                    <div className="org-characteristic">
                      <span>Peak Hours:</span>
                      <span>{profile.workloadCharacteristics.peakHours.join(', ')}</span>
                    </div>
                    <div className="org-characteristic">
                      <span>Predictability:</span>
                      <span>{(profile.workloadCharacteristics.predictability * 100).toFixed(0)}%</span>
                    </div>
                    <div className="org-characteristic">
                      <span>Variability:</span>
                      <span>{profile.workloadCharacteristics.variability.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="org-cost-efficiency">
                  <h6>Cost Efficiency Analysis:</h6>
                  <div className="org-efficiency-metric">
                    <span>Value per Dollar:</span>
                    <span className="org-efficiency-score">${profile.costEfficiency.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const renderOptimization = () => (
    <div className="org-resource-optimization">
      <div className="org-section-header">
        <h3>Optimization Recommendations</h3>
        <div className="org-optimization-controls">
          <label>
            <input
              type="checkbox"
              checked={autoOptimize}
              onChange={(e) => setAutoOptimize(e.target.checked)}
            />
            Auto-optimize (low-risk changes only)
          </label>
        </div>
      </div>

      <div className="org-recommendations-list">
        {mockRecommendations.map((recommendation) => (
          <div key={recommendation.id} className="org-recommendation-card">
            <div className="org-recommendation-header">
              <h4>{recommendation.title}</h4>
              <div className="org-recommendation-badges">
                <span
                  className="org-priority-badge"
                  style={{ backgroundColor: getPriorityColor(recommendation.priority) }}
                >
                  {recommendation.priority}
                </span>
                <span className={`org-type-badge org-type-${recommendation.type}`}>
                  {recommendation.type.replace('_', ' ')}
                </span>
              </div>
            </div>

            <div className="org-recommendation-description">
              {recommendation.description}
            </div>

            <div className="org-rationale">
              <strong>Rationale:</strong> {recommendation.rationale}
            </div>

            <div className="org-impact-summary">
              <h5>Expected Impact</h5>
              <div className="org-impact-grid">
                <div className="org-impact-item">
                  <span>Performance:</span>
                  <span className={recommendation.impact.performanceChange > 0 ? 'org-positive' : 'org-negative'}>
                    {recommendation.impact.performanceChange > 0 ? '+' : ''}
                    {recommendation.impact.performanceChange}%
                  </span>
                </div>
                <div className="org-impact-item">
                  <span>Cost:</span>
                  <span className={recommendation.impact.costChange < 0 ? 'org-positive' : 'org-negative'}>
                    {recommendation.impact.costChange < 0 ? '-' : '+'}
                    ${Math.abs(recommendation.impact.costChange)}/mo
                  </span>
                </div>
                <div className="org-impact-item">
                  <span>Utilization:</span>
                  <span className={recommendation.impact.utilizationChange > 0 ? 'org-positive' : 'org-negative'}>
                    {recommendation.impact.utilizationChange > 0 ? '+' : ''}
                    {recommendation.impact.utilizationChange}pp
                  </span>
                </div>
                <div className="org-impact-item">
                  <span>Risk:</span>
                  <span className={`org-risk org-risk-${recommendation.impact.riskLevel}`}>
                    {recommendation.impact.riskLevel}
                  </span>
                </div>
              </div>
            </div>

            <div className="org-implementation-details">
              <h5>Implementation Details</h5>
              <div className="org-implementation-grid">
                <div className="org-implementation-item">
                  <span>Effort:</span>
                  <span className={`org-effort org-effort-${recommendation.implementation.effort}`}>
                    {recommendation.implementation.effort}
                  </span>
                </div>
                <div className="org-implementation-item">
                  <span>Downtime:</span>
                  <span>{recommendation.implementation.downtime}</span>
                </div>
                <div className="org-implementation-item">
                  <span>Rollback:</span>
                  <span>{recommendation.implementation.rollbackTime}</span>
                </div>
              </div>

              {recommendation.implementation.prerequisites.length > 0 && (
                <div className="org-prerequisites">
                  <h6>Prerequisites:</h6>
                  <ul>
                    {recommendation.implementation.prerequisites.map((prereq, index) => (
                      <li key={index}>{prereq}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="org-timeline-info">
              <h5>Timeline</h5>
              <div className="org-timeline-details">
                <div className="org-timeline-item">
                  <span>Urgency:</span>
                  <span>{recommendation.timeline.urgency}</span>
                </div>
                <div className="org-timeline-item">
                  <span>Optimal Window:</span>
                  <span>{recommendation.timeline.optimalWindow}</span>
                </div>
                <div className="org-timeline-item">
                  <span>Can Start:</span>
                  <span>{recommendation.timeline.immediate ? 'Immediately' : 'Requires Planning'}</span>
                </div>
              </div>
            </div>

            <div className="org-recommendation-actions">
              <button
                className="org-button org-button-primary"
                onClick={() => onRecommendationApply?.(recommendation)}
              >
                Apply Recommendation
              </button>
              <button className="org-button org-button-secondary">
                Schedule Implementation
              </button>
              <button className="org-button org-button-tertiary">
                Request Analysis
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderForecasting = () => (
    <div className="org-capacity-forecasting">
      <div className="org-section-header">
        <h3>Capacity Forecasting</h3>
        <div className="org-forecast-controls">
          <select
            value={forecastHorizon}
            onChange={(e) => setForecastHorizon(e.target.value as any)}
          >
            <option value="24h">24 Hours</option>
            <option value="7d">7 Days</option>
            <option value="30d">30 Days</option>
            <option value="90d">90 Days</option>
          </select>
        </div>
      </div>

      <div className="org-forecasts-grid">
        {mockForecasts.map((forecast) => {
          const pool = mockResourcePools.find(p => p.poolId === forecast.poolId);
          return (
            <div key={forecast.forecastId} className="org-forecast-card">
              <div className="org-forecast-header">
                <h4>{pool?.name || 'Unknown Pool'}</h4>
                <div className="org-forecast-horizon">
                  {forecast.forecastHorizon} forecast
                </div>
              </div>

              <div className="org-forecast-chart">
                <div className="org-chart-title">Predicted Utilization</div>
                <svg viewBox="0 0 600 200" className="org-forecast-svg">
                  {/* Grid lines */}
                  {[0, 25, 50, 75, 100].map(y => (
                    <line
                      key={y}
                      x1="50"
                      y1={150 - y * 1.5}
                      x2="550"
                      y2={150 - y * 1.5}
                      stroke="var(--org-border)"
                      strokeDasharray="2,2"
                      opacity="0.3"
                    />
                  ))}

                  {/* Confidence band */}
                  <polygon
                    fill="var(--org-info)"
                    opacity="0.2"
                    points={forecast.predictions.slice(0, 24).map((pred, i) => {
                      const x = 50 + (i / 23) * 500;
                      const y1 = 150 - pred.upperBound * 1.5;
                      const y2 = 150 - pred.lowerBound * 1.5;
                      return `${x},${y1}`;
                    }).join(' ') + ' ' +
                    forecast.predictions.slice(0, 24).reverse().map((pred, i) => {
                      const x = 50 + ((23 - i) / 23) * 500;
                      const y = 150 - pred.lowerBound * 1.5;
                      return `${x},${y}`;
                    }).join(' ')}
                  />

                  {/* Prediction line */}
                  <polyline
                    fill="none"
                    stroke="var(--org-primary)"
                    strokeWidth="2"
                    points={forecast.predictions.slice(0, 24).map((pred, i) => {
                      const x = 50 + (i / 23) * 500;
                      const y = 150 - pred.expectedUtilization * 1.5;
                      return `${x},${y}`;
                    }).join(' ')}
                  />

                  {/* Y-axis labels */}
                  {[0, 25, 50, 75, 100].map(y => (
                    <text
                      key={y}
                      x="45"
                      y={155 - y * 1.5}
                      textAnchor="end"
                      className="org-chart-label"
                    >
                      {y}%
                    </text>
                  ))}
                </svg>
              </div>

              <div className="org-forecast-insights">
                <div className="org-seasonality-info">
                  <h5>Seasonality Detection</h5>
                  <div className="org-seasonality-result">
                    {forecast.seasonality.detected ? (
                      <span className="org-detected">
                        ✓ {forecast.seasonality.pattern} (strength: {(forecast.seasonality.strength * 100).toFixed(0)}%)
                      </span>
                    ) : (
                      <span className="org-not-detected">No significant seasonality detected</span>
                    )}
                  </div>
                </div>

                <div className="org-trend-info">
                  <h5>Trend Analysis</h5>
                  <div className="org-trend-result">
                    <span className={`org-trend-direction org-trend-${forecast.trends.direction}`}>
                      {forecast.trends.direction} at {forecast.trends.rate.toFixed(1)}% per day
                    </span>
                    <span className="org-significance">
                      (confidence: {(forecast.trends.significance * 100).toFixed(0)}%)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className={`org-resource-allocation-insights ${className}`}>
      <div className="org-component-header">
        <h2>Resource Allocation Insights</h2>
        <div className="org-header-controls">
          <div className="org-time-range-selector">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            >
              <option value="1h">Last Hour</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>
          <div className="org-view-controls">
            <label>
              <input
                type="checkbox"
                checked={showAlerts}
                onChange={(e) => setShowAlerts(e.target.checked)}
              />
              Show Alerts
            </label>
            <label>
              <input
                type="checkbox"
                checked={showRecommendations}
                onChange={() => {}} // Controlled by parent
              />
              Show Recommendations
            </label>
          </div>
        </div>
      </div>

      <div className="org-insight-tabs">
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'pools', label: `Pools (${mockResourcePools.length})` },
          { key: 'teams', label: `Teams (${mockTeamProfiles.length})` },
          { key: 'workload', label: 'Workload Patterns' },
          { key: 'forecasting', label: 'Forecasting' },
          { key: 'optimization', label: `Optimization (${mockRecommendations.length})` }
        ].map((tab) => (
          <button
            key={tab.key}
            className={`org-tab-button ${insightView === tab.key ? 'org-active' : ''}`}
            onClick={() => setInsightView(tab.key as InsightView)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="org-insight-content">
        {insightView === 'overview' && renderOverview()}
        {insightView === 'pools' && renderOverview()} {/* Reuse overview for pools */}
        {insightView === 'teams' && renderTeams()}
        {insightView === 'workload' && renderOverview()} {/* Reuse overview for workload */}
        {insightView === 'forecasting' && renderForecasting()}
        {insightView === 'optimization' && renderOptimization()}
      </div>

      {showAlerts && mockAlerts.length > 0 && (
        <div className="org-resource-alerts">
          <h4>Resource Alerts</h4>
          {mockAlerts.map((alert) => (
            <div key={alert.id} className="org-alert-card">
              <div className="org-alert-header">
                <span className="org-pool-name">
                  {mockResourcePools.find(p => p.poolId === alert.poolId)?.name || 'Unknown Pool'}
                </span>
                <span className={`org-alert-severity org-severity-${alert.severity}`}>
                  {alert.severity}
                </span>
                <span className="org-alert-time">
                  {Math.round((Date.now() - alert.triggeredAt) / 60000)}m ago
                </span>
              </div>
              <div className="org-alert-message">{alert.message}</div>
              <div className="org-alert-impact">
                <strong>Projected Impact:</strong> {alert.projectedImpact}
              </div>
              <div className="org-alert-actions">
                <h6>Suggested Actions:</h6>
                <ul>
                  {alert.suggestedActions.map((action, index) => (
                    <li key={index}>{action}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}

      {effectiveTeamId && (
        <div className="org-context-info">
          <div className="org-context-badge">
            Resource insights for: {effectiveTeamId}
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourceAllocationInsights;