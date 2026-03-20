import type { ProcessHealthData } from '../hooks/useProcessHealth';

export function ProcessMap({ data }: { data: ProcessHealthData | null }) {
  if (!data || data.services.length === 0) {
    return <div className="process-map-placeholder">No services discovered</div>;
  }

  const services = data.services;

  return (
    <div style={{ padding: 'var(--sp-4)' }}>
      <svg width="100%" height={Math.max(300, services.length * 60 + 100)} viewBox={`0 0 800 ${services.length * 60 + 80}`}>
        {services.map((svc, i) => {
          const x = 40;
          const y = 40 + i * 56;
          const isActive = svc.systemd?.activeState === 'active' || (svc.pidFile?.alive && svc.pidFile.matchesProcess);
          const isFailed = svc.systemd?.failed;
          const fill = isFailed ? '#f85149' : isActive ? '#3fb950' : '#6e7681';
          const name = svc.name || `PID:${svc.pidFile?.pid}`;

          return (
            <g key={svc.name || i}>
              <rect x={x} y={y} width={220} height={40} rx={6} fill="#161b22" stroke={fill} strokeWidth={2} />
              <circle cx={x + 16} cy={y + 20} r={5} fill={fill} />
              <text x={x + 28} y={y + 17} fill="#e6edf3" fontSize={12} fontFamily="SF Mono, monospace" fontWeight={600}>{name}</text>
              <text x={x + 28} y={y + 32} fill="#8b949e" fontSize={10} fontFamily="SF Mono, monospace">
                {svc.systemd ? `${svc.systemd.activeState}` : 'no systemd'}
                {svc.metrics ? ` · CPU ${svc.metrics.cpu}% · MEM ${svc.metrics.mem}%` : ''}
              </text>

              {/* Workers */}
              {svc.workers?.workers.map((w, wi) => {
                const wx = 300 + wi * 110;
                const wy = y + 5;
                const wFill = w.alive ? '#3fb950' : w.stale ? '#f85149' : '#6e7681';
                return (
                  <g key={w.name}>
                    <line x1={x + 220} y1={y + 20} x2={wx} y2={wy + 15} stroke={wFill} strokeWidth={1} opacity={0.5} />
                    <rect x={wx} y={wy} width={100} height={30} rx={4} fill="#1c2129" stroke={wFill} strokeWidth={1} />
                    <text x={wx + 8} y={wy + 18} fill="#e6edf3" fontSize={10} fontFamily="SF Mono, monospace">{w.name}</text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
