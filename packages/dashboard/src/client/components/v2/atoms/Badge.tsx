import type { ReactNode } from 'react';

export type BadgeKind = 'ok' | 'warn' | 'fail' | 'info' | 'neutral' | 'accent';

export function Badge({ kind = 'neutral', children }: { kind?: BadgeKind; children: ReactNode }) {
  return <span className={`v2-badge v2-badge--${kind}`}>{children}</span>;
}

export function StatusPill({ status }: { status: 'ok' | 'warn' | 'fail' | 'idle' }) {
  const kind: BadgeKind = status === 'idle' ? 'neutral' : status;
  return <Badge kind={kind}>{status}</Badge>;
}
