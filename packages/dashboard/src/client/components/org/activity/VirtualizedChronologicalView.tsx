/**
 * Virtualized Chronological View Component
 *
 * High-performance virtualized version of the chronological timeline view
 * for handling large numbers of activity events efficiently.
 */

import { useState } from 'react';
import { Clock, User, CheckCircle, XCircle, AlertCircle, Play, Pause, ArrowRight, TrendingUp } from 'lucide-react';
import VirtualizedList, { useVirtualizedList } from '../../common/VirtualizedList.js';
import type { ActivityEvent, OperatorTimeline } from './OperatorTimelineView.js';

interface VirtualizedChronologicalViewProps {
  timeline: OperatorTimeline;
  onSelectEvent?: (event: ActivityEvent) => void;
  eventFilter?: readonly ActivityEvent['eventType'][];
  height?: number;
}

const getEventTypeIcon = (type: ActivityEvent['eventType']) => {
  switch (type) {
    case 'task-start': return <Play className="h-4 w-4" />;
    case 'task-complete': return <CheckCircle className="h-4 w-4" />;
    case 'task-failed': return <XCircle className="h-4 w-4" />;
    case 'collaboration': return <User className="h-4 w-4" />;
    case 'break': return <Pause className="h-4 w-4" />;
    case 'context-switch': return <ArrowRight className="h-4 w-4" />;
    case 'problem-solving': return <AlertCircle className="h-4 w-4" />;
    case 'review': return <TrendingUp className="h-4 w-4" />;
    default: return <Clock className="h-4 w-4" />;
  }
};

const getEventTypeColor = (type: ActivityEvent['eventType']) => {
  switch (type) {
    case 'task-start': return 'text-blue-600';
    case 'task-complete': return 'text-green-600';
    case 'task-failed': return 'text-red-600';
    case 'collaboration': return 'text-purple-600';
    case 'break': return 'text-gray-500';
    case 'context-switch': return 'text-orange-600';
    case 'problem-solving': return 'text-blue-600';
    case 'review': return 'text-indigo-600';
    default: return 'text-gray-500';
  }
};

const getCategoryColor = (category: ActivityEvent['category']) => {
  switch (category) {
    case 'coding': return 'bg-blue-100 text-blue-800';
    case 'debugging': return 'bg-red-100 text-red-800';
    case 'review': return 'bg-purple-100 text-purple-800';
    case 'research': return 'bg-green-100 text-green-800';
    case 'meeting': return 'bg-orange-100 text-orange-800';
    case 'planning': return 'bg-indigo-100 text-indigo-800';
    case 'documentation': return 'bg-gray-100 text-gray-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const getDifficultyColor = (difficulty?: ActivityEvent['difficulty']) => {
  switch (difficulty) {
    case 'low': return 'text-green-600';
    case 'medium': return 'text-blue-600';
    case 'high': return 'text-orange-600';
    case 'complex': return 'text-red-600';
    default: return 'text-gray-500';
  }
};

const formatDuration = (ms?: number): string => {
  if (!ms) return '—';
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

export function VirtualizedChronologicalView({
  timeline,
  onSelectEvent,
  eventFilter,
  height = 600
}: VirtualizedChronologicalViewProps) {
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);

  // Filter and sort events
  const filteredEvents = eventFilter && eventFilter.length > 0 ?
    timeline.events.filter(event => eventFilter.includes(event.eventType)) :
    timeline.events;

  const sortedEvents = [...filteredEvents].sort((a, b) => b.timestamp - a.timestamp);

  const { scrollToItem, selectItem } = useVirtualizedList(sortedEvents);

  // Calculate variable height for events (expanded vs collapsed)
  const getEventHeight = (event: ActivityEvent, index: number): number => {
    const baseHeight = 90; // Base height for collapsed event
    const isSelected = selectedEvent === event.id;

    if (isSelected) {
      let expandedHeight = 140; // Base expanded height

      // Add height for tools
      if (event.tools && event.tools.length > 0) {
        expandedHeight += Math.ceil(event.tools.length / 4) * 25; // Estimate based on badges
      }

      // Add height for collaborators
      if (event.collaborators && event.collaborators.length > 0) {
        expandedHeight += Math.ceil(event.collaborators.length / 4) * 25;
      }

      // Add height for session ID
      if (event.sessionId) {
        expandedHeight += 25;
      }

      return expandedHeight;
    }

    return baseHeight;
  };

  // Render individual event item
  const renderEventItem = (event: ActivityEvent, index: number, isVisible: boolean): React.ReactNode => {
    // For performance, render a placeholder for off-screen items
    if (!isVisible) {
      return (
        <div
          style={{ height: getEventHeight(event, index) }}
          className="org-timeline-event-placeholder bg-gray-50 border border-gray-200 rounded mx-2"
        />
      );
    }

    const isSelected = selectedEvent === event.id;

    return (
      <div
        className={`org-activity-feed-item ${isSelected ? 'bg-blue-50 border-blue-200' : 'bg-white hover:bg-gray-50'} border border-gray-200 rounded mx-2 mb-2 transition-colors duration-200`}
        style={{ minHeight: getEventHeight(event, index) }}
      >
        {/* Event Icon */}
        <div className={`org-activity-feed-item__icon ${getCategoryColor(event.category)} flex-shrink-0`}>
          <div className={getEventTypeColor(event.eventType)}>
            {getEventTypeIcon(event.eventType)}
          </div>
        </div>

        {/* Event Content */}
        <div className="org-activity-feed-item__content flex-1">
          <div
            className={`cursor-pointer p-3 ${onSelectEvent ? 'hover:bg-gray-50' : ''}`}
            onClick={() => {
              const newSelected = isSelected ? null : event.id;
              setSelectedEvent(newSelected);
              if (onSelectEvent && !isSelected) {
                onSelectEvent(event);
                selectItem(event, index);
              }
            }}
          >
            {/* Event Header */}
            <div className="org-activity-feed-item__header">
              <div className="org-activity-feed-item__title font-semibold text-gray-900">
                {event.title}
              </div>
              <div className="org-activity-feed-item__time text-sm text-gray-500">
                {new Date(event.timestamp).toLocaleTimeString()}
              </div>
            </div>

            {/* Event Metadata */}
            <div className="org-activity-feed-item__meta">
              <span className={`org-activity-feed-item__type ${getCategoryColor(event.category)} px-2 py-1 rounded-full text-xs font-medium`}>
                {event.category}
              </span>
              <span className="text-xs text-gray-600 capitalize">
                {event.eventType.replace('-', ' ')}
              </span>
              {event.duration && (
                <span className="text-xs text-gray-600">
                  {formatDuration(event.duration)}
                </span>
              )}
              {event.difficulty && (
                <span className={`text-xs ${getDifficultyColor(event.difficulty)} font-medium`}>
                  {event.difficulty}
                </span>
              )}
            </div>

            {/* Event Description */}
            {event.description && (
              <div className="org-activity-feed-item__description text-sm text-gray-600 mt-2">
                {event.description}
              </div>
            )}

            {/* Event Outcome */}
            {event.outcome && (
              <div className="mt-2">
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                  event.outcome === 'success' ? 'bg-green-100 text-green-800' :
                  event.outcome === 'failure' ? 'bg-red-100 text-red-800' :
                  event.outcome === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {event.outcome}
                </span>
              </div>
            )}

            {/* Expanded Details */}
            {isSelected && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  {/* Tools Used */}
                  {event.tools && event.tools.length > 0 && (
                    <div>
                      <div className="font-medium text-gray-900 mb-2">Tools Used</div>
                      <div className="flex flex-wrap gap-1">
                        {event.tools.map(tool => (
                          <span
                            key={tool}
                            className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-800"
                          >
                            {tool}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Collaborators */}
                  {event.collaborators && event.collaborators.length > 0 && (
                    <div>
                      <div className="font-medium text-gray-900 mb-2">Collaborators</div>
                      <div className="flex flex-wrap gap-1">
                        {event.collaborators.map(collaborator => (
                          <span
                            key={collaborator}
                            className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800"
                          >
                            {collaborator}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Session Information */}
                {event.sessionId && (
                  <div className="mt-3">
                    <div className="font-medium text-gray-900 mb-1">Session</div>
                    <div className="text-xs text-gray-500 font-mono bg-gray-50 px-2 py-1 rounded">
                      {event.sessionId}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Loading placeholder
  const renderLoadingItem = (): React.ReactNode => (
    <div className="mx-2 mb-2 bg-gray-50 border border-gray-200 rounded animate-pulse">
      <div className="p-4 flex items-start gap-3">
        <div className="w-8 h-8 bg-gray-300 rounded-full flex-shrink-0"></div>
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-300 rounded w-3/4"></div>
          <div className="h-3 bg-gray-300 rounded w-1/2"></div>
          <div className="h-3 bg-gray-300 rounded w-2/3"></div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="org-timeline-chronological">
      <VirtualizedList
        items={sortedEvents}
        renderItem={renderEventItem}
        getItemHeight={getEventHeight}
        height={height}
        overscan={5}
        enableKeyboardNavigation={true}
        onItemSelect={(event, index) => {
          const newSelected = selectedEvent === event.id ? null : event.id;
          setSelectedEvent(newSelected);
          if (onSelectEvent && newSelected) {
            onSelectEvent(event);
          }
        }}
        className="org-timeline-virtualized"
        emptyMessage="No activity events found for the selected criteria"
        renderLoadingItem={renderLoadingItem}
        header={
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 rounded-t-lg">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Activity Timeline</h3>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span>{sortedEvents.length} events</span>
                {eventFilter && eventFilter.length > 0 && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                    Filtered
                  </span>
                )}
              </div>
            </div>
          </div>
        }
        footer={
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 rounded-b-lg">
            <div className="text-xs text-gray-500 text-center">
              Use ↑/↓ arrow keys to navigate, Enter to expand/collapse events
            </div>
          </div>
        }
      />
    </div>
  );
}

export default VirtualizedChronologicalView;