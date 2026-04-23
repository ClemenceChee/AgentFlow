import type React from 'react';
import { createContext, useContext, useMemo, useState } from 'react';

export interface SearchFilters {
  readonly teams?: string[];
  readonly operators?: string[];
  readonly timeRange?: 'last-hour' | 'last-day' | 'last-week' | 'last-month';
  readonly status?: 'active' | 'inactive' | 'all';
  readonly categories?: string[];
}

export interface SearchResult {
  readonly id: string;
  readonly type: 'team' | 'operator' | 'session' | 'policy' | 'performance' | 'activity';
  readonly title: string;
  readonly description: string;
  readonly metadata: Record<string, any>;
  readonly relevance: number;
  readonly category: string;
}

interface OrganizationalSearchContextType {
  readonly query: string;
  readonly filters: SearchFilters;
  readonly results: SearchResult[];
  readonly isSearching: boolean;
  readonly setQuery: (query: string) => void;
  readonly setFilters: (filters: SearchFilters) => void;
  readonly clearSearch: () => void;
  readonly searchGlobal: (query: string, filters?: SearchFilters) => SearchResult[];
}

const OrganizationalSearchContext = createContext<OrganizationalSearchContextType | null>(null);

export function useOrganizationalSearch() {
  const context = useContext(OrganizationalSearchContext);
  if (!context) {
    throw new Error('useOrganizationalSearch must be used within OrganizationalSearchProvider');
  }
  return context;
}

interface Props {
  readonly children: React.ReactNode;
}

// Mock data for search - in real implementation, this would come from APIs
const mockSearchData: SearchResult[] = [
  // Teams
  {
    id: 'team-engineering',
    type: 'team',
    title: 'Engineering Team',
    description: '12 active operators, 95% performance rate',
    metadata: { memberCount: 12, performanceRate: 0.95 },
    relevance: 1.0,
    category: 'teams',
  },
  {
    id: 'team-product',
    type: 'team',
    title: 'Product Team',
    description: '8 active operators, 87% performance rate',
    metadata: { memberCount: 8, performanceRate: 0.87 },
    relevance: 0.9,
    category: 'teams',
  },

  // Operators
  {
    id: 'operator-alice',
    type: 'operator',
    title: 'Alice Johnson',
    description: 'Engineering Team • 156 sessions this week',
    metadata: { team: 'Engineering', sessionCount: 156, efficiency: 0.92 },
    relevance: 0.95,
    category: 'operators',
  },
  {
    id: 'operator-bob',
    type: 'operator',
    title: 'Bob Smith',
    description: 'Product Team • 89 sessions this week',
    metadata: { team: 'Product', sessionCount: 89, efficiency: 0.88 },
    relevance: 0.85,
    category: 'operators',
  },

  // Sessions
  {
    id: 'session-correlation-analysis',
    type: 'session',
    title: 'Cross-team Collaboration Analysis',
    description: 'High correlation score: 0.87 • 23 related sessions',
    metadata: { correlationScore: 0.87, relatedCount: 23 },
    relevance: 0.9,
    category: 'sessions',
  },

  // Policies
  {
    id: 'policy-data-governance',
    type: 'policy',
    title: 'Data Governance Policy',
    description: '98% compliance rate • Last updated 2 days ago',
    metadata: { complianceRate: 0.98, lastUpdated: '2 days ago' },
    relevance: 0.85,
    category: 'policies',
  },

  // Performance
  {
    id: 'perf-cache-optimization',
    type: 'performance',
    title: 'Cache Optimization Opportunity',
    description: 'Potential 15% performance improvement identified',
    metadata: { improvementPotential: 0.15, priority: 'high' },
    relevance: 0.8,
    category: 'performance',
  },

  // Activity patterns
  {
    id: 'activity-workflow-pattern',
    type: 'activity',
    title: 'Repetitive Workflow Pattern',
    description: 'Pattern identified in 34% of engineering sessions',
    metadata: { frequency: 0.34, team: 'Engineering' },
    relevance: 0.75,
    category: 'activity',
  },
];

export function OrganizationalSearchProvider({ children }: Props) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({});
  const [isSearching, _setIsSearching] = useState(false);

  const searchGlobal = (searchQuery: string, searchFilters: SearchFilters = {}) => {
    if (!searchQuery.trim()) return [];

    const queryLower = searchQuery.toLowerCase();
    let filteredResults = mockSearchData;

    // Apply text search
    filteredResults = filteredResults.filter(
      (result) =>
        result.title.toLowerCase().includes(queryLower) ||
        result.description.toLowerCase().includes(queryLower) ||
        result.category.toLowerCase().includes(queryLower),
    );

    // Apply filters
    if (searchFilters.teams && searchFilters.teams.length > 0) {
      filteredResults = filteredResults.filter(
        (result) => !result.metadata.team || searchFilters.teams?.includes(result.metadata.team),
      );
    }

    if (searchFilters.categories && searchFilters.categories.length > 0) {
      filteredResults = filteredResults.filter((result) =>
        searchFilters.categories?.includes(result.category),
      );
    }

    if (searchFilters.status && searchFilters.status !== 'all') {
      filteredResults = filteredResults.filter((result) => {
        // Mock status filtering logic
        if (result.type === 'operator') {
          return searchFilters.status === 'active'
            ? result.metadata.sessionCount > 50
            : result.metadata.sessionCount <= 50;
        }
        return true;
      });
    }

    // Sort by relevance
    return filteredResults.sort((a, b) => b.relevance - a.relevance);
  };

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return searchGlobal(query, filters);
  }, [query, filters, searchGlobal]);

  const clearSearch = () => {
    setQuery('');
    setFilters({});
  };

  const contextValue: OrganizationalSearchContextType = {
    query,
    filters,
    results,
    isSearching,
    setQuery,
    setFilters,
    clearSearch,
    searchGlobal,
  };

  return (
    <OrganizationalSearchContext.Provider value={contextValue}>
      {children}
    </OrganizationalSearchContext.Provider>
  );
}
