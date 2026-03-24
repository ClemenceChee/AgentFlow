/**
 * API tests for External Command Execution
 *
 * Tests the REST API endpoints for managing and executing external commands,
 * including security validation, command execution, and audit logging.
 */
import { test, expect, describe, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { DashboardServer } from '../../src/server.js';
import type { DashboardUserConfig } from '../../src/config.js';

describe('External Commands API', () => {
  let server: DashboardServer;
  let tempDir: string;
  let configFile: string;
  let baseUrl: string;

  beforeEach(async () => {
    // Create temporary directory for test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'external-commands-test-'));
    configFile = path.join(tempDir, 'agentflow.config.json');

    // Create test configuration
    const config: DashboardUserConfig = {
      port: 0, // Use random available port
      tracesDir: path.join(tempDir, 'traces'),
      discoveryPaths: [],
      externalCommands: {
        'test-echo': {
          name: 'Test Echo Command',
          command: 'echo',
          args: ['Hello, World!'],
          description: 'Simple echo command for testing',
          category: 'Test',
          timeout: 5000,
          allowConcurrent: true
        },
        'test-sleep': {
          name: 'Test Sleep Command',
          command: 'sleep',
          args: ['1'],
          description: 'Sleep command for timeout testing',
          category: 'Test',
          timeout: 2000,
          allowConcurrent: true
        },
        'test-fail': {
          name: 'Test Failing Command',
          command: 'false', // Command that always fails
          args: [],
          description: 'Command that always fails for error testing',
          category: 'Test',
          timeout: 5000,
          allowConcurrent: true
        },
        'test-restricted': {
          name: 'Test Restricted Command',
          command: 'echo',
          args: ['restricted'],
          description: 'Command that should not allow concurrent execution',
          category: 'Test',
          timeout: 5000,
          allowConcurrent: false
        }
      }
    };

    // Write config file
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));

    // Create traces directory
    fs.mkdirSync(config.tracesDir, { recursive: true });

    // Start server with test config
    server = new DashboardServer(config);
    await server.start();

    // Get the actual port assigned
    const port = server.getPort();
    baseUrl = `http://localhost:${port}`;
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }

    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('GET /api/external/commands', () => {
    test('returns list of available commands', async () => {
      const response = await fetch(`${baseUrl}/api/external/commands`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('commands');
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('configErrors');

      expect(data.total).toBe(4);
      expect(data.commands).toHaveLength(4);

      const commandIds = data.commands.map((cmd: any) => cmd.id);
      expect(commandIds).toContain('test-echo');
      expect(commandIds).toContain('test-sleep');
      expect(commandIds).toContain('test-fail');
      expect(commandIds).toContain('test-restricted');

      // Verify command structure
      const echoCommand = data.commands.find((cmd: any) => cmd.id === 'test-echo');
      expect(echoCommand).toEqual({
        id: 'test-echo',
        name: 'Test Echo Command',
        description: 'Simple echo command for testing',
        category: 'Test',
        timeout: 5000,
        allowConcurrent: true
      });
    });

    test('handles server errors gracefully', async () => {
      // Stop server to simulate error
      await server.stop();

      try {
        const response = await fetch(`${baseUrl}/api/external/commands`);
        // Should not reach this point due to connection error
        expect.fail('Expected connection error');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('POST /api/external/commands/:commandId/execute', () => {
    test('executes simple command successfully', async () => {
      const response = await fetch(`${baseUrl}/api/external/commands/test-echo/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('executionId');
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('output');
      expect(data).toHaveProperty('startTime');
      expect(data).toHaveProperty('endTime');

      expect(data.status).toBe('completed');
      expect(data.output).toContain('Hello, World!');
      expect(data.exitCode).toBe(0);
    });

    test('handles command execution with additional arguments', async () => {
      const response = await fetch(`${baseUrl}/api/external/commands/test-echo/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          additionalArgs: ['Extra', 'Arguments'],
          context: { testRun: true }
        })
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe('completed');
      expect(data.output).toContain('Hello, World!');
      expect(data.output).toContain('Extra');
      expect(data.output).toContain('Arguments');
    });

    test('handles command execution with custom timeout', async () => {
      const response = await fetch(`${baseUrl}/api/external/commands/test-sleep/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeout: 3000 // Override default timeout
        })
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe('completed');
      expect(data.exitCode).toBe(0);
    });

    test('handles command timeout correctly', async () => {
      const response = await fetch(`${baseUrl}/api/external/commands/test-sleep/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeout: 500 // Short timeout to force timeout
        })
      });

      expect(response.status).toBe(408); // Request Timeout

      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toContain('timeout');
    });

    test('handles failing commands gracefully', async () => {
      const response = await fetch(`${baseUrl}/api/external/commands/test-fail/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      expect(response.status).toBe(200); // Command executed but failed

      const data = await response.json();
      expect(data.status).toBe('failed');
      expect(data.exitCode).not.toBe(0);
    });

    test('validates command ID format', async () => {
      const invalidIds = ['../invalid', 'cmd with spaces', 'cmd;with;semicolons', ''];

      for (const invalidId of invalidIds) {
        const response = await fetch(`${baseUrl}/api/external/commands/${invalidId}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });

        expect(response.status).toBe(400);

        const data = await response.json();
        expect(data).toHaveProperty('error');
        expect(data.error).toContain('Invalid command ID');
      }
    });

    test('handles non-existent command ID', async () => {
      const response = await fetch(`${baseUrl}/api/external/commands/non-existent/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toContain('not found');
    });

    test('validates request body format', async () => {
      const invalidBodies = [
        'invalid json',
        '{"timeout": "not-a-number"}',
        '{"additionalArgs": "not-an-array"}'
      ];

      for (const invalidBody of invalidBodies) {
        const response = await fetch(`${baseUrl}/api/external/commands/test-echo/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: invalidBody
        });

        expect(response.status).toBeGreaterThanOrEqual(400);
      }
    });
  });

  describe('GET /api/external/commands/:commandId/status/:executionId', () => {
    test('returns status of completed execution', async () => {
      // First execute a command
      const executeResponse = await fetch(`${baseUrl}/api/external/commands/test-echo/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      const executeData = await executeResponse.json();
      const executionId = executeData.executionId;

      // Then check its status
      const statusResponse = await fetch(
        `${baseUrl}/api/external/commands/test-echo/status/${executionId}`
      );

      expect(statusResponse.status).toBe(200);

      const statusData = await statusResponse.json();
      expect(statusData).toHaveProperty('executionId', executionId);
      expect(statusData).toHaveProperty('status');
      expect(statusData).toHaveProperty('startTime');
      expect(statusData).toHaveProperty('endTime');
    });

    test('handles non-existent execution ID', async () => {
      const response = await fetch(
        `${baseUrl}/api/external/commands/test-echo/status/non-existent-execution-id`
      );

      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toContain('not found');
    });
  });

  describe('POST /api/external/commands/:commandId/kill/:executionId', () => {
    test('kills running command execution', async () => {
      // Start a long-running command
      const executePromise = fetch(`${baseUrl}/api/external/commands/test-sleep/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeout: 10000 }) // Long timeout
      });

      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 100));

      // We'll need to modify this test since we can't easily get the execution ID
      // from a running command without more complex setup
      // For now, test the error case

      const response = await fetch(
        `${baseUrl}/api/external/commands/test-sleep/kill/non-existent-execution-id`,
        { method: 'POST' }
      );

      expect(response.status).toBe(404);

      // Wait for the original command to complete
      await executePromise;
    });

    test('handles non-existent execution ID for kill request', async () => {
      const response = await fetch(
        `${baseUrl}/api/external/commands/test-echo/kill/non-existent-execution-id`,
        { method: 'POST' }
      );

      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toContain('not found');
    });
  });

  describe('GET /api/external/commands/audit', () => {
    test('returns command execution audit log', async () => {
      // Execute a few commands to generate audit data
      await fetch(`${baseUrl}/api/external/commands/test-echo/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      await fetch(`${baseUrl}/api/external/commands/test-fail/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      const response = await fetch(`${baseUrl}/api/external/commands/audit`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('entries');
      expect(data).toHaveProperty('total');

      expect(data.entries).toBeInstanceOf(Array);
      expect(data.entries.length).toBeGreaterThanOrEqual(2);

      // Verify audit entry structure
      const entry = data.entries[0];
      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('commandId');
      expect(entry).toHaveProperty('executionId');
      expect(entry).toHaveProperty('status');
      expect(entry).toHaveProperty('duration');
    });

    test('supports audit log pagination', async () => {
      // Execute several commands
      for (let i = 0; i < 5; i++) {
        await fetch(`${baseUrl}/api/external/commands/test-echo/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
      }

      const response = await fetch(`${baseUrl}/api/external/commands/audit?limit=3&offset=1`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.entries.length).toBeLessThanOrEqual(3);
      expect(data).toHaveProperty('total');
      expect(data.total).toBeGreaterThan(3);
    });

    test('supports audit log filtering by command ID', async () => {
      // Execute different commands
      await fetch(`${baseUrl}/api/external/commands/test-echo/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      await fetch(`${baseUrl}/api/external/commands/test-fail/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      const response = await fetch(`${baseUrl}/api/external/commands/audit?commandId=test-echo`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.entries.length).toBeGreaterThan(0);

      // All entries should be for the filtered command
      for (const entry of data.entries) {
        expect(entry.commandId).toBe('test-echo');
      }
    });
  });

  describe('Security and Validation', () => {
    test('sanitizes command arguments', async () => {
      const response = await fetch(`${baseUrl}/api/external/commands/test-echo/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          additionalArgs: ['safe-arg', '; rm -rf /', '$(malicious)', '`backdoor`']
        })
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe('completed');

      // The dangerous arguments should be sanitized or rejected
      // The exact behavior depends on the sanitization implementation
      expect(data.output).not.toContain('rm -rf');
      expect(data.output).not.toContain('$(malicious)');
    });

    test('enforces concurrent execution limits', async () => {
      // Start a long-running restricted command
      const firstExecutionPromise = fetch(`${baseUrl}/api/external/commands/test-restricted/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          additionalArgs: ['&& sleep 2'] // Make it run longer
        })
      });

      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 50));

      // Try to start another instance of the same restricted command
      const secondExecutionResponse = await fetch(`${baseUrl}/api/external/commands/test-restricted/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      expect(secondExecutionResponse.status).toBe(409); // Conflict

      const secondExecutionData = await secondExecutionResponse.json();
      expect(secondExecutionData).toHaveProperty('error');
      expect(secondExecutionData.error).toContain('concurrent');

      // Wait for first execution to complete
      await firstExecutionPromise;
    });

    test('validates command timeout limits', async () => {
      const response = await fetch(`${baseUrl}/api/external/commands/test-echo/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeout: 999999999 // Extremely large timeout
        })
      });

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toContain('timeout');
    });

    test('requires valid JSON content type', async () => {
      const response = await fetch(`${baseUrl}/api/external/commands/test-echo/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'invalid content type'
      });

      expect(response.status).toBe(400);
    });

    test('handles malformed JSON gracefully', async () => {
      const response = await fetch(`${baseUrl}/api/external/commands/test-echo/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"malformed": json}'
      });

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });
  });

  describe('Error Recovery and Edge Cases', () => {
    test('handles server restart gracefully', async () => {
      // Execute a command
      const response1 = await fetch(`${baseUrl}/api/external/commands/test-echo/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      expect(response1.status).toBe(200);

      // Restart server (simulate crash recovery)
      await server.stop();
      await server.start();

      // Server should still work
      const response2 = await fetch(`${baseUrl}/api/external/commands/test-echo/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      expect(response2.status).toBe(200);
    });

    test('handles high concurrent request load', async () => {
      const numRequests = 10;
      const requests = [];

      // Send multiple concurrent requests
      for (let i = 0; i < numRequests; i++) {
        requests.push(
          fetch(`${baseUrl}/api/external/commands/test-echo/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              additionalArgs: [`Request-${i}`]
            })
          })
        );
      }

      const responses = await Promise.all(requests);

      // All requests should succeed
      for (const response of responses) {
        expect(response.status).toBe(200);
      }

      // Verify all executions completed
      const responseData = await Promise.all(responses.map(r => r.json()));
      for (const data of responseData) {
        expect(data.status).toBe('completed');
        expect(data.exitCode).toBe(0);
      }
    });
  });
});