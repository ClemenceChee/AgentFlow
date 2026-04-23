import React, { useState, useRef, useEffect } from 'react';
import { OrganizationalBreadcrumbs } from './OrganizationalBreadcrumbs';
import { usePrefetch } from '../../../hooks/usePrefetch.js';

interface NavigationItem {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly description: string;
  readonly count?: number;
  readonly badge?: string;
  readonly subItems?: NavigationSubItem[];
  readonly onClick?: () => void;
}

interface NavigationSubItem {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly count?: number;
  readonly onClick?: () => void;
}

interface NavigationState {
  readonly currentView: string;
  readonly currentSubView?: string;
  readonly breadcrumbs: Array<{
    readonly label: string;
    readonly path: string;
    readonly icon?: string;
  }>;
}

interface Props {
  readonly items: NavigationItem[];
  readonly currentView: string;
  readonly currentSubView?: string;
  readonly onViewChange: (viewId: string) => void;
  readonly onSubViewChange?: (subViewId: string) => void;
  readonly className?: string;
  readonly compact?: boolean;
  readonly showSearch?: boolean;
}

export const OrganizationalNavigationMenu: React.FC<Props> = ({
  items,
  currentView,
  currentSubView,
  onViewChange,
  onSubViewChange,
  className = '',
  compact = false,
  showSearch = true
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set([currentView]));
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Initialize prefetch hooks
  const {
    prefetchTeamData,
    prefetchTeamPerformance,
    prefetchTeamActivity,
    prefetch
  } = usePrefetch();

  const currentItem = items.find(item => item.id === currentView);
  const currentSubItem = currentItem?.subItems?.find(sub => sub.id === currentSubView);

  // Generate breadcrumbs based on current navigation state
  const breadcrumbs = [];
  if (currentItem) {
    breadcrumbs.push({
      label: currentItem.label,
      path: `/${currentItem.id}`,
      icon: currentItem.icon
    });

    if (currentSubItem) {
      breadcrumbs.push({
        label: currentSubItem.label,
        path: `/${currentItem.id}/${currentSubItem.id}`
      });
    }
  }

  const handleItemClick = (item: NavigationItem) => {
    if (item.subItems && item.subItems.length > 0) {
      // Toggle expansion for items with sub-items
      const newExpanded = new Set(expandedItems);
      if (newExpanded.has(item.id)) {
        newExpanded.delete(item.id);
      } else {
        newExpanded.add(item.id);
      }
      setExpandedItems(newExpanded);
    }

    onViewChange(item.id);
    item.onClick?.();
  };

  const handleSubItemClick = (subItem: NavigationSubItem) => {
    onSubViewChange?.(subItem.id);
    subItem.onClick?.();
  };

  // Prefetch handlers for hover interactions
  const createPrefetchHandlers = (itemId: string, subItemId?: string) => {
    const handleMouseEnter = () => {
      // Prefetch data based on the item type
      switch (itemId) {
        case 'team':
          // Prefetch team data for all teams
          prefetch(
            `teams:list`,
            () => fetch('/api/teams').then(r => r.json()),
            { delay: 200, priority: 'normal' }
          );
          break;

        case 'performance':
          // Prefetch performance data
          if (subItemId === 'query-performance') {
            prefetch(
              `performance:query-all`,
              () => fetch('/api/performance/queries').then(r => r.json()),
              { delay: 200, priority: 'normal' }
            );
          } else if (subItemId === 'cache-efficiency') {
            prefetch(
              `performance:cache-all`,
              () => fetch('/api/performance/cache').then(r => r.json()),
              { delay: 200, priority: 'normal' }
            );
          } else {
            // Generic performance overview
            prefetch(
              `performance:overview`,
              () => fetch('/api/performance/overview').then(r => r.json()),
              { delay: 200, priority: 'normal' }
            );
          }
          break;

        case 'activity':
          // Prefetch activity data
          if (subItemId === 'operator-timeline') {
            prefetch(
              `activity:operators-recent`,
              () => fetch('/api/operators?recent=true').then(r => r.json()),
              { delay: 200, priority: 'normal' }
            );
          } else {
            prefetch(
              `activity:overview`,
              () => fetch('/api/activity/overview').then(r => r.json()),
              { delay: 200, priority: 'normal' }
            );
          }
          break;

        case 'session':
          // Prefetch session correlation data
          prefetch(
            `sessions:recent`,
            () => fetch('/api/sessions?recent=true&limit=50').then(r => r.json()),
            { delay: 200, priority: 'normal' }
          );
          break;

        case 'policy':
          // Prefetch policy status data
          prefetch(
            `policy:status`,
            () => fetch('/api/policy/status').then(r => r.json()),
            { delay: 200, priority: 'normal' }
          );
          break;

        case 'monitoring':
          // Prefetch real-time monitoring data
          prefetch(
            `monitoring:live`,
            () => fetch('/api/monitoring/live').then(r => r.json()),
            { delay: 100, priority: 'high' }
          );
          break;
      }
    };

    return {
      onMouseEnter: handleMouseEnter,
      onFocus: handleMouseEnter
    };
  };

  const filteredItems = searchQuery
    ? items.filter(item =>
        item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.subItems?.some(sub =>
          sub.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          sub.description.toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
    : items;

  // Build flattened list for keyboard navigation
  const getFlatItemsList = () => {
    const flatItems: Array<{ type: 'main' | 'sub', item: any, parentId?: string }> = [];

    filteredItems.forEach(item => {
      flatItems.push({ type: 'main', item });
      if (expandedItems.has(item.id) && item.subItems) {
        item.subItems.forEach(subItem => {
          flatItems.push({ type: 'sub', item: subItem, parentId: item.id });
        });
      }
    });

    return flatItems;
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) return;

      const flatItems = getFlatItemsList();

      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          setFocusedIndex(prev => Math.max(0, prev - 1));
          break;

        case 'ArrowDown':
          event.preventDefault();
          setFocusedIndex(prev => Math.min(flatItems.length - 1, prev + 1));
          break;

        case 'Enter':
        case ' ':
          event.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < flatItems.length) {
            const focusedItem = flatItems[focusedIndex];
            if (focusedItem.type === 'main') {
              handleItemClick(focusedItem.item);
            } else {
              handleSubItemClick(focusedItem.item);
            }
          }
          break;

        case 'Home':
          event.preventDefault();
          setFocusedIndex(0);
          break;

        case 'End':
          event.preventDefault();
          setFocusedIndex(flatItems.length - 1);
          break;

        case 'Escape':
          event.preventDefault();
          if (searchQuery) {
            setSearchQuery('');
            setFocusedIndex(-1);
          }
          break;

        // Focus search input with Ctrl/Cmd + F or /
        case 'f':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            searchInputRef.current?.focus();
          }
          break;

        case '/':
          event.preventDefault();
          searchInputRef.current?.focus();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [focusedIndex, searchQuery, filteredItems, expandedItems]);

  // Reset focus when items change
  useEffect(() => {
    setFocusedIndex(-1);
  }, [searchQuery, expandedItems]);

  return (
    <div
      ref={menuRef}
      className={`org-navigation-menu ${compact ? 'org-navigation-menu--compact' : ''} ${className}`}
    >
      {/* Breadcrumbs */}
      {breadcrumbs.length > 0 && (
        <div className="org-navigation-breadcrumbs">
          <OrganizationalBreadcrumbs
            items={breadcrumbs.map(crumb => ({
              ...crumb,
              onClick: () => {
                if (crumb.path.split('/').length === 2) {
                  // Main view
                  onViewChange(crumb.path.slice(1));
                } else {
                  // Sub view
                  const [, viewId, subViewId] = crumb.path.split('/');
                  onViewChange(viewId);
                  onSubViewChange?.(subViewId);
                }
              }
            }))}
          />
        </div>
      )}

      {/* Search */}
      {showSearch && (
        <div className="org-navigation-search">
          <div className="org-search-input-container">
            <span className="org-search-icon" aria-hidden="true">🔍</span>
            <input
              ref={searchInputRef}
              type="text"
              className="org-search-input"
              placeholder="Search organizational features... (Press / to focus)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search organizational features"
            />
            {searchQuery && (
              <button
                type="button"
                className="org-search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
        </div>
      )}

      {/* Navigation items */}
      <nav className="org-navigation-items" aria-label="Organizational navigation">
        {filteredItems.map((item, itemIndex) => {
          const isExpanded = expandedItems.has(item.id);
          const isActive = currentView === item.id;
          const hasSubItems = item.subItems && item.subItems.length > 0;
          const flatItems = getFlatItemsList();
          const itemFocusIndex = flatItems.findIndex(fi => fi.type === 'main' && fi.item.id === item.id);
          const isKeyboardFocused = focusedIndex === itemFocusIndex;
          const prefetchHandlers = createPrefetchHandlers(item.id);

          return (
            <div key={item.id} className="org-navigation-item-container">
              <button
                type="button"
                className={`org-navigation-item ${isActive ? 'org-active' : ''} ${isKeyboardFocused ? 'org-keyboard-focused' : ''}`}
                onClick={() => handleItemClick(item)}
                aria-expanded={hasSubItems ? isExpanded : undefined}
                aria-label={`${item.label} - ${item.description}`}
                {...prefetchHandlers}
              >
                <div className="org-nav-item-content">
                  <div className="org-nav-item-main">
                    <span className="org-nav-item-icon" aria-hidden="true">
                      {item.icon}
                    </span>
                    <div className="org-nav-item-text">
                      <div className="org-nav-item-label">
                        {item.label}
                        {item.count !== undefined && (
                          <span className="org-nav-item-count" aria-label={`${item.count} items`}>
                            {item.count}
                          </span>
                        )}
                        {item.badge && (
                          <span className={`org-nav-item-badge org-badge-${item.badge}`}>
                            {item.badge}
                          </span>
                        )}
                      </div>
                      {!compact && (
                        <div className="org-nav-item-description">
                          {item.description}
                        </div>
                      )}
                    </div>
                  </div>
                  {hasSubItems && (
                    <span
                      className={`org-nav-item-chevron ${isExpanded ? 'org-expanded' : ''}`}
                      aria-hidden="true"
                    >
                      ›
                    </span>
                  )}
                </div>
              </button>

              {/* Sub-items */}
              {hasSubItems && isExpanded && (
                <div className="org-navigation-subitems">
                  {item.subItems!.map((subItem) => {
                    const isSubActive = currentSubView === subItem.id;
                    const flatItems = getFlatItemsList();
                    const subItemFocusIndex = flatItems.findIndex(fi => fi.type === 'sub' && fi.item.id === subItem.id);
                    const isSubKeyboardFocused = focusedIndex === subItemFocusIndex;
                    const subPrefetchHandlers = createPrefetchHandlers(item.id, subItem.id);

                    return (
                      <button
                        key={subItem.id}
                        type="button"
                        className={`org-navigation-subitem ${isSubActive ? 'org-active' : ''} ${isSubKeyboardFocused ? 'org-keyboard-focused' : ''}`}
                        onClick={() => handleSubItemClick(subItem)}
                        aria-label={`${subItem.label} - ${subItem.description}`}
                        {...subPrefetchHandlers}
                      >
                        <div className="org-nav-subitem-content">
                          <div className="org-nav-subitem-label">
                            {subItem.label}
                            {subItem.count !== undefined && (
                              <span className="org-nav-subitem-count" aria-label={`${subItem.count} items`}>
                                {subItem.count}
                              </span>
                            )}
                          </div>
                          {!compact && (
                            <div className="org-nav-subitem-description">
                              {subItem.description}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Navigation footer with quick actions */}
      <div className="org-navigation-footer">
        <div className="org-quick-actions">
          <button
            type="button"
            className="org-quick-action"
            onClick={() => onViewChange('monitoring')}
            title="Open real-time monitoring"
          >
            <span aria-hidden="true">📡</span>
            <span className="org-quick-action-label">Monitor</span>
          </button>
          <button
            type="button"
            className="org-quick-action"
            onClick={() => {
              onViewChange('performance');
              onSubViewChange?.('optimization');
            }}
            title="View optimization recommendations"
          >
            <span aria-hidden="true">🎯</span>
            <span className="org-quick-action-label">Optimize</span>
          </button>
          <button
            type="button"
            className="org-quick-action"
            onClick={() => {
              onViewChange('activity');
              onSubViewChange?.('collaboration-opportunities');
            }}
            title="Find collaboration opportunities"
          >
            <span aria-hidden="true">🤝</span>
            <span className="org-quick-action-label">Collaborate</span>
          </button>
        </div>
      </div>
    </div>
  );
};