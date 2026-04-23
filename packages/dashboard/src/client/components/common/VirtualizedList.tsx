/**
 * Virtualized List Component
 *
 * High-performance virtual scrolling component for large datasets in
 * organizational dashboards. Supports variable item heights and keyboard navigation.
 */

import type React from 'react';
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface VirtualizedListProps<T> {
  /** Array of items to render */
  items: T[];

  /** Render function for each item */
  renderItem: (item: T, index: number, isVisible: boolean) => React.ReactNode;

  /** Height of each item in pixels (if uniform) */
  itemHeight?: number;

  /** Function to calculate item height (for variable heights) */
  getItemHeight?: (item: T, index: number) => number;

  /** Container height in pixels */
  height: number;

  /** Container width (defaults to 100%) */
  width?: string | number;

  /** Number of items to render outside viewport for smooth scrolling */
  overscan?: number;

  /** Scroll to specific index */
  scrollToIndex?: number;

  /** Callback when scroll position changes */
  onScroll?: (scrollTop: number) => void;

  /** Custom CSS class name */
  className?: string;

  /** Whether to enable keyboard navigation */
  enableKeyboardNavigation?: boolean;

  /** Callback for keyboard selection */
  onItemSelect?: (item: T, index: number) => void;

  /** Loading state */
  loading?: boolean;

  /** Empty state message */
  emptyMessage?: string;

  /** Loading placeholder renderer */
  renderLoadingItem?: () => React.ReactNode;

  /** Sticky header content */
  header?: React.ReactNode;

  /** Sticky footer content */
  footer?: React.ReactNode;
}

interface VirtualizedListState {
  scrollTop: number;
  startIndex: number;
  endIndex: number;
  visibleItems: Array<{ item: any; index: number; offset: number; height: number }>;
  totalHeight: number;
  selectedIndex: number;
}

export function VirtualizedList<T>({
  items,
  renderItem,
  itemHeight = 50,
  getItemHeight,
  height,
  width = '100%',
  overscan = 5,
  scrollToIndex,
  onScroll,
  className = '',
  enableKeyboardNavigation = false,
  onItemSelect,
  loading = false,
  emptyMessage = 'No items to display',
  renderLoadingItem,
  header,
  footer,
}: VirtualizedListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollElementRef = useRef<HTMLDivElement>(null);

  const [state, setState] = useState<VirtualizedListState>({
    scrollTop: 0,
    startIndex: 0,
    endIndex: 0,
    visibleItems: [],
    totalHeight: 0,
    selectedIndex: -1,
  });

  // Calculate item heights and offsets
  const itemMetrics = useMemo(() => {
    const metrics: Array<{ offset: number; height: number }> = [];
    let totalHeight = 0;

    for (let i = 0; i < items.length; i++) {
      const height = getItemHeight ? getItemHeight(items[i], i) : itemHeight;
      metrics.push({ offset: totalHeight, height });
      totalHeight += height;
    }

    return { metrics, totalHeight };
  }, [items, itemHeight, getItemHeight]);

  // Calculate visible range
  const calculateVisibleRange = useCallback(
    (scrollTop: number) => {
      if (itemMetrics.metrics.length === 0) {
        return { startIndex: 0, endIndex: 0, visibleItems: [] };
      }

      // Find first visible item using binary search
      let startIndex = 0;
      let endIndex = itemMetrics.metrics.length - 1;

      while (startIndex < endIndex) {
        const mid = Math.floor((startIndex + endIndex) / 2);
        const metric = itemMetrics.metrics[mid];

        if (metric.offset + metric.height <= scrollTop) {
          startIndex = mid + 1;
        } else {
          endIndex = mid;
        }
      }

      // Find last visible item
      let lastIndex = startIndex;
      let currentOffset = itemMetrics.metrics[startIndex]?.offset || 0;

      while (lastIndex < itemMetrics.metrics.length && currentOffset < scrollTop + height) {
        const metric = itemMetrics.metrics[lastIndex];
        currentOffset = metric.offset + metric.height;
        lastIndex++;
      }

      // Apply overscan
      const overscanStart = Math.max(0, startIndex - overscan);
      const overscanEnd = Math.min(itemMetrics.metrics.length - 1, lastIndex + overscan);

      // Create visible items array
      const visibleItems = [];
      for (let i = overscanStart; i <= overscanEnd; i++) {
        const metric = itemMetrics.metrics[i];
        if (metric) {
          visibleItems.push({
            item: items[i],
            index: i,
            offset: metric.offset,
            height: metric.height,
          });
        }
      }

      return {
        startIndex: overscanStart,
        endIndex: overscanEnd,
        visibleItems,
      };
    },
    [itemMetrics.metrics, items, height, overscan],
  );

  // Handle scroll
  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const scrollTop = event.currentTarget.scrollTop;
      const range = calculateVisibleRange(scrollTop);

      setState((prev) => ({
        ...prev,
        scrollTop,
        ...range,
      }));

      onScroll?.(scrollTop);
    },
    [calculateVisibleRange, onScroll],
  );

  // Update state when items change
  useEffect(() => {
    const range = calculateVisibleRange(state.scrollTop);
    setState((prev) => ({
      ...prev,
      ...range,
      totalHeight: itemMetrics.totalHeight,
    }));
  }, [itemMetrics, calculateVisibleRange, state.scrollTop]);

  // Handle scroll to index
  useEffect(() => {
    if (scrollToIndex !== undefined && scrollElementRef.current) {
      const metric = itemMetrics.metrics[scrollToIndex];
      if (metric) {
        scrollElementRef.current.scrollTop = metric.offset;
      }
    }
  }, [scrollToIndex, itemMetrics.metrics]);

  // Keyboard navigation
  useEffect(() => {
    if (!enableKeyboardNavigation || !containerRef.current) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!containerRef.current?.contains(document.activeElement)) return;

      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          setState((prev) => {
            const newIndex = Math.max(0, prev.selectedIndex - 1);
            return { ...prev, selectedIndex: newIndex };
          });
          break;

        case 'ArrowDown':
          event.preventDefault();
          setState((prev) => {
            const newIndex = Math.min(items.length - 1, prev.selectedIndex + 1);
            return { ...prev, selectedIndex: newIndex };
          });
          break;

        case 'Enter':
        case ' ':
          event.preventDefault();
          if (state.selectedIndex >= 0 && state.selectedIndex < items.length) {
            onItemSelect?.(items[state.selectedIndex], state.selectedIndex);
          }
          break;

        case 'Home':
          event.preventDefault();
          setState((prev) => ({ ...prev, selectedIndex: 0 }));
          break;

        case 'End':
          event.preventDefault();
          setState((prev) => ({ ...prev, selectedIndex: items.length - 1 }));
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enableKeyboardNavigation, items, state.selectedIndex, onItemSelect]);

  // Auto-scroll selected item into view
  useEffect(() => {
    if (enableKeyboardNavigation && state.selectedIndex >= 0 && scrollElementRef.current) {
      const metric = itemMetrics.metrics[state.selectedIndex];
      if (metric) {
        const { offset, height } = metric;
        const scrollTop = scrollElementRef.current.scrollTop;
        const containerHeight = scrollElementRef.current.clientHeight;

        if (offset < scrollTop) {
          scrollElementRef.current.scrollTop = offset;
        } else if (offset + height > scrollTop + containerHeight) {
          scrollElementRef.current.scrollTop = offset + height - containerHeight;
        }
      }
    }
  }, [state.selectedIndex, enableKeyboardNavigation, itemMetrics.metrics]);

  const containerStyle: CSSProperties = {
    height,
    width,
    position: 'relative',
    overflow: 'hidden',
  };

  const scrollContainerStyle: CSSProperties = {
    height: '100%',
    overflow: 'auto',
    position: 'relative',
  };

  const spacerStyle: CSSProperties = {
    height: itemMetrics.totalHeight,
    width: '100%',
    position: 'relative',
  };

  // Loading state
  if (loading) {
    return (
      <div
        className={`virtualized-list virtualized-list--loading ${className}`}
        style={containerStyle}
      >
        <div className="virtualized-list__loading">
          {renderLoadingItem ? (
            Array.from({ length: Math.ceil(height / itemHeight) }).map((_, i) => (
              <div key={i} style={{ height: itemHeight }}>
                {renderLoadingItem()}
              </div>
            ))
          ) : (
            <div className="virtualized-list__loading-message">
              <div className="virtualized-list__loading-spinner" />
              Loading...
            </div>
          )}
        </div>
      </div>
    );
  }

  // Empty state
  if (!loading && items.length === 0) {
    return (
      <div
        className={`virtualized-list virtualized-list--empty ${className}`}
        style={containerStyle}
      >
        <div className="virtualized-list__empty">
          <div className="virtualized-list__empty-message">{emptyMessage}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`virtualized-list ${className}`}
      style={containerStyle}
      tabIndex={enableKeyboardNavigation ? 0 : -1}
      role={enableKeyboardNavigation ? 'listbox' : undefined}
      aria-label={enableKeyboardNavigation ? 'Virtualized list' : undefined}
    >
      {/* Header */}
      {header && <div className="virtualized-list__header">{header}</div>}

      {/* Scrollable content */}
      <div ref={scrollElementRef} style={scrollContainerStyle} onScroll={handleScroll}>
        <div style={spacerStyle}>
          {state.visibleItems.map(({ item, index, offset, height }) => (
            <div
              key={index}
              className={`virtualized-list__item ${
                enableKeyboardNavigation && index === state.selectedIndex
                  ? 'virtualized-list__item--selected'
                  : ''
              }`}
              style={{
                position: 'absolute',
                top: offset,
                left: 0,
                right: 0,
                height,
                minHeight: height,
              }}
              role={enableKeyboardNavigation ? 'option' : undefined}
              aria-selected={enableKeyboardNavigation ? index === state.selectedIndex : undefined}
              onClick={() => {
                if (enableKeyboardNavigation) {
                  setState((prev) => ({ ...prev, selectedIndex: index }));
                }
                onItemSelect?.(item, index);
              }}
            >
              {renderItem(item, index, index >= state.startIndex && index <= state.endIndex)}
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      {footer && <div className="virtualized-list__footer">{footer}</div>}
    </div>
  );
}

/**
 * Hook for managing virtual list state
 */
export function useVirtualizedList<T>(items: T[], _itemHeight: number = 50) {
  const [scrollToIndex, setScrollToIndex] = useState<number | undefined>();
  const [selectedItem, setSelectedItem] = useState<T | null>(null);

  const scrollToItem = useCallback((index: number) => {
    setScrollToIndex(index);
  }, []);

  const selectItem = useCallback((item: T, _index: number) => {
    setSelectedItem(item);
  }, []);

  const findItemIndex = useCallback(
    (predicate: (item: T) => boolean) => {
      return items.findIndex(predicate);
    },
    [items],
  );

  return {
    scrollToIndex,
    selectedItem,
    scrollToItem,
    selectItem,
    findItemIndex,
  };
}

export default VirtualizedList;
