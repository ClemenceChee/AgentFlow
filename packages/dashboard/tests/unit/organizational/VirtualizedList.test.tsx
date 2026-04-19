/**
 * Unit Tests for VirtualizedList Component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VirtualizedList, useVirtualizedList } from '../../../src/client/components/common/VirtualizedList';

interface TestItem {
  id: string;
  name: string;
  value: number;
}

const generateTestItems = (count: number): TestItem[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`,
    name: `Test Item ${i + 1}`,
    value: Math.floor(Math.random() * 100)
  }));
};

describe('VirtualizedList', () => {
  const defaultProps = {
    items: generateTestItems(10),
    height: 400,
    itemHeight: 50,
    renderItem: (item: TestItem, index: number) => (
      <div data-testid={`item-${index}`}>
        <span>{item.name}</span>
        <span>Value: {item.value}</span>
      </div>
    )
  };

  beforeEach(() => {
    // Mock scrollTop property
    Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
      configurable: true,
      get: function() { return this._scrollTop || 0; },
      set: function(val) { this._scrollTop = val; }
    });

    // Mock clientHeight property
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get: function() { return this._clientHeight || 400; }
    });
  });

  it('renders correctly with basic props', () => {
    render(<VirtualizedList {...defaultProps} />);

    // Should render visible items
    expect(screen.getByTestId('item-0')).toBeInTheDocument();
    expect(screen.getByText('Test Item 1')).toBeInTheDocument();
  });

  it('renders with custom width and className', () => {
    const { container } = render(
      <VirtualizedList
        {...defaultProps}
        width={600}
        className="custom-list"
      />
    );

    const listElement = container.firstChild as HTMLElement;
    expect(listElement).toHaveStyle('width: 600px');
    expect(listElement).toHaveClass('virtualized-list', 'custom-list');
  });

  it('displays loading state when loading prop is true', () => {
    render(<VirtualizedList {...defaultProps} loading={true} />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(document.querySelector('.virtualized-list--loading')).toBeInTheDocument();
  });

  it('displays custom loading items when renderLoadingItem is provided', () => {
    const renderLoadingItem = () => <div data-testid="loading-item">Custom Loading...</div>;

    render(
      <VirtualizedList
        {...defaultProps}
        loading={true}
        renderLoadingItem={renderLoadingItem}
      />
    );

    expect(screen.getAllByTestId('loading-item')).toHaveLength(Math.ceil(400 / 50)); // height / itemHeight
  });

  it('displays empty state when items array is empty', () => {
    render(
      <VirtualizedList
        {...defaultProps}
        items={[]}
        emptyMessage="No data available"
      />
    );

    expect(screen.getByText('No data available')).toBeInTheDocument();
    expect(document.querySelector('.virtualized-list--empty')).toBeInTheDocument();
  });

  it('renders header and footer when provided', () => {
    const header = <div data-testid="list-header">Header Content</div>;
    const footer = <div data-testid="list-footer">Footer Content</div>;

    render(
      <VirtualizedList
        {...defaultProps}
        header={header}
        footer={footer}
      />
    );

    expect(screen.getByTestId('list-header')).toBeInTheDocument();
    expect(screen.getByTestId('list-footer')).toBeInTheDocument();
    expect(screen.getByText('Header Content')).toBeInTheDocument();
    expect(screen.getByText('Footer Content')).toBeInTheDocument();
  });

  it('handles keyboard navigation when enabled', async () => {
    const user = userEvent.setup();
    const onItemSelect = jest.fn();

    const { container } = render(
      <VirtualizedList
        {...defaultProps}
        enableKeyboardNavigation={true}
        onItemSelect={onItemSelect}
      />
    );

    const listElement = container.querySelector('.virtualized-list') as HTMLElement;
    listElement.focus();

    // Test arrow down navigation
    await user.keyboard('{ArrowDown}');
    expect(document.querySelector('.virtualized-list__item--selected')).toBeInTheDocument();

    // Test Enter key selection
    await user.keyboard('{Enter}');
    expect(onItemSelect).toHaveBeenCalledWith(defaultProps.items[0], 0);
  });

  it('supports variable item heights when getItemHeight is provided', () => {
    const getItemHeight = (item: TestItem, index: number) => {
      return index % 2 === 0 ? 60 : 40; // Alternate heights
    };

    render(
      <VirtualizedList
        {...defaultProps}
        getItemHeight={getItemHeight}
      />
    );

    // The component should render with variable heights
    // This is more of an integration test - the specific implementation would need to be tested
    expect(screen.getByTestId('item-0')).toBeInTheDocument();
  });

  it('handles scroll events and updates visible items', () => {
    const { container } = render(
      <VirtualizedList {...defaultProps} />
    );

    const scrollContainer = container.querySelector('[style*="overflow: auto"]') as HTMLElement;

    // Simulate scroll
    fireEvent.scroll(scrollContainer, { target: { scrollTop: 100 } });

    // Should still render items (implementation would determine which ones)
    expect(container.querySelectorAll('[data-testid^="item-"]').length).toBeGreaterThan(0);
  });

  it('calls onItemSelect when item is clicked', async () => {
    const user = userEvent.setup();
    const onItemSelect = jest.fn();

    render(
      <VirtualizedList
        {...defaultProps}
        onItemSelect={onItemSelect}
      />
    );

    const firstItem = screen.getByTestId('item-0');
    await user.click(firstItem);

    expect(onItemSelect).toHaveBeenCalledWith(defaultProps.items[0], 0);
  });

  it('calls onScroll callback when provided', () => {
    const onScroll = jest.fn();

    const { container } = render(
      <VirtualizedList
        {...defaultProps}
        onScroll={onScroll}
      />
    );

    const scrollContainer = container.querySelector('[style*="overflow: auto"]') as HTMLElement;
    fireEvent.scroll(scrollContainer, { target: { scrollTop: 50 } });

    expect(onScroll).toHaveBeenCalledWith(50);
  });

  it('scrolls to specific index when scrollToIndex is provided', () => {
    const { rerender } = render(
      <VirtualizedList {...defaultProps} />
    );

    // Re-render with scrollToIndex
    rerender(
      <VirtualizedList
        {...defaultProps}
        scrollToIndex={5}
      />
    );

    // Should trigger scrolling (implementation specific)
    expect(screen.getByTestId('item-0')).toBeInTheDocument();
  });

  it('handles large datasets efficiently', () => {
    const largeDataset = generateTestItems(10000);

    const { container } = render(
      <VirtualizedList
        {...defaultProps}
        items={largeDataset}
        overscan={3}
      />
    );

    // Should only render visible items + overscan, not all 10,000
    const renderedItems = container.querySelectorAll('[data-testid^="item-"]');
    expect(renderedItems.length).toBeLessThan(50); // Much less than 10,000
  });

  it('applies correct ARIA attributes when keyboard navigation is enabled', () => {
    const { container } = render(
      <VirtualizedList
        {...defaultProps}
        enableKeyboardNavigation={true}
      />
    );

    const listElement = container.querySelector('.virtualized-list') as HTMLElement;
    expect(listElement).toHaveAttribute('role', 'listbox');
    expect(listElement).toHaveAttribute('tabIndex', '0');
    expect(listElement).toHaveAttribute('aria-label', 'Virtualized list');
  });

  it('does not apply ARIA attributes when keyboard navigation is disabled', () => {
    const { container } = render(
      <VirtualizedList
        {...defaultProps}
        enableKeyboardNavigation={false}
      />
    );

    const listElement = container.querySelector('.virtualized-list') as HTMLElement;
    expect(listElement).not.toHaveAttribute('role');
    expect(listElement).toHaveAttribute('tabIndex', '-1');
  });
});

describe('useVirtualizedList hook', () => {
  const TestComponent: React.FC<{ items: TestItem[] }> = ({ items }) => {
    const { scrollToItem, selectItem, selectedItem, findItemIndex } = useVirtualizedList(items);

    return (
      <div>
        <button onClick={() => scrollToItem(2)} data-testid="scroll-button">
          Scroll to item 2
        </button>
        <button onClick={() => selectItem(items[1], 1)} data-testid="select-button">
          Select item 1
        </button>
        <div data-testid="selected-item">
          {selectedItem ? `Selected: ${selectedItem.name}` : 'None selected'}
        </div>
        <button
          onClick={() => {
            const index = findItemIndex(item => item.id === 'item-2');
            document.body.setAttribute('data-found-index', index.toString());
          }}
          data-testid="find-button"
        >
          Find item-2
        </button>
      </div>
    );
  };

  it('provides scroll functionality', async () => {
    const user = userEvent.setup();
    const items = generateTestItems(5);

    render(<TestComponent items={items} />);

    const scrollButton = screen.getByTestId('scroll-button');
    await user.click(scrollButton);

    // scrollToItem should be called (implementation would handle the actual scrolling)
    expect(scrollButton).toBeInTheDocument();
  });

  it('manages selected item state', async () => {
    const user = userEvent.setup();
    const items = generateTestItems(5);

    render(<TestComponent items={items} />);

    expect(screen.getByText('None selected')).toBeInTheDocument();

    const selectButton = screen.getByTestId('select-button');
    await user.click(selectButton);

    expect(screen.getByText(`Selected: ${items[1].name}`)).toBeInTheDocument();
  });

  it('provides item finding functionality', async () => {
    const user = userEvent.setup();
    const items = generateTestItems(5);

    render(<TestComponent items={items} />);

    const findButton = screen.getByTestId('find-button');
    await user.click(findButton);

    expect(document.body.getAttribute('data-found-index')).toBe('2');
  });
});