import type { RoiResponse } from '../hooks/useRoi';

interface Props {
  roi: RoiResponse | null;
}

export function RoiSummary({ roi }: Props) {
  if (!roi) {
    return (
      <div className="bi-card">
        <div className="bi-card__header">
          <span className="bi-card__title">ROI Analysis</span>
        </div>
        <div className="bi-loading">Loading...</div>
      </div>
    );
  }

  const items: { label: string; value: string; color?: string }[] = [
    {
      label: 'ROI',
      value: `${roi.roi.toFixed(1)}%`,
      color: roi.roi >= 0 ? 'var(--ok)' : 'var(--fail)',
    },
    {
      label: 'Net Benefit',
      value: fmtCurrency(roi.netBenefit, roi.currency),
      color: roi.netBenefit >= 0 ? 'var(--ok)' : 'var(--fail)',
    },
    { label: 'Total Cost', value: fmtCurrency(roi.totalCost, roi.currency) },
    { label: 'Revenue Impact', value: fmtCurrency(roi.totalRevenue, roi.currency) },
    { label: 'Savings', value: fmtCurrency(roi.totalSavings, roi.currency) },
  ];

  return (
    <div className="bi-card">
      <div className="bi-card__header">
        <span className="bi-card__title">ROI Analysis</span>
        <span className="bi-card__subtitle">{roi.period}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s3)' }}>
        {items.map((item) => (
          <div key={item.label} style={{ padding: 'var(--s2) 0' }}>
            <div style={{ fontSize: 'var(--xs)', color: 'var(--t3)', marginBottom: 4 }}>
              {item.label}
            </div>
            <div
              style={{
                fontSize: 'var(--lg)',
                fontWeight: 700,
                fontFamily: 'var(--fm)',
                color: item.color || 'var(--t1)',
              }}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>
      {roi.breakdown.length > 0 && (
        <div
          style={{
            marginTop: 'var(--s3)',
            borderTop: '1px solid var(--bdm)',
            paddingTop: 'var(--s3)',
          }}
        >
          <div style={{ fontSize: 'var(--xs)', color: 'var(--t3)', marginBottom: 'var(--s2)' }}>
            Breakdown
          </div>
          {roi.breakdown.map((b) => (
            <div
              key={b.category}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 'var(--sm)',
                padding: '2px 0',
              }}
            >
              <span style={{ color: 'var(--t2)' }}>{fmtCategory(b.category)}</span>
              <span style={{ fontFamily: 'var(--fm)' }}>{fmtCurrency(b.amount, b.currency)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function fmtCurrency(value: number, currency: string): string {
  const sym = currency === 'USD' ? '$' : currency;
  const abs = Math.abs(value);
  const formatted =
    abs >= 1_000_000
      ? `${(abs / 1_000_000).toFixed(1)}M`
      : abs >= 1_000
        ? `${(abs / 1_000).toFixed(1)}K`
        : abs.toFixed(2);
  return `${value < 0 ? '-' : ''}${sym}${formatted}`;
}

function fmtCategory(cat: string): string {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
