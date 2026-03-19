import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach } from 'vitest';

// Global test setup
beforeEach(() => {
  // Set up test environment
  process.env.NODE_ENV = 'test';

  // Ensure test temp directories exist
  const testTempDir = path.join(os.tmpdir(), 'agentflow-dashboard-tests');
  if (!fs.existsSync(testTempDir)) {
    fs.mkdirSync(testTempDir, { recursive: true });
  }
});

afterEach(() => {
  // Cleanup after each test
  // Remove any test-specific temp files
  const testTempDir = path.join(os.tmpdir(), 'agentflow-dashboard-tests');
  if (fs.existsSync(testTempDir)) {
    try {
      fs.rmSync(testTempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors in tests
      console.warn('Test cleanup warning:', error);
    }
  }
});
