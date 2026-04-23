import { useState } from 'react';
import type { AnomaliesResponse } from '../hooks/useAnomalies';
import type { ComplianceResponse, Violation, ViolationsResponse } from '../hooks/useCompliance';
import { ComplianceGauge } from './charts/ComplianceGauge';

interface Props {
  compliance: { overview: ComplianceResponse | null; violations: ViolationsResponse | null };
  anomalies: AnomaliesResponse | null;
}

type Tab = 'overview' | 'violations';

export function ComplianceDashboard({ compliance, anomalies }: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const [selectedReg, setSelectedReg] = useState<string | null>(null);

  const { overview, violations } = compliance;

  if (!overview) {
    return <div className="bi-loading">Loading compliance data...</div>;
  }

  const filteredViolations = selectedReg
    ? (violations?.violations ?? []).filter(
        (v) => v.regulation.toLowerCase() === selectedReg.toLowerCase(),
      )
    : (violations?.violations ?? []);

  return (
    <div>
      {/* Overall score */}
      <section className="bi-section">
        <div className="bi-grid--3 bi-grid">
          <div className="bi-card" style={{ display: 'flex', justifyContent: 'center' }}>
            <ComplianceGauge score={overview.overallComplianceScore} label="Overall Compliance" />
          </div>
          <div className="bi-card">
            <div className="bi-card__header">
              <span className="bi-card__title">Summary</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
              <SummaryRow label="Regulations Tracked" value={String(overview.regulations.length)} />
              <SummaryRow
                label="Active Violations"
                value={String(violations?.activeViolations ?? 0)}
                color={(violations?.activeViolations ?? 0) > 0 ? 'var(--fail)' : 'var(--ok)'}
              />
              <SummaryRow
                label="Critical / High"
                value={String(
                  (violations?.violations ?? []).filter(
                    (v) => v.severity === 'critical' || v.severity === 'high',
                  ).length,
                )}
                color="var(--fail)"
              />
              <SummaryRow
                label="Compliance Anomalies"
                value={String(
                  (anomalies?.anomalies ?? []).filter(
                    (a) => a.source_system === 'opsintel' && !a.acknowledged,
                  ).length,
                )}
              />
            </div>
          </div>
          <div className="bi-card">
            <div className="bi-card__header">
              <span className="bi-card__title">By Severity</span>
            </div>
            <SeverityBreakdown violations={violations?.violations ?? []} />
          </div>
        </div>
      </section>

      {/* Tabs */}
      <div className="bi-tabs">
        <button
          className={`bi-tab${tab === 'overview' ? ' bi-tab--active' : ''}`}
          onClick={() => setTab('overview')}
        >
          Regulations
        </button>
        <button
          className={`bi-tab${tab === 'violations' ? ' bi-tab--active' : ''}`}
          onClick={() => setTab('violations')}
        >
          Violations ({violations?.activeViolations ?? 0})
        </button>
      </div>

      {/* Regulation cards */}
      {tab === 'overview' && (
        <div className="bi-grid--2 bi-grid">
          {overview.regulations.map((reg) => (
            <div
              key={reg.regulation}
              className="bi-reg"
              onClick={() => {
                setSelectedReg(reg.regulation === selectedReg ? null : reg.regulation);
                setTab('violations');
              }}
              style={{ cursor: 'pointer' }}
            >
              <div className="bi-reg__header">
                <span className="bi-reg__name">{reg.regulation}</span>
                <span
                  className={`badge badge--${reg.compliancePct >= 90 ? 'ok' : reg.compliancePct >= 70 ? 'warn' : 'fail'}`}
                >
                  {reg.compliancePct.toFixed(0)}%
                </span>
              </div>
              <div className="bi-reg__bar">
                <div
                  className="bi-reg__bar-fill"
                  style={{
                    width: `${reg.compliancePct}%`,
                    background:
                      reg.compliancePct >= 90
                        ? 'var(--ok)'
                        : reg.compliancePct >= 70
                          ? 'var(--warn)'
                          : 'var(--fail)',
                  }}
                />
              </div>
              <div className="bi-reg__stats">
                <span>{reg.totalRecords} records</span>
                <span>{reg.violations} violations</span>
                <span>{reg.remediations} remediations</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Violations table */}
      {tab === 'violations' && (
        <div className="bi-card bi-card--flush">
          {selectedReg && (
            <div
              style={{
                padding: 'var(--s3)',
                borderBottom: '1px solid var(--bdm)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--s2)',
              }}
            >
              <span style={{ fontSize: 'var(--sm)', color: 'var(--t2)' }}>
                Filtered: {selectedReg}
              </span>
              <button className="bi-btn bi-btn--sm" onClick={() => setSelectedReg(null)}>
                Clear
              </button>
            </div>
          )}
          {filteredViolations.length === 0 ? (
            <div className="bi-empty">
              <span>No violations{selectedReg ? ` for ${selectedReg}` : ''}</span>
            </div>
          ) : (
            <div>
              {filteredViolations.map((v) => (
                <div key={v.id} className="bi-violation">
                  <div className="bi-violation__severity">
                    <span className={`badge badge--${sevBadge(v.severity)}`}>{v.severity}</span>
                  </div>
                  <div className="bi-violation__body">
                    <div className="bi-violation__title">{v.description}</div>
                    <div className="bi-violation__meta">
                      {v.regulation} &middot; {v.agentId} &middot; {fmtAgo(v.detectedAt)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 'var(--sm)', color: 'var(--t2)' }}>{label}</span>
      <span
        style={{
          fontFamily: 'var(--fm)',
          fontSize: 'var(--sm)',
          fontWeight: 600,
          color: color || 'var(--t1)',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function SeverityBreakdown({ violations }: { violations: Violation[] }) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const v of violations) counts[v.severity]++;

  const items: { key: string; color: string }[] = [
    { key: 'critical', color: 'var(--fail)' },
    { key: 'high', color: 'var(--warn)' },
    { key: 'medium', color: 'var(--info)' },
    { key: 'low', color: 'var(--t3)' },
  ];

  const total = violations.length || 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
      {items.map(({ key, color }) => (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
          <span
            style={{
              width: 60,
              fontSize: 'var(--xs)',
              color: 'var(--t3)',
              textTransform: 'capitalize',
            }}
          >
            {key}
          </span>
          <div style={{ flex: 1 }}>
            <div className="bi-cost-bar">
              <div
                className="bi-cost-bar__fill"
                style={{
                  width: `${(counts[key as keyof typeof counts] / total) * 100}%`,
                  background: color,
                }}
              />
            </div>
          </div>
          <span
            style={{
              width: 24,
              textAlign: 'right',
              fontFamily: 'var(--fm)',
              fontSize: 'var(--xs)',
            }}
          >
            {counts[key as keyof typeof counts]}
          </span>
        </div>
      ))}
    </div>
  );
}

function sevBadge(s: string): string {
  if (s === 'critical') return 'fail';
  if (s === 'high') return 'warn';
  if (s === 'medium') return 'info';
  return 'neutral';
}

function fmtAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
