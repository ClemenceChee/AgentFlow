/**
 * User-configurable dashboard settings loaded from agentflow.config.json.
 *
 * All fields are optional. When no config file is found, the dashboard
 * operates with empty defaults — no hardcoded agent names or paths.
 *
 * @module
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentDetectionConfig {
  /** Map directory path substrings to agent IDs (e.g. { ".myagent/": "myagent-main" }) */
  pathPatterns?: Record<string, string>;
  /** Map filename regex patterns to agent IDs with ${match} substitution */
  filePatterns?: Record<string, string>;
}

export interface ProcessPreference {
  /** Process name to prefer */
  prefer: string;
  /** Process name to suppress when prefer is present */
  over: string;
}

export interface ExternalCommand {
  /** Human-readable name for the command */
  name: string;
  /** Command executable */
  command: string;
  /** Command arguments (optional) */
  args?: string[];
  /** Working directory for command execution (tilde-expanded) */
  cwd?: string;
  /** Environment variables to set */
  env?: Record<string, string>;
  /** Timeout in milliseconds (default: 60000) */
  timeout?: number;
  /** Command description for UI display */
  description?: string;
  /** Command category for grouping in UI */
  category?: string;
  /** Whether command can run concurrently with itself */
  allowConcurrent?: boolean;
}

export interface ExternalCommandsConfig {
  /** Map of command IDs to command configurations */
  commands?: Record<string, ExternalCommand>;
  /** Global timeout for all commands in milliseconds */
  globalTimeout?: number;
  /** Global working directory (tilde-expanded) */
  globalCwd?: string;
  /** Global environment variables for all commands */
  globalEnv?: Record<string, string>;
  /** Maximum number of concurrent command executions */
  maxConcurrentExecutions?: number;
}

export interface DashboardUserConfig {
  /** Map raw agent identifiers to canonical names */
  aliases?: Record<string, string>;
  /** Filenames to skip during trace scanning (merged with built-in structural list) */
  skipFiles?: string[];
  /** Directory names to skip during recursive scanning (merged with built-in: archive) */
  skipDirectories?: string[];
  /** Additional directories to scan for traces (tilde-expanded) */
  discoveryPaths?: string[];
  /** Systemd service unit names to query for process/directory discovery */
  systemdServices?: string[];
  /** Config-driven agent identification rules */
  agentDetection?: AgentDetectionConfig;
  /** When multiple process registries exist, prefer one over another */
  processPreference?: ProcessPreference;
  /** External commands that can be triggered from the dashboard */
  externalCommands?: ExternalCommandsConfig;
}

// ---------------------------------------------------------------------------
// Empty defaults
// ---------------------------------------------------------------------------

const EMPTY_CONFIG: DashboardUserConfig = {};

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

function expandTilde(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return join(homedir(), p.slice(1));
  }
  return p;
}

/**
 * Load user config from the first file found in resolution order:
 * 1. Explicit path (from --config flag)
 * 2. AGENTFLOW_CONFIG env var
 * 3. ./agentflow.config.json (cwd)
 * 4. ~/.config/agentflow/config.json
 *
 * Returns empty defaults if no file is found or parsing fails.
 */
export function loadConfig(explicitPath?: string): {
  config: DashboardUserConfig;
  configPath: string | null;
} {
  const candidates: string[] = [];

  if (explicitPath) {
    candidates.push(resolve(explicitPath));
  }
  if (process.env.AGENTFLOW_CONFIG) {
    candidates.push(resolve(process.env.AGENTFLOW_CONFIG));
  }
  candidates.push(resolve('agentflow.config.json'));
  candidates.push(join(homedir(), '.config', 'agentflow', 'config.json'));

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      const raw = readFileSync(candidate, 'utf-8');
      const parsed = JSON.parse(raw);
      // Strip "//" comment keys
      const cleaned = stripCommentKeys(parsed);
      console.log(`Loaded config: ${candidate}`);
      return { config: cleaned as DashboardUserConfig, configPath: candidate };
    } catch (err) {
      console.warn(`Warning: Failed to load config from ${candidate}: ${(err as Error).message}`);
      console.warn('Continuing with empty defaults.');
      return { config: EMPTY_CONFIG, configPath: null };
    }
  }

  return { config: EMPTY_CONFIG, configPath: null };
}

function stripCommentKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(stripCommentKeys);
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith('//')) continue;
      result[key] = stripCommentKeys(value);
    }
    return result;
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

export function getAliases(config: DashboardUserConfig): Record<string, string> {
  return config.aliases ?? {};
}

export function getSkipFiles(config: DashboardUserConfig): string[] {
  return config.skipFiles ?? [];
}

export function getSkipDirectories(config: DashboardUserConfig): string[] {
  return config.skipDirectories ?? [];
}

export function getDiscoveryPaths(config: DashboardUserConfig): string[] {
  return (config.discoveryPaths ?? []).map(expandTilde);
}

export function getSystemdServices(config: DashboardUserConfig): string[] {
  return config.systemdServices ?? [];
}

export function getAgentDetection(config: DashboardUserConfig): AgentDetectionConfig {
  return config.agentDetection ?? {};
}

export function getProcessPreference(config: DashboardUserConfig): ProcessPreference | null {
  return config.processPreference ?? null;
}

export function getExternalCommands(config: DashboardUserConfig): ExternalCommandsConfig {
  return config.externalCommands ?? {};
}

/**
 * Get validated external commands with expanded paths and merged global settings
 */
export function getValidatedExternalCommands(config: DashboardUserConfig): {
  commands: Record<string, ExternalCommand>;
  errors: string[];
} {
  const externalCommands = getExternalCommands(config);
  const errors: string[] = [];
  const validatedCommands: Record<string, ExternalCommand> = {};

  if (!externalCommands.commands) {
    return { commands: {}, errors: [] };
  }

  // Apply global settings and validate each command
  for (const [commandId, command] of Object.entries(externalCommands.commands)) {
    try {
      // Validate command ID
      if (!commandId.match(/^[a-z][a-z0-9-_]*$/i)) {
        errors.push(`Invalid command ID "${commandId}": must start with letter and contain only letters, numbers, hyphens, and underscores`);
        continue;
      }

      // Validate required fields
      if (!command.name?.trim()) {
        errors.push(`Command "${commandId}": name is required`);
        continue;
      }

      if (!command.command?.trim()) {
        errors.push(`Command "${commandId}": command is required`);
        continue;
      }

      // Create validated command with global defaults
      const validatedCommand: ExternalCommand = {
        name: command.name.trim(),
        command: command.command.trim(),
        args: command.args ?? [],
        cwd: expandTilde(command.cwd ?? externalCommands.globalCwd ?? process.cwd()),
        env: { ...externalCommands.globalEnv, ...command.env },
        timeout: command.timeout ?? externalCommands.globalTimeout ?? 60000,
        description: command.description?.trim() ?? '',
        category: command.category?.trim() ?? 'general',
        allowConcurrent: command.allowConcurrent ?? false,
      };

      // Validate timeout
      if (validatedCommand.timeout <= 0 || validatedCommand.timeout > 600000) {
        errors.push(`Command "${commandId}": timeout must be between 1ms and 600000ms (10 minutes)`);
        continue;
      }

      // Validate working directory exists (if absolute path)
      if (validatedCommand.cwd.startsWith('/')) {
        try {
          const fs = require('node:fs');
          const stats = fs.statSync(validatedCommand.cwd);
          if (!stats.isDirectory()) {
            errors.push(`Command "${commandId}": cwd "${validatedCommand.cwd}" is not a directory`);
            continue;
          }
        } catch (err) {
          errors.push(`Command "${commandId}": cwd "${validatedCommand.cwd}" does not exist or is not accessible`);
          continue;
        }
      }

      validatedCommands[commandId] = validatedCommand;
    } catch (error) {
      errors.push(`Command "${commandId}": validation error - ${(error as Error).message}`);
    }
  }

  return { commands: validatedCommands, errors };
}

/**
 * Check if a command ID is valid and exists in the configuration
 */
export function isValidCommandId(config: DashboardUserConfig, commandId: string): boolean {
  const { commands } = getValidatedExternalCommands(config);
  return commandId in commands;
}

/**
 * Get a specific validated external command
 */
export function getExternalCommand(config: DashboardUserConfig, commandId: string): ExternalCommand | null {
  const { commands } = getValidatedExternalCommands(config);
  return commands[commandId] ?? null;
}
