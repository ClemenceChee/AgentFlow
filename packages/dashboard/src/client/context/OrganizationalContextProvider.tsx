import { createContext, type ReactNode, useContext, useState } from 'react';

export interface TeamFilter {
  readonly id: string;
  readonly name: string;
  readonly selected: boolean;
}

export interface OrganizationalContextType {
  readonly selectedTeams: string[];
  readonly teamFilters: TeamFilter[];
  readonly setSelectedTeams: (teams: string[]) => void;
  readonly toggleTeamSelection: (teamId: string) => void;
  readonly clearTeamSelection: () => void;
}

const OrganizationalContext = createContext<OrganizationalContextType | null>(null);

export function useOrganizationalContext() {
  const context = useContext(OrganizationalContext);
  if (!context) {
    throw new Error('useOrganizationalContext must be used within OrganizationalContextProvider');
  }
  return context;
}

interface Props {
  readonly children: ReactNode;
}

// Mock team data - in real implementation, this would come from API
const mockTeams: TeamFilter[] = [
  { id: 'engineering', name: 'Engineering', selected: false },
  { id: 'product', name: 'Product', selected: false },
  { id: 'design', name: 'Design', selected: false },
  { id: 'marketing', name: 'Marketing', selected: false },
  { id: 'support', name: 'Support', selected: false },
];

export function OrganizationalContextProvider({ children }: Props) {
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [teamFilters, setTeamFilters] = useState<TeamFilter[]>(mockTeams);

  const toggleTeamSelection = (teamId: string) => {
    const isSelected = selectedTeams.includes(teamId);

    if (isSelected) {
      setSelectedTeams((prev) => prev.filter((id) => id !== teamId));
    } else {
      setSelectedTeams((prev) => [...prev, teamId]);
    }

    setTeamFilters((prev) =>
      prev.map((team) => (team.id === teamId ? { ...team, selected: !team.selected } : team)),
    );
  };

  const clearTeamSelection = () => {
    setSelectedTeams([]);
    setTeamFilters((prev) => prev.map((team) => ({ ...team, selected: false })));
  };

  const contextValue: OrganizationalContextType = {
    selectedTeams,
    teamFilters,
    setSelectedTeams,
    toggleTeamSelection,
    clearTeamSelection,
  };

  return (
    <OrganizationalContext.Provider value={contextValue}>{children}</OrganizationalContext.Provider>
  );
}
