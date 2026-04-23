import { useEffect, useRef, useState } from 'react';
import { useOrganizationalSearch } from '../../../context/OrganizationalSearchProvider';

interface Props {
  readonly onResultSelect?: (result: any) => void;
  readonly placeholder?: string;
  readonly className?: string;
  readonly compact?: boolean;
}

export function OrganizationalGlobalSearch({
  onResultSelect,
  placeholder = 'Search teams, operators, sessions...',
  className = '',
  compact = false,
}: Props) {
  const { query, results, filters, setQuery, setFilters, clearSearch } = useOrganizationalSearch();

  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close search on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen || results.length === 0) return;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setSelectedIndex((prev) => Math.min(results.length - 1, prev + 1));
          break;
        case 'ArrowUp':
          event.preventDefault();
          setSelectedIndex((prev) => Math.max(-1, prev - 1));
          break;
        case 'Enter':
          event.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < results.length) {
            handleSelectResult(results[selectedIndex]);
          }
          break;
        case 'Escape':
          event.preventDefault();
          setIsOpen(false);
          setSelectedIndex(-1);
          inputRef.current?.blur();
          break;
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex, handleSelectResult]);

  const handleInputChange = (value: string) => {
    setQuery(value);
    setIsOpen(value.length > 0);
    setSelectedIndex(-1);
  };

  const handleSelectResult = (result: any) => {
    onResultSelect?.(result);
    setIsOpen(false);
    setSelectedIndex(-1);
    if (!compact) {
      setQuery(''); // Clear search in full mode
    }
  };

  const handleClearSearch = () => {
    clearSearch();
    setIsOpen(false);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  };

  const getResultIcon = (type: string) => {
    switch (type) {
      case 'team':
        return '🏢';
      case 'operator':
        return '👤';
      case 'session':
        return '🔗';
      case 'policy':
        return '⚖️';
      case 'performance':
        return '⚡';
      case 'activity':
        return '📊';
      default:
        return '📋';
    }
  };

  const getResultTypeLabel = (type: string) => {
    switch (type) {
      case 'team':
        return 'Team';
      case 'operator':
        return 'Operator';
      case 'session':
        return 'Session';
      case 'policy':
        return 'Policy';
      case 'performance':
        return 'Performance';
      case 'activity':
        return 'Activity';
      default:
        return 'Item';
    }
  };

  return (
    <div
      ref={searchRef}
      className={`org-global-search ${compact ? 'org-global-search--compact' : ''} ${className}`}
    >
      <div className="org-global-search-input-container">
        <span className="org-global-search-icon" aria-hidden="true">
          🔍
        </span>
        <input
          ref={inputRef}
          type="text"
          className="org-global-search-input"
          placeholder={placeholder}
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => query.length > 0 && setIsOpen(true)}
          aria-label="Global organizational search"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        />
        {query && (
          <button
            type="button"
            className="org-global-search-clear"
            onClick={handleClearSearch}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
        {!compact && (
          <div className="org-global-search-shortcut">
            <kbd>Ctrl</kbd>+<kbd>K</kbd>
          </div>
        )}
      </div>

      {isOpen && (
        <div className="org-global-search-dropdown">
          {results.length === 0 ? (
            <div className="org-global-search-no-results">
              <span className="org-global-search-no-results-icon">🔍</span>
              <div className="org-global-search-no-results-text">
                <div>No results found</div>
                <div>Try searching for teams, operators, or sessions</div>
              </div>
            </div>
          ) : (
            <>
              <div className="org-global-search-results-header">
                <span>
                  {results.length} result{results.length !== 1 ? 's' : ''}
                </span>
                {Object.keys(filters).length > 0 && (
                  <button
                    type="button"
                    className="org-global-search-clear-filters"
                    onClick={() => setFilters({})}
                  >
                    Clear filters
                  </button>
                )}
              </div>
              <div className="org-global-search-results" role="listbox">
                {results.map((result, index) => (
                  <button
                    key={result.id}
                    type="button"
                    className={`org-global-search-result ${selectedIndex === index ? 'org-selected' : ''}`}
                    onClick={() => handleSelectResult(result)}
                    role="option"
                    aria-selected={selectedIndex === index}
                  >
                    <div className="org-global-search-result-icon">
                      {getResultIcon(result.type)}
                    </div>
                    <div className="org-global-search-result-content">
                      <div className="org-global-search-result-title">
                        {result.title}
                        <span className="org-global-search-result-type">
                          {getResultTypeLabel(result.type)}
                        </span>
                      </div>
                      <div className="org-global-search-result-description">
                        {result.description}
                      </div>
                    </div>
                    <div className="org-global-search-result-relevance">
                      <div
                        className="org-global-search-relevance-bar"
                        style={{ width: `${result.relevance * 100}%` }}
                      />
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
