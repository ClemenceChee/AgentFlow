export function OrgLockedTeaser({ onUpgrade }: { onUpgrade?: () => void }) {
  return (
    <div className="page">
      <div className="page__header">
        <div>
          <div className="page__eyebrow">Enterprise Tier</div>
          <div className="page__title">Organizational Governance</div>
          <div className="page__subtitle">
            Team RBAC {'\u00B7'} security auditing {'\u00B7'} compliance dashboards {'\u00B7'} SSO
          </div>
        </div>
        <div className="page__head-actions">
          <button type="button" className="v2-btn v2-btn--primary v2-btn--sm" onClick={onUpgrade}>
            Contact sales
          </button>
        </div>
      </div>
      <div className="page__body">
        <div
          style={{
            padding: 40,
            background: 'var(--bg-2)',
            border: '1px solid var(--bd)',
            borderRadius: 'var(--radius)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--fs-10)',
              color: 'var(--accent)',
              letterSpacing: '.14em',
              textTransform: 'uppercase',
              marginBottom: 10,
            }}
          >
            {'\u{1F512}'} Enterprise
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--fs-24)',
              fontWeight: 600,
              marginBottom: 10,
            }}
          >
            Governance, compliance & audit
          </h2>
          <p style={{ color: 'var(--t-2)', maxWidth: 560, margin: '0 auto' }}>
            Team filtering with access control, cross-operator session correlation, configurable
            security thresholds, and comprehensive audit logging for SOC 2 / ISO evidence.
          </p>
        </div>
      </div>
    </div>
  );
}
