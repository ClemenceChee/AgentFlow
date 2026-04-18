import React from 'react';

interface BreadcrumbItem {
  readonly label: string;
  readonly path: string;
  readonly icon?: string;
  readonly onClick?: () => void;
  readonly active?: boolean;
}

interface Props {
  readonly items: BreadcrumbItem[];
  readonly className?: string;
  readonly showHome?: boolean;
  readonly separator?: string;
}

export const OrganizationalBreadcrumbs: React.FC<Props> = ({
  items,
  className = '',
  showHome = true,
  separator = '/'
}) => {
  const allItems = showHome
    ? [{ label: 'Organization', path: '/', icon: '🏢' }, ...items]
    : items;

  return (
    <nav className={`org-breadcrumbs ${className}`} aria-label="Breadcrumb">
      <ol className="org-breadcrumbs-list">
        {allItems.map((item, index) => {
          const isLast = index === allItems.length - 1;
          const isActive = item.active || isLast;

          return (
            <li key={`${item.path}-${index}`} className="org-breadcrumb-item">
              {index > 0 && (
                <span className="org-breadcrumb-separator" aria-hidden="true">
                  {separator}
                </span>
              )}

              {isActive ? (
                <span className="org-breadcrumb-current" aria-current="page">
                  {item.icon && (
                    <span className="org-breadcrumb-icon" aria-hidden="true">
                      {item.icon}
                    </span>
                  )}
                  {item.label}
                </span>
              ) : (
                <button
                  type="button"
                  className="org-breadcrumb-link"
                  onClick={item.onClick}
                  aria-label={`Navigate to ${item.label}`}
                >
                  {item.icon && (
                    <span className="org-breadcrumb-icon" aria-hidden="true">
                      {item.icon}
                    </span>
                  )}
                  {item.label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};