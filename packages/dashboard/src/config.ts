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
