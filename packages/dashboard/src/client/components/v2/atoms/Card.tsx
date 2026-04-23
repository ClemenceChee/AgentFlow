import type { CSSProperties, ReactNode } from 'react';

export function Card({
  title,
  sub,
  actions,
  children,
  flush,
  style,
  className = '',
}: {
  title?: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div className={`v2-card ${className}`} style={style}>
      {(title || sub || actions) && (
        <div className="v2-card__head">
          {title && <div className="v2-card__title">{title}</div>}
          {sub && <div className="v2-card__sub">{sub}</div>}
          {actions && <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>{actions}</div>}
        </div>
      )}
      <div className={`v2-card__body${flush ? ' v2-card__body--flush' : ''}`}>{children}</div>
    </div>
  );
}

export function Chip({
  children,
  onClick,
  active,
}: {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`v2-chip ${active ? 'is-active' : ''}`}
      disabled={!onClick}
      style={onClick ? undefined : { cursor: 'default' }}
    >
      {children}
    </button>
  );
}
