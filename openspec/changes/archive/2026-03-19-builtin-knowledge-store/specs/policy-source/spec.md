## ADDED Requirements

### Requirement: PolicySource interface
The system SHALL define a `PolicySource` interface in `types.ts` with the following read-only query methods:
- `recentFailureRate(agentId: string): number` — returns failure rate (0.0–1.0) from the agent's profile, or 0 if no history
- `isKnownBottleneck(nodeName: string): boolean` — returns true if the node appears in any agent's knownBottlenecks
- `lastConformanceScore(agentId: string): number | null` — returns the most recent conformance score, or null if none recorded
- `getAgentProfile(agentId: string): AgentProfile | null` — returns the full derived profile

#### Scenario: Interface shape
- **WHEN** a PolicySource implementation is created
- **THEN** it SHALL have methods `recentFailureRate`, `isKnownBottleneck`, `lastConformanceScore`, and `getAgentProfile`

### Requirement: PolicySource factory
The system SHALL provide `createPolicySource(store: KnowledgeStore): PolicySource` that creates a PolicySource backed by a knowledge store. All methods SHALL delegate to the store's profile data.

#### Scenario: Failure rate from store
- **WHEN** `policySource.recentFailureRate('alfred')` is called and the store has a profile for alfred with failureRate 0.3
- **THEN** 0.3 SHALL be returned

#### Scenario: Failure rate for unknown agent
- **WHEN** `policySource.recentFailureRate('unknown')` is called and no profile exists
- **THEN** 0 SHALL be returned

#### Scenario: Known bottleneck check
- **WHEN** `policySource.isKnownBottleneck('fetch-data')` is called and any agent profile has `fetch-data` in knownBottlenecks
- **THEN** true SHALL be returned

#### Scenario: Unknown bottleneck
- **WHEN** `policySource.isKnownBottleneck('novel-node')` is called and no profile lists it
- **THEN** false SHALL be returned

#### Scenario: Conformance score
- **WHEN** `policySource.lastConformanceScore('alfred')` is called and the profile has lastConformanceScore 0.85
- **THEN** 0.85 SHALL be returned

#### Scenario: No conformance history
- **WHEN** `policySource.lastConformanceScore('new-agent')` is called with no profile
- **THEN** null SHALL be returned

### Requirement: Adaptive guard violations from PolicySource
When `GuardConfig.policySource` is provided, `checkGuards` SHALL additionally check for policy-derived violations:
- `high-failure-rate`: emitted when `recentFailureRate(agentId)` exceeds `policyThresholds.maxFailureRate` (default 0.5)
- `conformance-drift`: emitted when `lastConformanceScore(agentId)` is below `policyThresholds.minConformance` (default 0.7) and is not null
- `known-bottleneck`: emitted (as informational warning) when any running node's name is a known bottleneck

#### Scenario: High failure rate violation
- **WHEN** `checkGuards` is called with a PolicySource reporting failureRate 0.6 for the graph's agentId
- **AND** `policyThresholds.maxFailureRate` is 0.5 (default)
- **THEN** a violation with type `high-failure-rate` SHALL be included

#### Scenario: No violation when failure rate is acceptable
- **WHEN** `checkGuards` is called with a PolicySource reporting failureRate 0.2
- **THEN** no `high-failure-rate` violation SHALL be emitted

#### Scenario: Conformance drift violation
- **WHEN** `checkGuards` is called with a PolicySource reporting lastConformanceScore 0.5 for the graph's agentId
- **AND** `policyThresholds.minConformance` is 0.7 (default)
- **THEN** a violation with type `conformance-drift` SHALL be included

#### Scenario: No conformance violation when score is null
- **WHEN** `checkGuards` is called with a PolicySource reporting lastConformanceScore null
- **THEN** no `conformance-drift` violation SHALL be emitted

#### Scenario: Known bottleneck warning
- **WHEN** `checkGuards` is called with a graph containing a running node named `fetch-data`
- **AND** the PolicySource reports `isKnownBottleneck('fetch-data')` is true
- **THEN** a violation with type `known-bottleneck` SHALL be included

#### Scenario: Guards without PolicySource unchanged
- **WHEN** `checkGuards` is called without a PolicySource in config
- **THEN** behavior SHALL be identical to existing implementation — no policy-derived violations

### Requirement: PolicySource thresholds in GuardConfig
`GuardConfig` SHALL accept an optional `policyThresholds` field with:
- `maxFailureRate?: number` (default 0.5)
- `minConformance?: number` (default 0.7)

#### Scenario: Custom thresholds
- **WHEN** `checkGuards` is called with `policyThresholds: { maxFailureRate: 0.8 }`
- **AND** the PolicySource reports failureRate 0.6
- **THEN** no `high-failure-rate` violation SHALL be emitted (0.6 < 0.8)

### Requirement: PolicySource exported from package
`createPolicySource`, `PolicySource`, `AgentProfile`, `KnowledgeStore`, and `KnowledgeStoreConfig` SHALL all be exported from the package barrel (`index.ts`).

#### Scenario: Import PolicySource
- **WHEN** a consumer imports `createPolicySource` from `agentflow-core`
- **THEN** the import SHALL resolve without error
