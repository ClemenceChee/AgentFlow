/**
 * SessionCorrelationChain Component
 *
 * Visualizes relationships between correlated sessions with interactive
 * relationship mapping, confidence indicators, and navigation controls.
 */

import { ExternalLink, GitBranch, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useOrganizationalContext } from '../../../../contexts/OrganizationalContext';
import type { SessionCorrelation } from '../../../types/organizational.js';

export interface SessionNode {
  readonly id: string;
  readonly operatorId: string;
  readonly teamId?: string;
  readonly timestamp: number;
  readonly duration?: number;
  readonly status: 'active' | 'completed' | 'failed' | 'timeout';
  readonly sessionType: 'primary' | 'child' | 'related' | 'parallel';
  readonly title?: string;
  readonly summary?: string;
  readonly confidence: number;
}

export interface SessionRelationship {
  readonly id: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly type: 'parent-child' | 'continuation' | 'parallel' | 'knowledge-share' | 'collaboration';
  readonly strength: number;
  readonly confidence: number;
  readonly timestamp: number;
  readonly metadata?: Record<string, any>;
}

export interface SessionCorrelationChainData {
  readonly nodes: readonly SessionNode[];
  readonly relationships: readonly SessionRelationship[];
  readonly rootSessionId: string;
  readonly totalConfidence: number;
  readonly generatedAt: number;
}

interface SessionCorrelationChainProps {
  /** Session correlation data for the chain */
  readonly sessionCorrelation: SessionCorrelation;
  /** Display mode for the chain visualization */
  readonly mode?: 'tree' | 'network' | 'timeline' | 'compact';
  /** Whether to show session details on hover */
  readonly showDetails?: boolean;
  /** Callback for session navigation */
  readonly onNavigateToSession?: (sessionId: string) => void;
  /** Additional CSS classes */
  readonly className?: string;
}

const getNodeStatusColor = (status: SessionNode['status']) => {
  switch (status) {
    case 'active':
      return 'org-node-active';
    case 'completed':
      return 'org-node-success';
    case 'failed':
      return 'org-node-error';
    case 'timeout':
      return 'org-node-warning';
    default:
      return 'org-node-muted';
  }
};

const getRelationshipColor = (type: SessionRelationship['type']) => {
  switch (type) {
    case 'parent-child':
      return 'org-edge-primary';
    case 'continuation':
      return 'org-edge-info';
    case 'parallel':
      return 'org-edge-success';
    case 'knowledge-share':
      return 'org-edge-warning';
    case 'collaboration':
      return 'org-edge-secondary';
    default:
      return 'org-edge-muted';
  }
};

const getRelationshipLabel = (type: SessionRelationship['type']) => {
  switch (type) {
    case 'parent-child':
      return 'Spawned';
    case 'continuation':
      return 'Continued';
    case 'parallel':
      return 'Parallel';
    case 'knowledge-share':
      return 'Shared';
    case 'collaboration':
      return 'Collaborated';
    default:
      return 'Related';
  }
};

const TreeChainView: React.FC<{
  chainData: SessionCorrelationChainData;
  onNavigateToSession?: (sessionId: string) => void;
  showDetails: boolean;
}> = ({ chainData, onNavigateToSession, showDetails }) => {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const buildTree = (rootId: string): SessionNode & { children: any[] } => {
    const root = chainData.nodes.find((n) => n.id === rootId);
    if (!root) throw new Error(`Root node ${rootId} not found`);

    const childRelationships = chainData.relationships.filter((r) => r.sourceId === rootId);
    const children = childRelationships.map((rel) => {
      return buildTree(rel.targetId);
    });

    return { ...root, children };
  };

  const renderNode = (node: SessionNode & { children: any[] }, depth = 0) => (
    <div key={node.id} className="org-tree-node" style={{ marginLeft: `${depth * 24}px` }}>
      <div
        className={`org-node ${getNodeStatusColor(node.status)} ${
          hoveredNode === node.id ? 'org-node-hovered' : ''
        }`}
        onMouseEnter={() => setHoveredNode(node.id)}
        onMouseLeave={() => setHoveredNode(null)}
        onClick={() => onNavigateToSession?.(node.id)}
      >
        <div className="flex items-center space-x-2">
          <div className="org-node-indicator" />
          <div className="flex-1">
            <div className="org-node-title">{node.title || `Session ${node.id.slice(-8)}`}</div>
            <div className="org-node-meta">
              <span>Operator: {node.operatorId.slice(-8)}</span>
              {node.teamId && <span>Team: {node.teamId}</span>}
              <span>Confidence: {Math.round(node.confidence * 100)}%</span>
            </div>
          </div>
          {onNavigateToSession && <ExternalLink className="h-4 w-4 org-text-muted" />}
        </div>

        {showDetails && hoveredNode === node.id && node.summary && (
          <div className="org-node-tooltip">
            <div className="org-text-sm org-text-muted">{node.summary}</div>
          </div>
        )}
      </div>

      {node.children.length > 0 && (
        <div className="org-tree-children">
          {node.children.map((child) => renderNode(child, depth + 1))}
        </div>
      )}
    </div>
  );

  const tree = buildTree(chainData.rootSessionId);

  return <div className="org-chain-tree">{renderNode(tree)}</div>;
};

const NetworkChainView: React.FC<{
  chainData: SessionCorrelationChainData;
  onNavigateToSession?: (sessionId: string) => void;
  showDetails: boolean;
}> = ({ chainData, onNavigateToSession, showDetails }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewBox, _setViewBox] = useState({ x: 0, y: 0, width: 800, height: 600 });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // Simple force-directed layout
  const layoutNodes = () => {
    const nodePositions = new Map<string, { x: number; y: number }>();

    // Place root node at center
    const rootNode = chainData.nodes.find((n) => n.id === chainData.rootSessionId);
    if (rootNode) {
      nodePositions.set(rootNode.id, { x: 400, y: 300 });
    }

    // Place other nodes in concentric circles
    const otherNodes = chainData.nodes.filter((n) => n.id !== chainData.rootSessionId);
    const angleStep = (2 * Math.PI) / Math.max(otherNodes.length, 1);

    otherNodes.forEach((node, index) => {
      const angle = index * angleStep;
      const radius = 150;
      nodePositions.set(node.id, {
        x: 400 + Math.cos(angle) * radius,
        y: 300 + Math.sin(angle) * radius,
      });
    });

    return nodePositions;
  };

  const positions = layoutNodes();

  return (
    <div className="org-chain-network">
      <div className="org-network-controls mb-4">
        <button className="org-button org-button-ghost org-button-sm">
          <ZoomIn className="h-4 w-4" />
        </button>
        <button className="org-button org-button-ghost org-button-sm">
          <ZoomOut className="h-4 w-4" />
        </button>
        <button className="org-button org-button-ghost org-button-sm">
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      <svg
        ref={svgRef}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        className="w-full h-96 org-bg-surface rounded-lg"
      >
        {/* Render edges */}
        {chainData.relationships.map((relationship) => {
          const sourcePos = positions.get(relationship.sourceId);
          const targetPos = positions.get(relationship.targetId);

          if (!sourcePos || !targetPos) return null;

          return (
            <g key={relationship.id}>
              <line
                x1={sourcePos.x}
                y1={sourcePos.y}
                x2={targetPos.x}
                y2={targetPos.y}
                className={`org-edge ${getRelationshipColor(relationship.type)}`}
                strokeWidth={Math.max(1, relationship.strength * 3)}
                strokeOpacity={relationship.confidence}
                markerEnd="url(#arrowhead)"
              />
              <text
                x={(sourcePos.x + targetPos.x) / 2}
                y={(sourcePos.y + targetPos.y) / 2}
                className="org-edge-label"
                textAnchor="middle"
                dy="-5"
              >
                {getRelationshipLabel(relationship.type)}
              </text>
            </g>
          );
        })}

        {/* Render nodes */}
        {chainData.nodes.map((node) => {
          const pos = positions.get(node.id);
          if (!pos) return null;

          const isRoot = node.id === chainData.rootSessionId;
          const isSelected = selectedNode === node.id;
          const radius = isRoot ? 20 : 15;

          return (
            <g key={node.id}>
              <circle
                cx={pos.x}
                cy={pos.y}
                r={radius}
                className={`org-node ${getNodeStatusColor(node.status)} ${
                  isSelected ? 'org-node-selected' : ''
                }`}
                onClick={() => {
                  setSelectedNode(node.id);
                  onNavigateToSession?.(node.id);
                }}
                style={{ cursor: onNavigateToSession ? 'pointer' : 'default' }}
              />
              <text
                x={pos.x}
                y={pos.y + radius + 15}
                className="org-node-label"
                textAnchor="middle"
              >
                {node.title || node.id.slice(-8)}
              </text>

              {showDetails && isSelected && (
                <foreignObject x={pos.x + radius + 10} y={pos.y - 40} width="200" height="80">
                  <div className="org-node-details">
                    <div className="org-text-sm org-font-medium">
                      {node.title || `Session ${node.id.slice(-8)}`}
                    </div>
                    <div className="org-text-xs org-text-muted mt-1">
                      <div>Operator: {node.operatorId.slice(-8)}</div>
                      {node.teamId && <div>Team: {node.teamId}</div>}
                      <div>Confidence: {Math.round(node.confidence * 100)}%</div>
                    </div>
                  </div>
                </foreignObject>
              )}
            </g>
          );
        })}

        {/* Arrow marker definition */}
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" className="org-arrow" />
          </marker>
        </defs>
      </svg>

      {selectedNode && (
        <div className="mt-4 org-card-inner">
          <h5 className="org-font-semibold mb-2">Session Details</h5>
          {(() => {
            const node = chainData.nodes.find((n) => n.id === selectedNode);
            if (!node) return null;
            return (
              <div className="org-text-sm space-y-1">
                <div>
                  <strong>Session ID:</strong> {node.id}
                </div>
                <div>
                  <strong>Operator:</strong> {node.operatorId}
                </div>
                {node.teamId && (
                  <div>
                    <strong>Team:</strong> {node.teamId}
                  </div>
                )}
                <div>
                  <strong>Status:</strong> {node.status}
                </div>
                <div>
                  <strong>Confidence:</strong> {Math.round(node.confidence * 100)}%
                </div>
                {node.summary && (
                  <div>
                    <strong>Summary:</strong> {node.summary}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

const TimelineChainView: React.FC<{
  chainData: SessionCorrelationChainData;
  onNavigateToSession?: (sessionId: string) => void;
  showDetails: boolean;
}> = ({ chainData, onNavigateToSession, showDetails }) => {
  const sortedNodes = [...chainData.nodes].sort((a, b) => a.timestamp - b.timestamp);
  const startTime = Math.min(...sortedNodes.map((n) => n.timestamp));
  const endTime = Math.max(...sortedNodes.map((n) => n.timestamp + (n.duration || 0)));
  const timeSpan = endTime - startTime;

  return (
    <div className="org-chain-timeline">
      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-px org-border-muted"></div>

        <div className="space-y-4">
          {sortedNodes.map((node, _index) => {
            const _relativeStart =
              timeSpan > 0 ? ((node.timestamp - startTime) / timeSpan) * 100 : 0;
            const duration = node.duration || 0;
            const relativeWidth = timeSpan > 0 ? (duration / timeSpan) * 100 : 0;

            return (
              <div key={node.id} className="relative flex items-center">
                <div className="flex-shrink-0 w-8 h-8 org-bg-surface rounded-full flex items-center justify-center z-10">
                  <div className={`w-3 h-3 rounded-full ${getNodeStatusColor(node.status)}`} />
                </div>

                <div className="flex-1 ml-6">
                  <div
                    className={`org-timeline-card ${onNavigateToSession ? 'cursor-pointer' : ''}`}
                    onClick={() => onNavigateToSession?.(node.id)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="org-font-medium">
                        {node.title || `Session ${node.id.slice(-8)}`}
                      </div>
                      <div className="org-text-xs org-text-muted">
                        {new Date(node.timestamp).toLocaleString()}
                      </div>
                    </div>

                    <div className="flex items-center space-x-4 org-text-sm org-text-muted mb-2">
                      <span>Operator: {node.operatorId.slice(-8)}</span>
                      {node.teamId && <span>Team: {node.teamId}</span>}
                      <span>Confidence: {Math.round(node.confidence * 100)}%</span>
                      {duration > 0 && <span>Duration: {Math.round(duration / 1000)}s</span>}
                    </div>

                    {node.summary && showDetails && (
                      <div className="org-text-sm org-text-muted">{node.summary}</div>
                    )}

                    {duration > 0 && (
                      <div className="relative h-2 org-bg-surface rounded-full mt-3">
                        <div
                          className={`absolute h-full rounded-full ${getNodeStatusColor(node.status)}`}
                          style={{ width: `${Math.max(relativeWidth, 2)}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Relationship indicators */}
      <div className="mt-6 org-card-inner">
        <h5 className="org-font-semibold mb-3">Session Relationships</h5>
        <div className="space-y-2">
          {chainData.relationships.map((rel) => {
            const source = chainData.nodes.find((n) => n.id === rel.sourceId);
            const target = chainData.nodes.find((n) => n.id === rel.targetId);

            return (
              <div key={rel.id} className="flex items-center space-x-2 org-text-sm">
                <div className={`w-3 h-3 rounded ${getRelationshipColor(rel.type)}`} />
                <span>
                  {source?.title || source?.id.slice(-8)}
                  <span className="org-text-muted mx-2">
                    {getRelationshipLabel(rel.type).toLowerCase()}
                  </span>
                  {target?.title || target?.id.slice(-8)}
                </span>
                <span className="org-text-xs org-text-muted">
                  ({Math.round(rel.confidence * 100)}% confidence)
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const CompactChainView: React.FC<{
  chainData: SessionCorrelationChainData;
  onNavigateToSession?: (sessionId: string) => void;
}> = ({ chainData, onNavigateToSession }) => (
  <div className="org-chain-compact">
    <div className="flex items-center justify-between mb-3">
      <span className="org-text-sm org-font-medium">
        Session Chain ({chainData.nodes.length} sessions)
      </span>
      <span className="org-text-xs org-text-muted">
        {Math.round(chainData.totalConfidence * 100)}% confidence
      </span>
    </div>

    <div className="flex items-center space-x-2 overflow-x-auto pb-2">
      {chainData.nodes.map((node, index) => (
        <div key={node.id} className="flex items-center space-x-2 flex-shrink-0">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center ${getNodeStatusColor(node.status)} ${
              onNavigateToSession ? 'cursor-pointer' : ''
            }`}
            title={`${node.title || node.id} - ${node.status}`}
            onClick={() => onNavigateToSession?.(node.id)}
          >
            <span className="org-text-xs org-font-mono">{node.id.slice(-2)}</span>
          </div>
          {index < chainData.nodes.length - 1 && <GitBranch className="h-3 w-3 org-text-muted" />}
        </div>
      ))}
    </div>

    <div className="mt-2 org-text-xs org-text-muted">
      {chainData.relationships.length} relationships mapped
    </div>
  </div>
);

export const SessionCorrelationChain: React.FC<SessionCorrelationChainProps> = ({
  sessionCorrelation,
  mode = 'network',
  showDetails = true,
  onNavigateToSession,
  className = '',
}) => {
  const { teamFilter } = useOrganizationalContext();
  const [chainData, setChainData] = useState<SessionCorrelationChainData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');

  useEffect(() => {
    const fetchChainData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Generate mock chain data based on session correlation
        const nodes: SessionNode[] = [
          {
            id: sessionCorrelation.sessionId,
            operatorId: sessionCorrelation.operatorId,
            teamId: sessionCorrelation.teamId,
            timestamp: sessionCorrelation.timestamp,
            status: 'active',
            sessionType: 'primary',
            title: 'Current Session',
            confidence: sessionCorrelation.confidence,
          },
          ...sessionCorrelation.relatedSessions.slice(0, 5).map((relatedId, index) => ({
            id: relatedId,
            operatorId: `op-${relatedId.slice(-8)}`,
            teamId: sessionCorrelation.teamId,
            timestamp: sessionCorrelation.timestamp - (index + 1) * 3600000,
            duration: 1800000 + Math.random() * 3600000,
            status: 'completed' as const,
            sessionType: 'related' as const,
            title: `Related Session ${index + 1}`,
            summary: `Session focusing on similar organizational patterns and team dynamics.`,
            confidence: 0.7 + Math.random() * 0.3,
          })),
        ];

        const relationships: SessionRelationship[] = sessionCorrelation.relatedSessions
          .slice(0, 5)
          .map((relatedId, index) => ({
            id: `rel-${index}`,
            sourceId: sessionCorrelation.sessionId,
            targetId: relatedId,
            type: index === 0 ? 'continuation' : index === 1 ? 'parallel' : 'knowledge-share',
            strength: 0.6 + Math.random() * 0.4,
            confidence: 0.7 + Math.random() * 0.3,
            timestamp: sessionCorrelation.timestamp - index * 1800000,
          }));

        setChainData({
          nodes,
          relationships,
          rootSessionId: sessionCorrelation.sessionId,
          totalConfidence: sessionCorrelation.confidence,
          generatedAt: Date.now(),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load chain data');
      } finally {
        setLoading(false);
      }
    };

    fetchChainData();
  }, [sessionCorrelation]);

  if (loading) {
    return (
      <div className={`org-chain-display org-loading ${className}`}>
        <div className="flex items-center space-x-2">
          <div className="org-spinner org-spinner-sm" />
          <span className="org-text-muted">Mapping session correlations...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`org-chain-display org-error ${className}`}>
        <div className="org-error-message">
          <GitBranch className="h-5 w-5 text-red-500" />
          <span>Failed to load correlation chain: {error}</span>
        </div>
      </div>
    );
  }

  if (!chainData) {
    return (
      <div className={`org-chain-display org-empty ${className}`}>
        <div className="org-empty-state">
          <GitBranch className="h-8 w-8 org-text-muted mb-2" />
          <div className="org-text-muted">No correlation chain available</div>
        </div>
      </div>
    );
  }

  const filteredData =
    filterType === 'all'
      ? chainData
      : {
          ...chainData,
          relationships: chainData.relationships.filter((rel) => rel.type === filterType),
        };

  return (
    <div className={`org-chain-display org-chain-${mode} ${className}`}>
      {mode !== 'compact' && (
        <div className="flex items-center justify-between mb-4">
          <h3 className="org-text-lg org-font-semibold">Session Correlation Chain</h3>
          <div className="flex items-center space-x-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="org-select org-select-sm"
            >
              <option value="all">All Relationships</option>
              <option value="parent-child">Parent-Child</option>
              <option value="continuation">Continuation</option>
              <option value="parallel">Parallel</option>
              <option value="knowledge-share">Knowledge Share</option>
              <option value="collaboration">Collaboration</option>
            </select>
          </div>
        </div>
      )}

      {mode === 'tree' && (
        <TreeChainView
          chainData={filteredData}
          onNavigateToSession={onNavigateToSession}
          showDetails={showDetails}
        />
      )}
      {mode === 'network' && (
        <NetworkChainView
          chainData={filteredData}
          onNavigateToSession={onNavigateToSession}
          showDetails={showDetails}
        />
      )}
      {mode === 'timeline' && (
        <TimelineChainView
          chainData={filteredData}
          onNavigateToSession={onNavigateToSession}
          showDetails={showDetails}
        />
      )}
      {mode === 'compact' && (
        <CompactChainView chainData={filteredData} onNavigateToSession={onNavigateToSession} />
      )}
    </div>
  );
};

export default SessionCorrelationChain;
