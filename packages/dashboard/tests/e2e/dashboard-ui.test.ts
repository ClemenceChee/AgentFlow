import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import { TestDataGenerator } from '../fixtures/test-data-generator.js';

let tempDir: string;

test.beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-test-'));
  TestDataGenerator.resetCounters();

  // Create test data
  const tracesDir = path.join(tempDir, 'traces');
  await TestDataGenerator.createTestFiles(tracesDir, 10);
});

test.afterEach(async () => {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test.describe('Dashboard UI End-to-End Tests', () => {
  test('should load dashboard homepage', async ({ page }) => {
    await page.goto('/');

    // Check page title
    await expect(page).toHaveTitle(/AgentFlow Dashboard/);

    // Check main navigation
    await expect(page.locator('[data-testid="nav-graph"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-timeline"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-metrics"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-health"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-errors"]')).toBeVisible();

    // Check that dashboard is loading data
    await expect(page.locator('[data-testid="loading-indicator"]')).toBeVisible();
    await expect(page.locator('[data-testid="loading-indicator"]')).toBeHidden({ timeout: 10000 });

    // Check that trace list is populated
    await expect(page.locator('[data-testid="trace-list"]')).toBeVisible();
    await expect(page.locator('[data-testid="trace-item"]').first()).toBeVisible();
  });

  test('should display trace list with correct information', async ({ page }) => {
    await page.goto('/');

    // Wait for data to load
    await page.waitForSelector('[data-testid="trace-item"]');

    // Check trace item structure
    const firstTrace = page.locator('[data-testid="trace-item"]').first();

    await expect(firstTrace.locator('[data-testid="trace-agent-id"]')).toBeVisible();
    await expect(firstTrace.locator('[data-testid="trace-timestamp"]')).toBeVisible();
    await expect(firstTrace.locator('[data-testid="trace-status"]')).toBeVisible();
    await expect(firstTrace.locator('[data-testid="trace-duration"]')).toBeVisible();

    // Check status indicators
    const statusBadge = firstTrace.locator('[data-testid="trace-status"]');
    const statusText = await statusBadge.textContent();
    expect(['completed', 'failed', 'running']).toContain(statusText?.toLowerCase());

    // Verify trace count display
    const traceCount = page.locator('[data-testid="trace-count"]');
    await expect(traceCount).toBeVisible();
    const countText = await traceCount.textContent();
    expect(parseInt(countText || '0', 10)).toBeGreaterThan(0);
  });

  test('should navigate to graph view and display execution graph', async ({ page }) => {
    await page.goto('/');

    // Wait for data to load
    await page.waitForSelector('[data-testid="trace-item"]');

    // Click on first trace to view its graph
    await page.locator('[data-testid="trace-item"]').first().click();

    // Should navigate to graph view
    await expect(page.locator('[data-testid="execution-graph"]')).toBeVisible({ timeout: 5000 });

    // Check graph elements
    await expect(page.locator('[data-testid="graph-node"]')).toHaveCount({ minimum: 1 });
    await expect(page.locator('[data-testid="graph-root-node"]')).toBeVisible();

    // Check graph controls
    await expect(page.locator('[data-testid="graph-zoom-in"]')).toBeVisible();
    await expect(page.locator('[data-testid="graph-zoom-out"]')).toBeVisible();
    await expect(page.locator('[data-testid="graph-reset"]')).toBeVisible();

    // Test node interaction
    const firstNode = page.locator('[data-testid="graph-node"]').first();
    await firstNode.hover();

    // Should show node tooltip
    await expect(page.locator('[data-testid="node-tooltip"]')).toBeVisible();
    await expect(page.locator('[data-testid="tooltip-node-name"]')).toBeVisible();
    await expect(page.locator('[data-testid="tooltip-node-type"]')).toBeVisible();
  });

  test('should display timeline view with events', async ({ page }) => {
    await page.goto('/');

    // Navigate to timeline view
    await page.locator('[data-testid="nav-timeline"]').click();

    // Wait for timeline to load
    await expect(page.locator('[data-testid="timeline-container"]')).toBeVisible();

    // Check timeline elements
    await expect(page.locator('[data-testid="timeline-header"]')).toBeVisible();
    await expect(page.locator('[data-testid="timeline-axis"]')).toBeVisible();

    // Should have timeline events
    await expect(page.locator('[data-testid="timeline-event"]')).toHaveCount({ minimum: 1 });

    // Test timeline controls
    await expect(page.locator('[data-testid="timeline-zoom-in"]')).toBeVisible();
    await expect(page.locator('[data-testid="timeline-zoom-out"]')).toBeVisible();
    await expect(page.locator('[data-testid="timeline-fit"]')).toBeVisible();

    // Test event interaction
    const firstEvent = page.locator('[data-testid="timeline-event"]').first();
    await firstEvent.hover();

    // Should show event details
    await expect(page.locator('[data-testid="event-tooltip"]')).toBeVisible();
  });

  test('should show metrics dashboard with statistics', async ({ page }) => {
    await page.goto('/');

    // Navigate to metrics view
    await page.locator('[data-testid="nav-metrics"]').click();

    // Wait for metrics to load
    await expect(page.locator('[data-testid="metrics-dashboard"]')).toBeVisible();

    // Check overview metrics
    await expect(page.locator('[data-testid="total-agents"]')).toBeVisible();
    await expect(page.locator('[data-testid="total-executions"]')).toBeVisible();
    await expect(page.locator('[data-testid="success-rate"]')).toBeVisible();
    await expect(page.locator('[data-testid="active-agents"]')).toBeVisible();

    // Verify metrics values are reasonable
    const totalAgents = await page
      .locator('[data-testid="total-agents"] .metric-value')
      .textContent();
    const totalExecutions = await page
      .locator('[data-testid="total-executions"] .metric-value')
      .textContent();
    const successRate = await page
      .locator('[data-testid="success-rate"] .metric-value')
      .textContent();

    expect(parseInt(totalAgents || '0', 10)).toBeGreaterThan(0);
    expect(parseInt(totalExecutions || '0', 10)).toBeGreaterThan(0);
    expect(parseFloat(successRate || '0')).toBeGreaterThanOrEqual(0);

    // Check agent performance table
    await expect(page.locator('[data-testid="agent-performance-table"]')).toBeVisible();
    await expect(page.locator('[data-testid="performance-row"]')).toHaveCount({ minimum: 1 });

    // Check charts
    await expect(page.locator('[data-testid="success-rate-chart"]')).toBeVisible();
    await expect(page.locator('[data-testid="execution-trend-chart"]')).toBeVisible();
  });

  test('should display process health information', async ({ page }) => {
    await page.goto('/');

    // Navigate to health view
    await page.locator('[data-testid="nav-health"]').click();

    // Wait for health check to complete
    await expect(page.locator('[data-testid="health-dashboard"]')).toBeVisible();

    // Check health status indicators
    await expect(page.locator('[data-testid="health-status"]')).toBeVisible();

    // Check process list
    await expect(page.locator('[data-testid="process-list"]')).toBeVisible();

    // May or may not have processes in test environment
    const processItems = page.locator('[data-testid="process-item"]');
    const processCount = await processItems.count();

    if (processCount > 0) {
      // If processes are found, verify structure
      const firstProcess = processItems.first();
      await expect(firstProcess.locator('[data-testid="process-name"]')).toBeVisible();
      await expect(firstProcess.locator('[data-testid="process-pid"]')).toBeVisible();
      await expect(firstProcess.locator('[data-testid="process-status"]')).toBeVisible();
    }

    // Check warnings/problems section
    await expect(page.locator('[data-testid="health-problems"]')).toBeVisible();
  });

  test('should show error analysis for failed traces', async ({ page }) => {
    // First, create a trace with failures
    const tracesDir = path.join(tempDir, 'traces');
    const failedTrace = TestDataGenerator.createExecutionGraph({
      agentId: 'test-failed-agent',
      nodeCount: 5,
      failureRate: 0.6, // 60% failure rate
    });

    fs.writeFileSync(path.join(tracesDir, 'failed-trace.json'), JSON.stringify(failedTrace));

    await page.goto('/');

    // Navigate to errors view
    await page.locator('[data-testid="nav-errors"]').click();

    // Wait for error analysis to load
    await expect(page.locator('[data-testid="errors-dashboard"]')).toBeVisible();

    // Check error summary
    await expect(page.locator('[data-testid="error-summary"]')).toBeVisible();

    // Should show failed traces
    await expect(page.locator('[data-testid="failed-traces-list"]')).toBeVisible();

    // Check if our failed trace appears
    await expect(page.locator('[data-testid="failed-trace-item"]')).toHaveCount({ minimum: 1 });

    // Test error detail view
    const firstFailedTrace = page.locator('[data-testid="failed-trace-item"]').first();
    await firstFailedTrace.click();

    // Should show error details
    await expect(page.locator('[data-testid="error-details"]')).toBeVisible();
    await expect(page.locator('[data-testid="failed-nodes-list"]')).toBeVisible();

    // Check failed node information
    const failedNodes = page.locator('[data-testid="failed-node"]');
    await expect(failedNodes).toHaveCount({ minimum: 1 });

    const firstFailedNode = failedNodes.first();
    await expect(firstFailedNode.locator('[data-testid="node-name"]')).toBeVisible();
    await expect(firstFailedNode.locator('[data-testid="error-message"]')).toBeVisible();
  });

  test('should support real-time updates via WebSocket', async ({ page }) => {
    await page.goto('/');

    // Wait for initial load
    await page.waitForSelector('[data-testid="trace-item"]');

    const initialTraceCount = await page.locator('[data-testid="trace-item"]').count();

    // Add a new trace file
    const tracesDir = path.join(tempDir, 'traces');
    const newTrace = TestDataGenerator.createExecutionGraph({
      agentId: 'real-time-test-agent',
      nodeCount: 3,
    });

    fs.writeFileSync(path.join(tracesDir, 'real-time-trace.json'), JSON.stringify(newTrace));

    // Wait for WebSocket update (should appear automatically)
    await page.waitForFunction(
      (expectedCount) => {
        const traces = document.querySelectorAll('[data-testid="trace-item"]');
        return traces.length > expectedCount;
      },
      initialTraceCount,
      { timeout: 5000 },
    );

    const newTraceCount = await page.locator('[data-testid="trace-item"]').count();
    expect(newTraceCount).toBeGreaterThan(initialTraceCount);

    // Verify new trace appears in list
    const newTraceItem = page
      .locator('[data-testid="trace-item"]')
      .filter({ hasText: 'real-time-test-agent' });
    await expect(newTraceItem).toBeVisible();
  });

  test('should handle search and filtering functionality', async ({ page }) => {
    await page.goto('/');

    // Wait for data to load
    await page.waitForSelector('[data-testid="trace-item"]');

    const totalTraces = await page.locator('[data-testid="trace-item"]').count();
    expect(totalTraces).toBeGreaterThan(1);

    // Test search functionality
    const searchInput = page.locator('[data-testid="search-input"]');
    await expect(searchInput).toBeVisible();

    // Search for specific agent
    await searchInput.fill('agent-0');
    await page.waitForTimeout(500); // Allow for search debounce

    const filteredTraces = await page.locator('[data-testid="trace-item"]').count();
    expect(filteredTraces).toBeLessThanOrEqual(totalTraces);

    // Clear search
    await searchInput.clear();
    await page.waitForTimeout(500);

    const clearedTraces = await page.locator('[data-testid="trace-item"]').count();
    expect(clearedTraces).toBe(totalTraces);

    // Test status filter
    const statusFilter = page.locator('[data-testid="status-filter"]');
    if (await statusFilter.isVisible()) {
      await statusFilter.selectOption('completed');
      await page.waitForTimeout(500);

      const completedTraces = await page.locator('[data-testid="trace-item"]').count();
      expect(completedTraces).toBeGreaterThanOrEqual(0);
    }

    // Test date range filter
    const dateFilter = page.locator('[data-testid="date-filter"]');
    if (await dateFilter.isVisible()) {
      await dateFilter.fill('2026-03-19');
      await page.waitForTimeout(500);

      const dateFilteredTraces = await page.locator('[data-testid="trace-item"]').count();
      expect(dateFilteredTraces).toBeGreaterThanOrEqual(0);
    }
  });

  test('should handle responsive layout on different screen sizes', async ({ page }) => {
    await page.goto('/');

    // Test desktop layout
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForSelector('[data-testid="trace-item"]');

    // Check desktop navigation
    await expect(page.locator('[data-testid="desktop-nav"]')).toBeVisible();
    await expect(page.locator('[data-testid="mobile-nav-toggle"]')).toBeHidden();

    // Test tablet layout
    await page.setViewportSize({ width: 768, height: 1024 });

    // Navigation should adapt
    await expect(page.locator('[data-testid="mobile-nav-toggle"]')).toBeVisible();

    // Test mobile layout
    await page.setViewportSize({ width: 375, height: 667 });

    // Mobile navigation
    await page.locator('[data-testid="mobile-nav-toggle"]').click();
    await expect(page.locator('[data-testid="mobile-nav-menu"]')).toBeVisible();

    // Content should be scrollable
    await expect(page.locator('[data-testid="trace-list"]')).toBeVisible();
  });

  test('should persist view state across page refreshes', async ({ page }) => {
    await page.goto('/');

    // Navigate to metrics view
    await page.locator('[data-testid="nav-metrics"]').click();
    await expect(page.locator('[data-testid="metrics-dashboard"]')).toBeVisible();

    // Refresh page
    await page.reload();

    // Should return to metrics view (if URL routing is implemented)
    // This test depends on proper routing implementation
    await expect(page.locator('[data-testid="metrics-dashboard"]')).toBeVisible();
  });

  test('should provide accessibility features', async ({ page }) => {
    await page.goto('/');

    // Check that navigation is keyboard accessible
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-testid="nav-graph"]:focus')).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(page.locator('[data-testid="nav-timeline"]:focus')).toBeVisible();

    // Check ARIA labels and roles
    const navigation = page.locator('[data-testid="main-nav"]');
    await expect(navigation).toHaveAttribute('role', 'navigation');

    const traceList = page.locator('[data-testid="trace-list"]');
    await expect(traceList).toHaveAttribute('role', 'list');

    // Check color contrast and readability
    // This would typically require additional accessibility testing tools
    await expect(page.locator('body')).toHaveCSS('color', /^rgb\((?!255, 255, 255).*\)$/); // Not white text
    await expect(page.locator('body')).toHaveCSS('background-color', /^rgb\(.*\)$/);

    // Check that status indicators have proper ARIA labels
    const statusBadges = page.locator('[data-testid="trace-status"]');
    const firstBadge = statusBadges.first();
    await expect(firstBadge).toHaveAttribute('aria-label', /status:/i);
  });

  test('should handle error states gracefully', async ({ page }) => {
    // Simulate network error by navigating to invalid endpoint
    const response = await page.goto('/api/invalid-endpoint');
    expect(response?.status()).toBe(404);

    await page.goto('/');

    // Test with mock API error
    await page.route('/api/traces', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    await page.reload();

    // Should show error state
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="retry-button"]')).toBeVisible();

    // Test retry functionality
    await page.route('/api/traces', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ traces: [], nextCursor: null }),
      });
    });

    await page.locator('[data-testid="retry-button"]').click();

    // Error should be cleared
    await expect(page.locator('[data-testid="error-message"]')).toBeHidden();
  });
});
