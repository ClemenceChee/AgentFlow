/**
 * External Command Execution Service
 *
 * Provides secure execution of configured external commands with validation,
 * sanitization, timeout handling, and audit logging.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DashboardUserConfig, ExternalCommand } from './config.js';
import { getExternalCommand, getValidatedExternalCommands } from './config.js';

export interface CommandExecutionRequest {
  /** Command ID from configuration */
  commandId: string;
  /** Additional arguments to append (optional) */
  additionalArgs?: string[];
  /** Override timeout in milliseconds */
  timeout?: number;
  /** Execution context for logging */
  context?: {
    userId?: string;
    sessionId?: string;
    requestId?: string;
  };
}

export interface CommandExecutionResult {
  /** Execution ID for tracking */
  executionId: string;
  /** Whether command started successfully */
  started: boolean;
  /** Command configuration that was executed */
  command: ExternalCommand;
  /** Process ID (if started) */
  pid?: number;
  /** Start timestamp */
  startedAt: number;
  /** End timestamp (if completed) */
  completedAt?: number;
  /** Exit code (if completed) */
  exitCode?: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Execution status */
  status: 'running' | 'completed' | 'failed' | 'timeout' | 'killed';
  /** Error message (if failed to start or other errors) */
  error?: string;
  /** Duration in milliseconds (if completed) */
  duration?: number;
}

export interface CommandValidationError {
  type: 'config_error' | 'security_violation' | 'resource_limit' | 'validation_error';
  message: string;
  commandId?: string;
}

export class CommandExecutor {
  private executions = new Map<string, CommandExecutionResult>();
  private runningProcesses = new Map<string, ChildProcess>();
  private executionCounter = 0;
  private readonly maxConcurrentExecutions: number;

  constructor(
    private config: DashboardUserConfig,
    options: {
      maxConcurrentExecutions?: number;
    } = {},
  ) {
    this.maxConcurrentExecutions =
      options.maxConcurrentExecutions ?? config.externalCommands?.maxConcurrentExecutions ?? 5;
  }

  /**
   * Execute an external command with security validation
   */
  async executeCommand(request: CommandExecutionRequest): Promise<CommandExecutionResult> {
    const executionId = this.generateExecutionId();

    try {
      // Validate the request
      const validation = this.validateExecutionRequest(request);
      if (validation.length > 0) {
        return this.createFailedResult(executionId, request.commandId, validation[0].message);
      }

      // Get validated command configuration
      const command = getExternalCommand(this.config, request.commandId);
      if (!command) {
        return this.createFailedResult(
          executionId,
          request.commandId,
          `Command "${request.commandId}" not found in configuration`,
        );
      }

      // Check concurrent execution limits
      if (!this.canStartExecution(command)) {
        return this.createFailedResult(
          executionId,
          request.commandId,
          `Cannot start command: ${command.allowConcurrent ? 'concurrent execution limit reached' : 'command already running'}`,
        );
      }

      // Create execution result
      const result: CommandExecutionResult = {
        executionId,
        started: false,
        command,
        startedAt: Date.now(),
        stdout: '',
        stderr: '',
        status: 'running',
      };

      this.executions.set(executionId, result);

      // Sanitize and prepare execution parameters
      const sanitizedArgs = this.sanitizeArguments([
        ...command.args,
        ...(request.additionalArgs ?? []),
      ]);

      const executionTimeout = request.timeout ?? command.timeout;
      const sanitizedEnv = this.sanitizeEnvironment(command.env);

      // Start the process
      const childProcess = spawn(command.command, sanitizedArgs, {
        cwd: command.cwd,
        env: { ...process.env, ...sanitizedEnv },
        stdio: ['ignore', 'pipe', 'pipe'], // stdin ignored, capture stdout/stderr
        detached: false, // Keep process attached for proper cleanup
      });

      // Update result with process info
      result.started = true;
      result.pid = childProcess.pid;
      this.runningProcesses.set(executionId, childProcess);

      // Set up timeout handling
      const timeoutHandle = setTimeout(() => {
        this.killExecution(executionId, 'timeout');
      }, executionTimeout);

      // Handle process output
      childProcess.stdout?.on('data', (data: Buffer) => {
        result.stdout += data.toString();
      });

      childProcess.stderr?.on('data', (data: Buffer) => {
        result.stderr += data.toString();
      });

      // Handle process completion
      childProcess.on('close', (code: number | null, signal: string | null) => {
        clearTimeout(timeoutHandle);
        this.runningProcesses.delete(executionId);

        result.completedAt = Date.now();
        result.duration = result.completedAt - result.startedAt;
        result.exitCode = code ?? undefined;

        if (signal) {
          result.status = result.status === 'running' ? 'killed' : result.status;
          result.error = `Process killed by signal: ${signal}`;
        } else if (code === 0) {
          result.status = 'completed';
        } else {
          result.status = 'failed';
          result.error = `Process exited with code: ${code}`;
        }

        // Log execution result
        this.logExecution(result, request.context);
      });

      childProcess.on('error', (error: Error) => {
        clearTimeout(timeoutHandle);
        this.runningProcesses.delete(executionId);

        result.completedAt = Date.now();
        result.duration = result.completedAt - result.startedAt;
        result.status = 'failed';
        result.error = `Process error: ${error.message}`;

        this.logExecution(result, request.context);
      });

      return result;
    } catch (error) {
      return this.createFailedResult(
        executionId,
        request.commandId,
        `Execution setup failed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Get execution status by ID
   */
  getExecution(executionId: string): CommandExecutionResult | null {
    return this.executions.get(executionId) ?? null;
  }

  /**
   * Get all executions (recent first)
   */
  getAllExecutions(limit = 100): CommandExecutionResult[] {
    return Array.from(this.executions.values())
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit);
  }

  /**
   * Kill a running execution
   */
  killExecution(executionId: string, reason = 'manual'): boolean {
    const execution = this.executions.get(executionId);
    const process = this.runningProcesses.get(executionId);

    if (!execution || !process) {
      return false;
    }

    try {
      process.kill('SIGTERM');

      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (this.runningProcesses.has(executionId)) {
          process.kill('SIGKILL');
        }
      }, 5000);

      if (reason === 'timeout') {
        execution.status = 'timeout';
        execution.error = 'Command execution timed out';
      } else {
        execution.status = 'killed';
        execution.error = `Command killed: ${reason}`;
      }

      return true;
    } catch (error) {
      execution.error = `Failed to kill process: ${(error as Error).message}`;
      return false;
    }
  }

  /**
   * Get currently running executions
   */
  getRunningExecutions(): CommandExecutionResult[] {
    return Array.from(this.executions.values()).filter((exec) => exec.status === 'running');
  }

  /**
   * Clean up old execution records
   */
  cleanupExecutions(maxAge = 24 * 60 * 60 * 1000): number {
    // 24 hours default
    const cutoff = Date.now() - maxAge;
    let cleaned = 0;

    for (const [id, execution] of this.executions.entries()) {
      if (execution.status !== 'running' && execution.startedAt < cutoff) {
        this.executions.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  private validateExecutionRequest(request: CommandExecutionRequest): CommandValidationError[] {
    const errors: CommandValidationError[] = [];

    // Validate command ID
    if (!request.commandId?.trim()) {
      errors.push({
        type: 'validation_error',
        message: 'Command ID is required',
      });
      return errors;
    }

    // Check if command exists in configuration
    const { commands, errors: configErrors } = getValidatedExternalCommands(this.config);

    if (configErrors.length > 0) {
      errors.push({
        type: 'config_error',
        message: `Configuration errors: ${configErrors.join(', ')}`,
      });
    }

    if (!commands[request.commandId]) {
      errors.push({
        type: 'validation_error',
        message: `Command "${request.commandId}" not found in configuration`,
        commandId: request.commandId,
      });
    }

    // Validate additional arguments
    if (request.additionalArgs) {
      for (const arg of request.additionalArgs) {
        if (this.containsUnsafeContent(arg)) {
          errors.push({
            type: 'security_violation',
            message: `Unsafe content detected in additional arguments`,
            commandId: request.commandId,
          });
          break;
        }
      }
    }

    // Validate timeout
    if (request.timeout !== undefined && (request.timeout <= 0 || request.timeout > 600000)) {
      errors.push({
        type: 'validation_error',
        message: 'Timeout must be between 1ms and 600000ms (10 minutes)',
        commandId: request.commandId,
      });
    }

    return errors;
  }

  private containsUnsafeContent(content: string): boolean {
    // Check for command injection patterns
    const dangerousPatterns = [
      /[;&|`$(){}[\]]/, // Shell metacharacters
      /\.\./, // Directory traversal
      /\/dev\/|\/proc\/|\/sys\//, // System paths
      /rm\s+-rf|rm\s+-f/i, // Dangerous rm commands
      /chmod|chown|sudo/i, // Privilege escalation
      /curl|wget|nc|telnet/i, // Network commands
    ];

    return dangerousPatterns.some((pattern) => pattern.test(content));
  }

  private sanitizeArguments(args: string[]): string[] {
    return args
      .map((arg) => {
        // Remove null bytes and control characters
        let sanitized = arg.replace(/[\x00-\x1f\x7f]/g, '');

        // Trim whitespace
        sanitized = sanitized.trim();

        // Limit length
        if (sanitized.length > 1000) {
          sanitized = sanitized.substring(0, 1000);
        }

        return sanitized;
      })
      .filter((arg) => arg.length > 0);
  }

  private sanitizeEnvironment(env?: Record<string, string>): Record<string, string> {
    const sanitized: Record<string, string> = {};

    if (!env) return sanitized;

    for (const [key, value] of Object.entries(env)) {
      // Validate environment variable name
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        continue; // Skip invalid env var names
      }

      // Sanitize value
      const sanitizedValue = value.replace(/[\x00-\x1f\x7f]/g, '').trim();

      if (sanitizedValue.length > 0 && sanitizedValue.length <= 4096) {
        sanitized[key] = sanitizedValue;
      }
    }

    return sanitized;
  }

  private canStartExecution(command: ExternalCommand): boolean {
    const running = this.getRunningExecutions();

    // Check global concurrent limit
    if (running.length >= this.maxConcurrentExecutions) {
      return false;
    }

    // Check command-specific concurrent limit
    if (!command.allowConcurrent) {
      const commandRunning = running.some((exec) => exec.command.name === command.name);

      if (commandRunning) {
        return false;
      }
    }

    return true;
  }

  private generateExecutionId(): string {
    return `exec_${Date.now()}_${++this.executionCounter}`;
  }

  private createFailedResult(
    executionId: string,
    commandId: string,
    error: string,
  ): CommandExecutionResult {
    const result: CommandExecutionResult = {
      executionId,
      started: false,
      command: {
        name: commandId,
        command: 'unknown',
        timeout: 0,
      },
      startedAt: Date.now(),
      completedAt: Date.now(),
      duration: 0,
      stdout: '',
      stderr: '',
      status: 'failed',
      error,
    };

    this.executions.set(executionId, result);
    return result;
  }

  private logExecution(
    result: CommandExecutionResult,
    context?: CommandExecutionRequest['context'],
  ): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      executionId: result.executionId,
      commandId: result.command.name,
      commandLine: `${result.command.command} ${result.command.args?.join(' ') ?? ''}`.trim(),
      status: result.status,
      duration: result.duration,
      exitCode: result.exitCode,
      pid: result.pid,
      cwd: result.command.cwd,
      timeout: result.command.timeout,
      context,
      hasOutput: result.stdout.length > 0,
      hasError: result.stderr.length > 0,
      outputSize: result.stdout.length,
      errorSize: result.stderr.length,
      error: result.error,
      userAgent: context?.userId ? `user:${context.userId}` : 'system',
      sessionId: context?.sessionId,
      requestId: context?.requestId,
    };

    // Log to console with structured format
    console.log(`[CommandExecution] ${JSON.stringify(logEntry)}`);

    // Write detailed audit log to file (if configured)
    this.writeAuditLog(logEntry, result);
  }

  /**
   * Write detailed audit log to file for compliance and debugging
   */
  private writeAuditLog(logEntry: any, result: CommandExecutionResult): void {
    try {
      const auditDir = path.join(process.cwd(), '.agentflow', 'audit');
      const auditFile = path.join(
        auditDir,
        `command-executions-${new Date().toISOString().slice(0, 10)}.jsonl`,
      );

      // Ensure audit directory exists
      if (!fs.existsSync(auditDir)) {
        fs.mkdirSync(auditDir, { recursive: true });
      }

      // Enhanced audit entry with more details
      const auditEntry = {
        ...logEntry,
        // Additional audit fields
        startedAt: new Date(result.startedAt).toISOString(),
        completedAt: result.completedAt ? new Date(result.completedAt).toISOString() : null,
        commandArgs: result.command.args,
        allowConcurrent: result.command.allowConcurrent,
        category: result.command.category,
        description: result.command.description,
        // Include first/last lines of output for audit trail
        outputPreview: result.stdout
          ? {
              firstLine: result.stdout.split('\n')[0]?.slice(0, 200) || '',
              lastLine: result.stdout.split('\n').slice(-1)[0]?.slice(0, 200) || '',
              totalLines: result.stdout.split('\n').length,
            }
          : null,
        errorPreview: result.stderr
          ? {
              firstLine: result.stderr.split('\n')[0]?.slice(0, 200) || '',
              lastLine: result.stderr.split('\n').slice(-1)[0]?.slice(0, 200) || '',
              totalLines: result.stderr.split('\n').length,
            }
          : null,
      };

      // Append to audit log file (JSONL format)
      fs.appendFileSync(auditFile, `${JSON.stringify(auditEntry)}\n`, 'utf-8');
    } catch (error) {
      console.warn(`[CommandExecutor] Failed to write audit log: ${(error as Error).message}`);
    }
  }

  /**
   * Get audit trail for a specific execution
   */
  getAuditTrail(executionId: string): any[] {
    try {
      const auditDir = path.join(process.cwd(), '.agentflow', 'audit');
      const auditEntries: any[] = [];

      if (!fs.existsSync(auditDir)) {
        return auditEntries;
      }

      // Search through recent audit files (last 7 days)
      const files = fs
        .readdirSync(auditDir)
        .filter((f) => f.startsWith('command-executions-') && f.endsWith('.jsonl'))
        .sort()
        .slice(-7); // Last 7 days

      for (const file of files) {
        const filePath = path.join(auditDir, file);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const lines = content
            .trim()
            .split('\n')
            .filter((line) => line.trim());

          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              if (entry.executionId === executionId) {
                auditEntries.push(entry);
              }
            } catch {
              // Skip invalid JSON lines
            }
          }
        } catch {
          // Skip files that can't be read
        }
      }

      return auditEntries.sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
    } catch (error) {
      console.warn(`[CommandExecutor] Failed to get audit trail: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Get audit statistics
   */
  getAuditStats(days = 7): {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageDuration: number;
    commandFrequency: Record<string, number>;
    userActivity: Record<string, number>;
  } {
    try {
      const auditDir = path.join(process.cwd(), '.agentflow', 'audit');
      const stats = {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageDuration: 0,
        commandFrequency: {} as Record<string, number>,
        userActivity: {} as Record<string, number>,
      };

      if (!fs.existsSync(auditDir)) {
        return stats;
      }

      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      let totalDuration = 0;

      const files = fs
        .readdirSync(auditDir)
        .filter((f) => f.startsWith('command-executions-') && f.endsWith('.jsonl'))
        .sort()
        .slice(-days);

      for (const file of files) {
        const filePath = path.join(auditDir, file);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const lines = content
            .trim()
            .split('\n')
            .filter((line) => line.trim());

          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              const entryTime = new Date(entry.timestamp).getTime();

              if (entryTime < cutoff) continue;

              stats.totalExecutions++;

              if (entry.status === 'completed') {
                stats.successfulExecutions++;
              } else if (['failed', 'timeout', 'killed'].includes(entry.status)) {
                stats.failedExecutions++;
              }

              if (entry.duration) {
                totalDuration += entry.duration;
              }

              // Command frequency
              const cmd = entry.commandId || 'unknown';
              stats.commandFrequency[cmd] = (stats.commandFrequency[cmd] || 0) + 1;

              // User activity
              const user = entry.userAgent || 'unknown';
              stats.userActivity[user] = (stats.userActivity[user] || 0) + 1;
            } catch {
              // Skip invalid JSON lines
            }
          }
        } catch {
          // Skip files that can't be read
        }
      }

      stats.averageDuration = stats.totalExecutions > 0 ? totalDuration / stats.totalExecutions : 0;

      return stats;
    } catch (error) {
      console.warn(`[CommandExecutor] Failed to get audit stats: ${(error as Error).message}`);
      return {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageDuration: 0,
        commandFrequency: {},
        userActivity: {},
      };
    }
  }
}

/**
 * Create a command executor instance
 */
export function createCommandExecutor(
  config: DashboardUserConfig,
  options?: {
    maxConcurrentExecutions?: number;
  },
): CommandExecutor {
  return new CommandExecutor(config, options);
}
