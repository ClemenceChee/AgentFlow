import type { AgentsResponse } from '../hooks/useAgents';
import type { FreshnessResponse } from '../hooks/useFreshness';

interface Props {
  freshness: FreshnessResponse | null;
  agents: AgentsResponse | null;
}

export function StatusBar({ freshness, agents }: Props) {
  const sources = freshness?.sources ?? [];
  const totalAgents = agents?.totalAgents ?? 0;
  const healthy = (agents?.agents ?? []).filter((a) => a.status === 'healthy').length;

  return (
    <footer className="bi-statusbar">
      {sources.map((s) => (
        <div key={s.source} className="bi-statusbar__item">
          <span className={`bi-statusbar__dot bi-statusbar__dot--${s.status}`} />
          {s.source}
        </div>
      ))}
      <div className="bi-statusbar__spacer" />
      <span>
        {healthy}/{totalAgents} agents healthy
      </span>
      <span>{freshness?.timestamp ? fmtAgo(freshness.timestamp) : '--'}</span>
    </footer>
  );
}

function fmtAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
