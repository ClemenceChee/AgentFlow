import React from 'react';
import type { CronHealthResponse } from '../hooks/useCronHealth';

interface Props {
  cron: CronHealthResponse | null;
}

export function CronHealthTable({ cron }: Props) {
  if (!cron) return <div className="bi-loading">Loading cron data...</div>;
  if (cron.jobs.length === 0) return <div className="bi-empty"><span>No cron jobs found</span></div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 'var(--s4)', marginBottom: 'var(--s3)' }}>
        <span className={`badge badge--${cron.overallSuccessRate >= 0.8 ? 'ok' : cron.overallSuccessRate >= 0.5 ? 'warn' : 'fail'}`}>
          {(cron.overallSuccessRate * 100).toFixed(0)}% reliability
        </span>
        <span className="badge badge--neutral">{cron.totalRuns} total runs</span>
        <span className="badge badge--neutral">{cron.totalJobs} jobs</span>
        {cron.totalTokens > 0 && (
          <span className="badge badge--info">{fmtTokens(cron.totalTokens)} tokens</span>
        )}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="bi-table">
          <thead>
            <tr>
              <th>Job</th>
              <th>Success Rate</th>
              <th>Runs</th>
              <th>Avg Duration</th>
              <th>Tokens</th>
              <th>Last Status</th>
              <th>Last Run</th>
            </tr>
          </thead>
          <tbody>
            {cron.jobs.map((j) => (
              <tr key={j.jobId}>
                <td style={{ fontWeight: 500 }}>{j.jobId}</td>
                <td>
                  <span style={{
                    fontFamily: 'var(--fm)',
                    color: j.successRate >= 0.8 ? 'var(--ok)' : j.successRate >= 0.5 ? 'var(--warn)' : 'var(--fail)',
                  }}>
                    {(j.successRate * 100).toFixed(0)}%
                  </span>
                </td>
                <td style={{ fontFamily: 'var(--fm)' }}>{j.totalRuns}</td>
                <td style={{ fontFamily: 'var(--fm)' }}>
                  {fmtDuration(j.avgDurationMs)}
                  {j.durationAnomaly && <span style={{ color: 'var(--warn)', marginLeft: 4 }} title="Duration anomaly">!</span>}
                </td>
                <td style={{ fontFamily: 'var(--fm)' }}>{fmtTokens(j.totalTokens)}</td>
                <td>
                  <span className={`badge badge--${j.lastStatus === 'ok' ? 'ok' : 'fail'}`}>
                    {j.lastStatus}
                  </span>
                </td>
                <td style={{ fontSize: 'var(--xs)', color: 'var(--t3)' }}>
                  {j.lastRunAt ? fmtAgo(j.lastRunAt) : '--'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
