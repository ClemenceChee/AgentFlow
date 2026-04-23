/**
 * Unit Tests for TeamFilterDropdown Component
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { TeamFilterDropdown } from '../../../src/client/components/org/team/TeamFilterDropdown';
import { OrganizationalContextProvider } from '../../../src/client/contexts/OrganizationalContext';
import type { TeamMembership } from '../../../src/client/types/organizational';

// Mock the hooks
jest.mock('../../../src/client/hooks/useOrganizationalCache', () => ({
  useTeamData: jest.fn(),
}));

jest.mock('../../../src/client/hooks/usePrefetch', () => ({
  useHoverPrefetch: jest.fn(() => ({
    createHoverHandlers: jest.fn(() => ({})),
  })),
}));

// Mock team data
const mockTeams: TeamMembership[] = [
  {
    teamId: 'team-1',
    teamName: 'Engineering Team',
    members: [
      {
        operatorId: 'op-1',
        accessLevel: 'admin' as const,
        lastActivity: new Date().toISOString(),
      },
      {
        operatorId: 'op-2',
        accessLevel: 'member' as const,
        lastActivity: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25 hours ago
      },
    ],
  },
  {
    teamId: 'team-2',
    teamName: 'Product Team',
    members: [
      {
        operatorId: 'op-3',
        accessLevel: 'maintainer' as const,
        lastActivity: new Date().toISOString(),
      },
    ],
  },
];

const mockOrganizationalContext = {
  state: {
    currentOperator: 'op-1',
  },
};

// Helper component wrapper
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <OrganizationalContextProvider value={mockOrganizationalContext as any}>
    {children}
  </OrganizationalContextProvider>
);

describe('TeamFilterDropdown', () => {
  const defaultProps = {
    onTeamChange: jest.fn(),
    selectedTeamId: undefined,
    disabled: false,
    showAllTeamsOption: true,
    showMemberCounts: true,
    showActivityIndicators: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock the useTeamData hook
    const { useTeamData } = require('../../../src/client/hooks/useOrganizationalCache');
    useTeamData.mockReturnValue({
      data: mockTeams,
      error: null,
      isLoading: false,
      refetch: jest.fn(),
    });
  });

  it('renders correctly with default props', () => {
    render(
      <TestWrapper>
        <TeamFilterDropdown {...defaultProps} />
      </TestWrapper>,
    );

    expect(screen.getByRole('button', { expanded: false })).toBeInTheDocument();
    expect(screen.getByText('Select team...')).toBeInTheDocument();
  });

  it('displays placeholder when no team is selected', () => {
    render(
      <TestWrapper>
        <TeamFilterDropdown {...defaultProps} placeholder="Choose a team" />
      </TestWrapper>,
    );

    expect(screen.getByText('Choose a team')).toBeInTheDocument();
  });

  it('shows selected team information', () => {
    render(
      <TestWrapper>
        <TeamFilterDropdown {...defaultProps} selectedTeamId="team-1" />
      </TestWrapper>,
    );

    expect(screen.getByText('Engineering Team')).toBeInTheDocument();
    expect(screen.getByText('2 members')).toBeInTheDocument();
  });

  it('opens dropdown when clicked', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <TeamFilterDropdown {...defaultProps} />
      </TestWrapper>,
    );

    const button = screen.getByRole('button');
    await user.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('displays all teams option when enabled', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <TeamFilterDropdown {...defaultProps} />
      </TestWrapper>,
    );

    await user.click(screen.getByRole('button'));

    expect(screen.getByText('All Teams')).toBeInTheDocument();
  });

  it('hides all teams option when disabled', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <TeamFilterDropdown {...defaultProps} showAllTeamsOption={false} />
      </TestWrapper>,
    );

    await user.click(screen.getByRole('button'));

    expect(screen.queryByText('All Teams')).not.toBeInTheDocument();
  });

  it('displays team options with correct information', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <TeamFilterDropdown {...defaultProps} />
      </TestWrapper>,
    );

    await user.click(screen.getByRole('button'));

    expect(screen.getByText('Engineering Team')).toBeInTheDocument();
    expect(screen.getByText('Product Team')).toBeInTheDocument();
    expect(screen.getByText('2 members')).toBeInTheDocument();
    expect(screen.getByText('1 member')).toBeInTheDocument();
  });

  it('calls onTeamChange when team is selected', async () => {
    const user = userEvent.setup();
    const onTeamChange = jest.fn();

    render(
      <TestWrapper>
        <TeamFilterDropdown {...defaultProps} onTeamChange={onTeamChange} />
      </TestWrapper>,
    );

    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('Engineering Team'));

    expect(onTeamChange).toHaveBeenCalledWith('team-1');
  });

  it('calls onTeamChange with null when all teams is selected', async () => {
    const user = userEvent.setup();
    const onTeamChange = jest.fn();

    render(
      <TestWrapper>
        <TeamFilterDropdown {...defaultProps} onTeamChange={onTeamChange} />
      </TestWrapper>,
    );

    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('All Teams'));

    expect(onTeamChange).toHaveBeenCalledWith(null);
  });

  it('filters teams based on search query', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <TeamFilterDropdown {...defaultProps} enableSearch={true} />
      </TestWrapper>,
    );

    await user.click(screen.getByRole('button'));

    const searchInput = screen.getByPlaceholderText('Search teams...');
    await user.type(searchInput, 'Engineering');

    expect(screen.getByText('Engineering Team')).toBeInTheDocument();
    expect(screen.queryByText('Product Team')).not.toBeInTheDocument();
  });

  it('shows no results message when search has no matches', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <TeamFilterDropdown {...defaultProps} enableSearch={true} />
      </TestWrapper>,
    );

    await user.click(screen.getByRole('button'));

    const searchInput = screen.getByPlaceholderText('Search teams...');
    await user.type(searchInput, 'Nonexistent Team');

    expect(screen.getByText(/No teams found for "Nonexistent Team"/)).toBeInTheDocument();
  });

  it('closes dropdown when clicking outside', async () => {
    const user = userEvent.setup();

    render(
      <div>
        <TestWrapper>
          <TeamFilterDropdown {...defaultProps} />
        </TestWrapper>
        <div data-testid="outside">Outside element</div>
      </div>,
    );

    const button = screen.getByRole('button');
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByTestId('outside'));
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('handles keyboard navigation', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <TeamFilterDropdown {...defaultProps} />
      </TestWrapper>,
    );

    const button = screen.getByRole('button');
    await user.click(button);

    // Test Escape key closes dropdown
    await user.keyboard('{Escape}');
    expect(button).toHaveAttribute('aria-expanded', 'false');

    // Test Enter key opens dropdown
    button.focus();
    await user.keyboard('{Enter}');
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });

  it('displays activity indicators when enabled', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <TeamFilterDropdown {...defaultProps} showActivityIndicators={true} />
      </TestWrapper>,
    );

    await user.click(screen.getByRole('button'));

    // Engineering team has 1 active member (within 24h)
    expect(screen.getByText('1 active')).toBeInTheDocument();
  });

  it('shows access level badges for current user', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <TeamFilterDropdown {...defaultProps} />
      </TestWrapper>,
    );

    await user.click(screen.getByRole('button'));

    // Current user (op-1) is admin of Engineering Team
    expect(screen.getByTitle('Admin access')).toBeInTheDocument();
  });

  it('is disabled when disabled prop is true', () => {
    render(
      <TestWrapper>
        <TeamFilterDropdown {...defaultProps} disabled={true} />
      </TestWrapper>,
    );

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('displays loading state', () => {
    const { useTeamData } = require('../../../src/client/hooks/useOrganizationalCache');
    useTeamData.mockReturnValue({
      data: null,
      error: null,
      isLoading: true,
      refetch: jest.fn(),
    });

    render(
      <TestWrapper>
        <TeamFilterDropdown {...defaultProps} />
      </TestWrapper>,
    );

    // Check for loading spinner in the dropdown arrow
    expect(document.querySelector('.team-filter-loading-spinner')).toBeInTheDocument();
  });

  it('displays error state with retry button', async () => {
    const user = userEvent.setup();
    const refetch = jest.fn();
    const { useTeamData } = require('../../../src/client/hooks/useOrganizationalCache');

    useTeamData.mockReturnValue({
      data: null,
      error: new Error('Failed to load teams'),
      isLoading: false,
      refetch,
    });

    render(
      <TestWrapper>
        <TeamFilterDropdown {...defaultProps} />
      </TestWrapper>,
    );

    await user.click(screen.getByRole('button'));

    expect(screen.getByText('Failed to load teams')).toBeInTheDocument();

    const retryButton = screen.getByText('Retry');
    await user.click(retryButton);

    expect(refetch).toHaveBeenCalled();
  });

  it('shows empty state when no teams available', async () => {
    const user = userEvent.setup();
    const { useTeamData } = require('../../../src/client/hooks/useOrganizationalCache');

    useTeamData.mockReturnValue({
      data: [],
      error: null,
      isLoading: false,
      refetch: jest.fn(),
    });

    render(
      <TestWrapper>
        <TeamFilterDropdown {...defaultProps} />
      </TestWrapper>,
    );

    await user.click(screen.getByRole('button'));

    expect(screen.getByText('No teams available')).toBeInTheDocument();
  });

  it('uses custom filter function when provided', async () => {
    const user = userEvent.setup();
    const customFilter = jest.fn().mockReturnValue(true);

    render(
      <TestWrapper>
        <TeamFilterDropdown {...defaultProps} customFilter={customFilter} enableSearch={true} />
      </TestWrapper>,
    );

    await user.click(screen.getByRole('button'));

    const searchInput = screen.getByPlaceholderText('Search teams...');
    await user.type(searchInput, 'test');

    expect(customFilter).toHaveBeenCalled();
  });
});
