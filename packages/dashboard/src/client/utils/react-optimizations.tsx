/**
 * React Performance Optimization Utilities
 *
 * Provides utilities and HOCs for optimizing React component performance
 * in organizational dashboard components with expensive computations.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';

/**
 * Deep comparison for React.memo when props contain objects or arrays
 */
export function deepCompareProps<T extends Record<string, any>>(
  prevProps: T,
  nextProps: T,
): boolean {
  const prevKeys = Object.keys(prevProps);
  const nextKeys = Object.keys(nextProps);

  if (prevKeys.length !== nextKeys.length) {
    return false;
  }

  for (const key of prevKeys) {
    if (!nextKeys.includes(key)) {
      return false;
    }

    const prevValue = prevProps[key];
    const nextValue = nextProps[key];

    if (prevValue === nextValue) {
      continue;
    }

    // Handle arrays
    if (Array.isArray(prevValue) && Array.isArray(nextValue)) {
      if (prevValue.length !== nextValue.length) {
        return false;
      }
      for (let i = 0; i < prevValue.length; i++) {
        if (prevValue[i] !== nextValue[i]) {
          return false;
        }
      }
      continue;
    }

    // Handle objects (shallow comparison for performance)
    if (
      typeof prevValue === 'object' &&
      typeof nextValue === 'object' &&
      prevValue !== null &&
      nextValue !== null
    ) {
      const prevObjKeys = Object.keys(prevValue);
      const nextObjKeys = Object.keys(nextValue);

      if (prevObjKeys.length !== nextObjKeys.length) {
        return false;
      }

      for (const objKey of prevObjKeys) {
        if (prevValue[objKey] !== nextValue[objKey]) {
          return false;
        }
      }
      continue;
    }

    return false;
  }

  return true;
}

/**
 * HOC for memoizing components with deep prop comparison
 */
export function withDeepMemo<P extends object>(
  Component: React.ComponentType<P>,
): React.ComponentType<P> {
  return memo(Component, deepCompareProps);
}

/**
 * Hook for memoizing expensive computations with dependency tracking
 */
export function useExpensiveMemo<T>(
  factory: () => T,
  deps: React.DependencyList,
  debugName?: string,
): T {
  const memoized = useMemo(() => {
    if (debugName && process.env.NODE_ENV === 'development') {
      console.time(`Expensive computation: ${debugName}`);
    }

    const result = factory();

    if (debugName && process.env.NODE_ENV === 'development') {
      console.timeEnd(`Expensive computation: ${debugName}`);
    }

    return result;
  }, deps);

  return memoized;
}

/**
 * Hook for stable callback references with dependency optimization
 */
export function useStableCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps: React.DependencyList,
): T {
  return useCallback(callback, deps);
}

/**
 * Hook for memoizing object props to prevent unnecessary re-renders
 */
export function useMemoizedProps<T extends Record<string, any>>(props: T): T {
  return useMemo(() => props, Object.values(props));
}

/**
 * Hook for performance monitoring of component renders
 */
export function useRenderPerformance(componentName: string, props?: any) {
  const renderCount = useRef(0);
  const lastRenderTime = useRef(Date.now());

  useEffect(() => {
    renderCount.current += 1;
    const now = Date.now();
    const timeSinceLastRender = now - lastRenderTime.current;
    lastRenderTime.current = now;

    if (process.env.NODE_ENV === 'development') {
      console.debug(
        `[${componentName}] Render #${renderCount.current}, ${timeSinceLastRender}ms since last render`,
        props,
      );
    }
  });

  return {
    renderCount: renderCount.current,
    reset: () => {
      renderCount.current = 0;
    },
  };
}

/**
 * Component for measuring render performance
 */
interface RenderProfilerProps {
  id: string;
  children: React.ReactNode;
  onRender?: (id: string, phase: 'mount' | 'update', actualDuration: number) => void;
}

export const RenderProfiler: React.FC<RenderProfilerProps> = memo(({ id, children, onRender }) => {
  return (
    <React.Profiler
      id={id}
      onRender={(id, phase, actualDuration) => {
        if (process.env.NODE_ENV === 'development') {
          console.debug(`[Profiler ${id}] ${phase} took ${actualDuration}ms`);
        }
        onRender?.(id, phase, actualDuration);
      }}
    >
      {children}
    </React.Profiler>
  );
});

/**
 * Optimized list item component for virtual lists
 */
interface OptimizedListItemProps<T> {
  item: T;
  index: number;
  isSelected?: boolean;
  isVisible?: boolean;
  onClick?: (item: T, index: number) => void;
  renderItem: (item: T, index: number) => React.ReactNode;
  className?: string;
}

export const OptimizedListItem = memo(
  <T,>({
    item,
    index,
    isSelected = false,
    isVisible = true,
    onClick,
    renderItem,
    className = '',
  }: OptimizedListItemProps<T>) => {
    const handleClick = useStableCallback(() => {
      onClick?.(item, index);
    }, [onClick, item, index]);

    // Only render content when visible for performance
    const content = useMemo(() => {
      return isVisible ? renderItem(item, index) : null;
    }, [item, index, isVisible, renderItem]);

    return (
      <div
        className={`optimized-list-item ${isSelected ? 'selected' : ''} ${className}`}
        onClick={handleClick}
        role="listitem"
        aria-selected={isSelected}
        data-index={index}
      >
        {content}
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison for performance
    return (
      prevProps.item === nextProps.item &&
      prevProps.index === nextProps.index &&
      prevProps.isSelected === nextProps.isSelected &&
      prevProps.isVisible === nextProps.isVisible &&
      prevProps.className === nextProps.className &&
      prevProps.onClick === nextProps.onClick &&
      prevProps.renderItem === nextProps.renderItem
    );
  },
);

/**
 * Throttled component updater for high-frequency updates
 */
export function useThrottledUpdates<T>(value: T, delay: number = 100): T {
  const [throttledValue, setThrottledValue] = React.useState(value);
  const lastUpdateTime = useRef(0);
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateTime.current;

    if (timeSinceLastUpdate >= delay) {
      // Update immediately if enough time has passed
      setThrottledValue(value);
      lastUpdateTime.current = now;
    } else {
      // Schedule update for later
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        setThrottledValue(value);
        lastUpdateTime.current = Date.now();
      }, delay - timeSinceLastUpdate);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, delay]);

  return throttledValue;
}

/**
 * Debounced state hook for input fields and search
 */
export function useDebouncedState<T>(
  initialValue: T,
  delay: number = 300,
): [T, T, (value: T) => void] {
  const [value, setValue] = React.useState(initialValue);
  const [debouncedValue, setDebouncedValue] = React.useState(initialValue);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const updateValue = useCallback(
    (newValue: T) => {
      setValue(newValue);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        setDebouncedValue(newValue);
      }, delay);
    },
    [delay],
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return [value, debouncedValue, updateValue];
}

/**
 * Intersection observer hook for lazy loading
 */
export function useIntersectionObserver(
  ref: React.RefObject<Element>,
  options?: IntersectionObserverInit,
): boolean {
  const [isIntersecting, setIsIntersecting] = React.useState(false);

  useEffect(() => {
    if (!ref.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsIntersecting(entry.isIntersecting);
      },
      {
        threshold: 0.1,
        ...options,
      },
    );

    observer.observe(ref.current);

    return () => observer.disconnect();
  }, [ref, options]);

  return isIntersecting;
}

/**
 * Hook for measuring component dimensions
 */
export function useComponentSize(): [
  React.RefObject<HTMLDivElement>,
  { width: number; height: number },
] {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!ref.current) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(ref.current);

    return () => observer.disconnect();
  }, []);

  return [ref, size];
}

/**
 * Performance optimization wrapper for expensive components
 */
interface OptimizedWrapperProps {
  children: React.ReactNode;
  shouldUpdate?: (prevProps: any, nextProps: any) => boolean;
  debugName?: string;
}

export const OptimizedWrapper = memo<OptimizedWrapperProps>(
  ({ children, debugName = 'OptimizedWrapper' }) => {
    useRenderPerformance(debugName);

    return <>{children}</>;
  },
  (prevProps, nextProps) => {
    if (prevProps.shouldUpdate) {
      return !prevProps.shouldUpdate(prevProps, nextProps);
    }
    return prevProps.children === nextProps.children;
  },
);

/**
 * Factory for creating optimized list components
 */
export function createOptimizedList<T>() {
  return memo<{
    items: T[];
    renderItem: (item: T, index: number) => React.ReactNode;
    keyExtractor?: (item: T, index: number) => string;
    className?: string;
  }>(
    ({ items, renderItem, keyExtractor, className }) => {
      const memoizedItems = useMemo(() => {
        return items.map((item, index) => ({
          item,
          index,
          key: keyExtractor ? keyExtractor(item, index) : index,
        }));
      }, [items, keyExtractor]);

      return (
        <div className={className}>
          {memoizedItems.map(({ item, index, key }) => (
            <OptimizedListItem
              key={key}
              item={item}
              index={index}
              renderItem={renderItem}
              isVisible={true}
            />
          ))}
        </div>
      );
    },
    (prevProps, nextProps) => {
      return (
        prevProps.items === nextProps.items &&
        prevProps.renderItem === nextProps.renderItem &&
        prevProps.keyExtractor === nextProps.keyExtractor &&
        prevProps.className === nextProps.className
      );
    },
  );
}

/**
 * Development-only performance monitoring component
 */
export const PerformanceMonitor: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (process.env.NODE_ENV !== 'development') {
    return <>{children}</>;
  }

  return (
    <RenderProfiler
      id="PerformanceMonitor"
      onRender={(id, phase, actualDuration) => {
        if (actualDuration > 16) {
          // More than one frame (60fps)
          console.warn(`Slow render detected: ${id} took ${actualDuration}ms in ${phase} phase`);
        }
      }}
    >
      {children}
    </RenderProfiler>
  );
};
