# AgentFlow Dashboard Test Suite

Comprehensive test coverage for the AgentFlow Dashboard ensuring bulletproof reliability across all scenarios.

## Test Structure

```
tests/
├── unit/                    # Unit tests for individual components
│   ├── watcher.test.ts     # TraceWatcher file processing & watching
│   ├── stats.test.ts       # AgentStats metrics calculation
│   └── server.test.ts      # DashboardServer API & WebSocket tests
├── integration/            # Multi-component integration tests
│   ├── multi-agent.test.ts      # Alfred + OpenClaw concurrent scenarios
│   └── openclaw-integration.test.ts  # OpenClaw-specific integration
├── performance/            # Scalability and performance tests
│   └── scalability.test.ts # Large dataset, memory usage, latency
├── e2e/                    # End-to-end browser tests
│   ├── dashboard-ui.test.ts     # Full UI workflow tests
│   └── test-server.ts           # E2E test server setup
├── fixtures/               # Test data generation
│   └── test-data-generator.ts   # Realistic test data creation
└── setup.ts               # Global test configuration
```

## Test Categories

### 1. Unit Tests (`tests/unit/`)

**TraceWatcher Tests** (`watcher.test.ts`)
- File format parsing: JSON traces, JSONL sessions, universal logs
- File watching: real-time updates, modifications, deletions
- Multi-directory monitoring
- Error handling: malformed files, permission errors
- Universal log parsing: OpenClaw, Alfred, JSON logs

**AgentStats Tests** (`stats.test.ts`)
- Metrics calculation: success rates, execution times, triggers
- Agent isolation: separate statistics per agent
- Performance tracking: recent activity, trends
- Data cleanup: old metrics removal
- Edge cases: missing data, large datasets

**DashboardServer Tests** (`server.test.ts`)
- API endpoints: traces, stats, agents, process health
- WebSocket functionality: real-time updates, client management
- Static file serving: SPA routing, CORS handling
- Error handling: API failures, graceful degradation
- Server lifecycle: start/stop, configuration

### 2. Integration Tests (`tests/integration/`)

**Multi-Agent Scenarios** (`multi-agent.test.ts`)
- Alfred + OpenClaw concurrent operation
- Cross-contamination prevention
- Resource competition handling
- Real-time collaboration
- Data consistency across formats

**OpenClaw Integration** (`openclaw-integration.test.ts`)
- Session file discovery and parsing
- Gateway log correlation
- Real-time session updates
- Timeline generation accuracy
- Execution graph visualization

### 3. Performance Tests (`tests/performance/`)

**Scalability Tests** (`scalability.test.ts`)
- 1000+ trace handling
- 10+ concurrent agents
- Memory usage optimization
- API performance under load
- Real-time update latency
- File watching efficiency

### 4. End-to-End Tests (`tests/e2e/`)

**Dashboard UI Tests** (`dashboard-ui.test.ts`)
- Complete user workflows
- Graph visualization interaction
- Timeline view functionality
- Metrics dashboard accuracy
- Process health monitoring
- Real-time updates via WebSocket
- Responsive design testing
- Accessibility compliance

## Running Tests

### All Tests
```bash
npm run test:all
```

### Individual Test Suites
```bash
# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# Performance tests (with extended timeout)
npm run test:performance

# End-to-end tests (requires browser)
npm run test:e2e
```

### Development Workflows
```bash
# Watch mode for development
npm run test:watch

# Coverage report
npm run test:coverage

# CI/CD pipeline tests
npm run test:ci
```

## Test Data Generation

The `TestDataGenerator` class creates realistic test scenarios:

### AgentFlow JSON Traces
- Configurable node counts and failure rates
- Realistic timing data
- Varied agent types and triggers

### OpenClaw JSONL Sessions
- Complete session lifecycles
- Tool calls with results and errors
- Token usage tracking
- Subagent spawning scenarios

### Universal Log Files
- OpenClaw gateway logs
- Alfred systemd logs
- JSON structured logs
- Mixed format scenarios

### Large Datasets
- 1000+ trace generation for performance testing
- Memory-efficient batch creation
- Varied agent distributions

## Test Configuration

### Vitest Configuration
- TypeScript support with strict mode
- Coverage reporting with v8 provider
- Test timeout: 10 seconds (120s for performance)
- Setup files for environment preparation

### Playwright Configuration
- Multi-browser testing (Chromium, Firefox)
- Mobile and desktop viewports
- Screenshot and video capture on failures
- Parallel test execution

### CI/CD Pipeline
- Matrix testing across Node.js versions
- Coverage reporting to Codecov
- Performance benchmark tracking
- Artifact collection for debugging

## Performance Benchmarks

### Expected Performance Characteristics

**File Loading**
- 1000 traces: < 30 seconds load time
- Memory usage: < 500MB heap for 1000 traces
- API response: < 5 seconds for full trace list

**Real-time Updates**
- File detection latency: < 1 second average
- WebSocket update delivery: < 500ms
- Concurrent file processing: 50 files in < 15 seconds

**API Performance**
- 100 concurrent requests: < 1 second average response
- P95 response time: < 3 seconds
- Memory stability under load

### Memory Management
- Per-trace overhead: < 50KB
- Garbage collection efficiency
- No memory leaks under continuous operation

## Error Scenarios Tested

### File System Issues
- Permission denied errors
- Disk space limitations
- Network file system latency
- Corrupted file handling

### Data Format Variations
- Malformed JSON traces
- Incomplete JSONL sessions
- Mixed encoding scenarios
- Very large individual files

### Concurrent Operations
- Multiple agents writing simultaneously
- File modification during reading
- WebSocket client disconnections
- API rate limiting

### Edge Cases
- Empty trace directories
- Zero-node execution graphs
- Missing metadata fields
- Timestamp inconsistencies

## Development Guidelines

### Adding New Tests
1. Place unit tests in `tests/unit/`
2. Use descriptive test names
3. Include both success and failure scenarios
4. Test error conditions and edge cases
5. Use `TestDataGenerator` for realistic data

### Test Data Best Practices
- Reset counters with `TestDataGenerator.resetCounters()`
- Clean up temporary files in `afterEach`
- Use unique identifiers to avoid conflicts
- Generate varied data for comprehensive testing

### Performance Test Guidelines
- Set reasonable timeout values
- Monitor memory usage throughout tests
- Include both synthetic and realistic workloads
- Document performance expectations

### E2E Test Patterns
- Use data-testid attributes for element selection
- Test complete user workflows
- Include accessibility checks
- Handle loading states and async operations

## Coverage Goals

### Minimum Coverage Requirements
- Unit tests: 95% line coverage
- Integration tests: 90% code path coverage
- E2E tests: 100% critical user flows

### Critical Areas (100% Coverage Required)
- File parsing logic
- Statistics calculation
- API endpoint handlers
- WebSocket message handling
- Error handling paths

## Debugging Test Failures

### Local Development
```bash
# Run specific test file
npx vitest tests/unit/watcher.test.ts

# Debug mode with Node inspector
npx vitest --inspect-brk tests/unit/watcher.test.ts

# Verbose output for troubleshooting
npx vitest --reporter=verbose
```

### CI/CD Debugging
- Check uploaded artifacts for test results
- Review coverage reports for missing areas
- Examine E2E screenshots and videos
- Monitor performance benchmark trends

### Common Issues
- **File system timing**: Increase wait times for file operations
- **Memory limits**: Reduce dataset sizes or increase timeout
- **WebSocket connections**: Check port availability and cleanup
- **Browser tests**: Ensure proper element waiting and error handling

## Continuous Improvement

### Metrics Tracked
- Test execution time trends
- Coverage percentage over time
- Performance benchmark results
- Flaky test identification

### Regular Maintenance
- Update test data for new features
- Refresh performance benchmarks
- Review and update error scenarios
- Optimize slow-running tests

This test suite ensures the AgentFlow Dashboard maintains high reliability and performance across all supported scenarios and use cases.