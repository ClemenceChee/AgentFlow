/**
 * Organizational Context Provider
 *
 * Manages organizational context state including team filtering,
 * operator context, and organizational intelligence data across
 * the dashboard application.
 */

import { createContext, type ReactNode, useCallback, useContext, useReducer } from 'react';
import type { OrganizationalIntelligence, TeamFilterState } from '../types/organizational.js';

// Context State Interface
interface OrganizationalContextState {
  // Team filtering state
  teamFilter: TeamFilterState;

  // Current operator context (if available)
  currentOperator?: {
    operatorId: string;
    allowedTeams: string[];
    isSuperUser: boolean;
  };

  // Organizational intelligence summary
  intelligence?: OrganizationalIntelligence;

  // Loading states
  loading: {
    teams: boolean;
    intelligence: boolean;
  };

  // Error states
  errors: {
    teams?: string;
    intelligence?: string;
  };
}

// Action Types
type OrganizationalContextAction =
  | { type: 'SET_TEAM_FILTER'; payload: string }
  | { type: 'SET_AVAILABLE_TEAMS'; payload: TeamFilterState['availableTeams'] }
  | { type: 'SET_CURRENT_OPERATOR'; payload: OrganizationalContextState['currentOperator'] }
  | { type: 'SET_INTELLIGENCE'; payload: OrganizationalIntelligence }
  | {
      type: 'SET_LOADING';
      payload: { key: keyof OrganizationalContextState['loading']; value: boolean };
    }
  | {
      type: 'SET_ERROR';
      payload: { key: keyof OrganizationalContextState['errors']; value?: string };
    }
  | { type: 'CLEAR_FILTER' }
  | { type: 'RESET_STATE' };

// Initial State
const initialState: OrganizationalContextState = {
  teamFilter: {
    selectedTeamId: undefined,
    availableTeams: [],
    filterActive: false,
  },
  loading: {
    teams: false,
    intelligence: false,
  },
  errors: {},
};

// Reducer
function organizationalContextReducer(
  state: OrganizationalContextState,
  action: OrganizationalContextAction,
): OrganizationalContextState {
  switch (action.type) {
    case 'SET_TEAM_FILTER':
      return {
        ...state,
        teamFilter: {
          ...state.teamFilter,
          selectedTeamId: action.payload || undefined,
          filterActive: !!action.payload,
        },
      };

    case 'SET_AVAILABLE_TEAMS':
      return {
        ...state,
        teamFilter: {
          ...state.teamFilter,
          availableTeams: action.payload,
        },
      };

    case 'SET_CURRENT_OPERATOR':
      return {
        ...state,
        currentOperator: action.payload,
      };

    case 'SET_INTELLIGENCE':
      return {
        ...state,
        intelligence: action.payload,
      };

    case 'SET_LOADING':
      return {
        ...state,
        loading: {
          ...state.loading,
          [action.payload.key]: action.payload.value,
        },
      };

    case 'SET_ERROR':
      return {
        ...state,
        errors: {
          ...state.errors,
          [action.payload.key]: action.payload.value,
        },
      };

    case 'CLEAR_FILTER':
      return {
        ...state,
        teamFilter: {
          ...state.teamFilter,
          selectedTeamId: undefined,
          filterActive: false,
        },
      };

    case 'RESET_STATE':
      return initialState;

    default:
      return state;
  }
}

// Context Interface
interface OrganizationalContextInterface {
  state: OrganizationalContextState;

  // Team filtering actions
  setTeamFilter: (teamId: string) => void;
  clearTeamFilter: () => void;
  refreshTeams: () => Promise<void>;

  // Organizational intelligence actions
  refreshIntelligence: () => Promise<void>;

  // Utility functions
  isTeamAccessible: (teamId: string) => boolean;
  getCurrentTeamContext: () => { teamId?: string; teamName?: string } | null;

  // Reset function
  reset: () => void;
}

// Create Context
const OrganizationalContext = createContext<OrganizationalContextInterface | null>(null);

// Provider Props
interface OrganizationalContextProviderProps {
  children: ReactNode;
}

// Provider Component
export function OrganizationalContextProvider({ children }: OrganizationalContextProviderProps) {
  const [state, dispatch] = useReducer(organizationalContextReducer, initialState);

  // Set team filter
  const setTeamFilter = useCallback((teamId: string) => {
    dispatch({ type: 'SET_TEAM_FILTER', payload: teamId });
  }, []);

  // Clear team filter
  const clearTeamFilter = useCallback(() => {
    dispatch({ type: 'CLEAR_FILTER' });
  }, []);

  // Refresh teams from API
  const refreshTeams = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: { key: 'teams', value: true } });
    dispatch({ type: 'SET_ERROR', payload: { key: 'teams', value: undefined } });

    try {
      const response = await fetch('/api/teams');
      if (!response.ok) {
        throw new Error(`Failed to fetch teams: ${response.statusText}`);
      }

      const data = await response.json();
      dispatch({ type: 'SET_AVAILABLE_TEAMS', payload: data.teams });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load teams';
      dispatch({ type: 'SET_ERROR', payload: { key: 'teams', value: errorMessage } });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: { key: 'teams', value: false } });
    }
  }, []);

  // Refresh organizational intelligence from API
  const refreshIntelligence = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: { key: 'intelligence', value: true } });
    dispatch({ type: 'SET_ERROR', payload: { key: 'intelligence', value: undefined } });

    try {
      const response = await fetch('/api/stats');
      if (!response.ok) {
        throw new Error(`Failed to fetch intelligence: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.organizationalIntelligence) {
        dispatch({ type: 'SET_INTELLIGENCE', payload: data.organizationalIntelligence });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to load organizational intelligence';
      dispatch({ type: 'SET_ERROR', payload: { key: 'intelligence', value: errorMessage } });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: { key: 'intelligence', value: false } });
    }
  }, []);

  // Check if team is accessible to current operator
  const isTeamAccessible = useCallback(
    (teamId: string): boolean => {
      if (!state.currentOperator) return true; // No restrictions if no operator context
      if (state.currentOperator.isSuperUser) return true; // Super users can access all teams
      return state.currentOperator.allowedTeams.includes(teamId);
    },
    [state.currentOperator],
  );

  // Get current team context
  const getCurrentTeamContext = useCallback((): { teamId?: string; teamName?: string } | null => {
    if (!state.teamFilter.filterActive || !state.teamFilter.selectedTeamId) {
      return null;
    }

    const selectedTeam = state.teamFilter.availableTeams.find(
      (team) => team.teamId === state.teamFilter.selectedTeamId,
    );

    return selectedTeam
      ? {
          teamId: selectedTeam.teamId,
          teamName: selectedTeam.teamName,
        }
      : null;
  }, [state.teamFilter]);

  // Reset all state
  const reset = useCallback(() => {
    dispatch({ type: 'RESET_STATE' });
  }, []);

  const contextValue: OrganizationalContextInterface = {
    state,
    setTeamFilter,
    clearTeamFilter,
    refreshTeams,
    refreshIntelligence,
    isTeamAccessible,
    getCurrentTeamContext,
    reset,
  };

  return (
    <OrganizationalContext.Provider value={contextValue}>{children}</OrganizationalContext.Provider>
  );
}

// Custom Hook
export function useOrganizationalContext(): OrganizationalContextInterface {
  const context = useContext(OrganizationalContext);
  if (!context) {
    throw new Error(
      'useOrganizationalContext must be used within an OrganizationalContextProvider',
    );
  }
  return context;
}

// Export types for external use
export type { OrganizationalContextInterface, OrganizationalContextState };
