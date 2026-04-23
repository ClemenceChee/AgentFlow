export type DotKind = 'ok' | 'warn' | 'fail' | 'idle';

export function Dot({ kind = 'ok' }: { kind?: DotKind }) {
  return <span className={`v2-dot v2-dot--${kind}`} aria-hidden />;
}
