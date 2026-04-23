import type { Page } from '../App';

interface Props {
  page: Page;
  onPageChange: (p: Page) => void;
  version: string;
  onHelp?: () => void;
}

const tabs: { key: Page; label: string }[] = [
  { key: 'executive', label: 'Executive' },
  { key: 'operational', label: 'Operational' },
  { key: 'compliance', label: 'Compliance' },
  { key: 'decisions', label: 'Decisions' },
];

export function Header({ page, onPageChange, version, onHelp }: Props) {
  return (
    <header className="bi-header">
      <div className="bi-header__logo">
        <span>BI</span> Platform
      </div>
      <nav className="bi-header__nav">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`bi-header__tab${page === t.key ? ' bi-header__tab--active' : ''}`}
            onClick={() => onPageChange(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="bi-header__spacer" />
      <div className="bi-header__live">
        <span className="bi-header__live-dot" />
        Live
      </div>
      <button className="bi-btn bi-btn--sm" onClick={onHelp} title="Help (?)">
        ?
      </button>
      <span className="bi-header__version">v{version}</span>
    </header>
  );
}
