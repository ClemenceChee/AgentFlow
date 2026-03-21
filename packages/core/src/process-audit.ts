/**
 * AgentFlow Process Audit — OS-level process health checks for agent systems.
 *
 * Detects stale PID files, orphan processes, systemd unit issues,
 * and mismatches between declared state (PID files, workers.json)
 * and actual OS process state.
 *
 * Linux-only (reads /proc). Returns structured results for programmatic
 * use or terminal display.
 *
 * @module
 */

import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PidFileResult {
  path: string;
  pid: number | null;
  alive: boolean;
  /** Whether /proc/<pid>/cmdline contains the expected process name. */
  matchesProcess: boolean;
  stale: boolean;
  reason: string;
}

export interface SystemdUnitResult {
  unit: string;
  activeState: string;
  subState: string;
  mainPid: number;
  restarts: number;
  result: string;
  crashLooping: boolean;
  failed: boolean;
}

export interface WorkerEntry {
  name: string;
  pid: number | null;
  declaredStatus: string;
  alive: boolean;
  stale: boolean;
}

export interface WorkersResult {
  orchestratorPid: number | null;
  orchestratorAlive: boolean;
  startedAt: string;
  workers: WorkerEntry[];
}

export interface OsProcess {
  pid: number;
  cpu: string;
  mem: string;
  /** Elapsed time since process started (e.g. "2:31:05", "03:14"). */
  elapsed: string;
  /** Process start time (e.g. "Mar18", "17:37"). */
  started: string;
  command: string;
  /** Full command line from /proc (Linux only). */
  cmdline: string;
}

export interface ProcessAuditResult {
  pidFile: PidFileResult | null;
  systemd: SystemdUnitResult | null;
  workers: WorkersResult | null;
  osProcesses: OsProcess[];
  orphans: OsProcess[];
  problems: string[];
}

export interface ProcessAuditConfig {
  /** Path to the PID file (e.g. /home/user/.myapp/data/app.pid). */
  pidFile?: string;
  /** Path to workers.json or equivalent process registry. */
  workersFile?: string;
  /** Systemd unit name (e.g. "myapp.service"). Use `null` to skip. */
  systemdUnit?: string | null;
  /** Process name to match in `pgrep -a` and /proc/cmdline (e.g. "alfred", "myagent"). */
  processName: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function pidMatchesName(pid: number, name: string): boolean {
  try {
    const cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf8');
    return cmdline.includes(name);
  } catch {
    return false;
  }
}

function readPidFile(path: string): number | null {
  try {
    const pid = parseInt(readFileSync(path, 'utf8').trim(), 10);
    return Number.isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Audit functions
// ---------------------------------------------------------------------------

function auditPidFile(config: ProcessAuditConfig): PidFileResult | null {
  if (!config.pidFile) return null;

  const pid = readPidFile(config.pidFile);
  if (pid === null) {
    return {
      path: config.pidFile,
      pid: null,
      alive: false,
      matchesProcess: false,
      stale: !existsSync(config.pidFile),
      reason: existsSync(config.pidFile)
        ? 'PID file exists but content is invalid'
        : 'No PID file found',
    };
  }

  const alive = isPidAlive(pid);
  const matchesProcess = alive ? pidMatchesName(pid, config.processName) : false;
  const stale = !alive || (alive && !matchesProcess);

  let reason: string;
  if (alive && matchesProcess) {
    reason = `PID ${pid} alive and matches ${config.processName}`;
  } else if (alive && !matchesProcess) {
    reason = `PID ${pid} alive but is NOT ${config.processName} (PID reused by another process)`;
  } else {
    reason = `PID ${pid} no longer exists`;
  }

  return { path: config.pidFile, pid, alive, matchesProcess, stale, reason };
}

function auditSystemd(config: ProcessAuditConfig): SystemdUnitResult | null {
  if (config.systemdUnit === null || config.systemdUnit === undefined) return null;

  const unit = config.systemdUnit;
  try {
    const raw = execFileSync(
      'systemctl',
      ['--user', 'show', unit, '--property=ActiveState,SubState,MainPID,NRestarts,Result', '--no-pager'],
      { encoding: 'utf8', timeout: 5000 },
    );
    const props: Record<string, string> = {};
    for (const line of raw.trim().split('\n')) {
      const [k, ...v] = line.split('=');
      if (k) props[k.trim()] = v.join('=').trim();
    }

    const activeState = props.ActiveState ?? 'unknown';
    const subState = props.SubState ?? 'unknown';
    const mainPid = parseInt(props.MainPID ?? '0', 10);
    const restarts = parseInt(props.NRestarts ?? '0', 10);
    const result = props.Result ?? 'unknown';

    return {
      unit,
      activeState,
      subState,
      mainPid,
      restarts,
      result,
      crashLooping: activeState === 'activating' && subState === 'auto-restart',
      failed: activeState === 'failed',
    };
  } catch {
    return null;
  }
}

function auditWorkers(config: ProcessAuditConfig): WorkersResult | null {
  if (!config.workersFile || !existsSync(config.workersFile)) return null;

  try {
    const data = JSON.parse(readFileSync(config.workersFile, 'utf8'));
    const orchPid = data.pid ?? null;
    const orchAlive = orchPid ? isPidAlive(orchPid) : false;

    const workers: WorkerEntry[] = [];
    for (const [name, info] of Object.entries(data.tools ?? {})) {
      const w = info as { pid?: number; status?: string; restarts?: number };
      const wPid = w.pid ?? null;
      const wAlive = wPid ? isPidAlive(wPid) : false;
      workers.push({
        name,
        pid: wPid,
        declaredStatus: w.status ?? 'unknown',
        alive: wAlive,
        stale: w.status === 'running' && !wAlive,
      });
    }

    return {
      orchestratorPid: orchPid,
      orchestratorAlive: orchAlive,
      startedAt: data.started_at ?? '',
      workers,
    };
  } catch {
    return null;
  }
}

function readCmdline(pid: number): string {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim();
  } catch {
    return '';
  }
}

function getOsProcesses(processName: string): OsProcess[] {
  try {
    // Use ps with explicit columns for reliable parsing
    const raw = execSync(`ps -eo pid,pcpu,pmem,etime,lstart,args --no-headers`, {
      encoding: 'utf8',
      timeout: 5000,
    });
    const results: OsProcess[] = [];
    for (const line of raw.split('\n')) {
      if (!line.includes(processName)) continue;
      if (line.includes('process-audit') || line.includes(' grep ')) continue;
      const trimmed = line.trim();
      // pid, cpu, mem are first 3 whitespace-delimited fields
      const parts = trimmed.split(/\s+/);
      const pid = parseInt(parts[0] ?? '0', 10);
      if (Number.isNaN(pid) || pid <= 0) continue;
      const cpu = parts[1] ?? '0';
      const mem = parts[2] ?? '0';
      const elapsed = parts[3] ?? '';
      // lstart is 5 fields: "Wed Mar 18 17:37:17 2026"
      const started = parts.slice(4, 9).join(' ');
      const command = parts.slice(9).join(' ');
      const cmdline = readCmdline(pid);

      results.push({ pid, cpu, mem, elapsed, started, command, cmdline });
    }
    return results;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Auto-discovery
// ---------------------------------------------------------------------------

/**
 * Scan directories for PID files (`*.pid`), worker registries (`workers.json`,
 * `*-workers.json`), and infer a process name from the PID file name.
 *
 * Returns a config suitable for `auditProcesses()`, or null if nothing found.
 *
 * @example
 * ```ts
 * const config = discoverProcessConfig(['./data', '/var/run/myagent']);
 * if (config) console.log(formatAuditReport(auditProcesses(config)));
 * ```
 */
export function discoverProcessConfig(dirs: string[]): ProcessAuditConfig | null {
  const configs = discoverAllProcessConfigs(dirs);
  return configs.length > 0 ? configs[0] ?? null : null;
}

/**
 * Discover all process configurations from the given directories and systemd.
 *
 * Unlike `discoverProcessConfig` which returns only the first match, this
 * scans all PID files and also discovers systemd user services to return
 * a complete list of auditable processes.
 *
 * @example
 * ```ts
 * const configs = discoverAllProcessConfigs(['./data', '/var/run']);
 * for (const config of configs) {
 *   console.log(formatAuditReport(auditProcesses(config)));
 * }
 * ```
 */
export function discoverAllProcessConfigs(dirs: string[]): ProcessAuditConfig[] {
  const configs = new Map<string, ProcessAuditConfig>();

  // Phase 1: Scan directories for PID files and worker registries
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }

    for (const f of entries) {
      const fp = join(dir, f);
      try {
        if (!statSync(fp).isFile()) continue;
      } catch {
        continue;
      }

      // PID files: *.pid
      if (f.endsWith('.pid')) {
        const name = basename(f, '.pid');
        if (!configs.has(name)) {
          configs.set(name, { processName: name });
        }
        const cfg = configs.get(name)!; // biome-ignore lint: just set above
        if (!cfg.pidFile) cfg.pidFile = fp;
      }

      // Worker registries
      if (f === 'workers.json' || f.endsWith('-workers.json')) {
        const name = f === 'workers.json' ? '' : basename(f, '-workers.json');
        if (name && !configs.has(name)) {
          configs.set(name, { processName: name });
        }
        if (name) {
          const cfg = configs.get(name)!; // biome-ignore lint: just set above
          if (!cfg.workersFile) cfg.workersFile = fp;
        }
      }
    }
  }

  // Phase 2: Discover systemd user services
  try {
    const raw = execSync(
      'systemctl --user list-units --type=service --all --no-legend --no-pager 2>/dev/null',
      { encoding: 'utf8', timeout: 5000 },
    );
    for (const line of raw.trim().split('\n')) {
      if (!line.trim()) continue;
      // Format: "unit.service loaded active running Description"
      const parts = line.trim().split(/\s+/);
      const unitName = parts[0] ?? '';
      const loadState = parts[1] ?? '';
      if (!unitName.endsWith('.service') || loadState !== 'loaded') continue;

      // Skip well-known system/internal services (not user applications)
      const name = unitName.replace('.service', '');
      if (/^(dbus|gpg-agent|dirmngr|keyboxd|snapd\.|pk-|launchpadlib-)/.test(name)) continue;

      if (!configs.has(name)) {
        configs.set(name, { processName: name });
      }
      const cfg = configs.get(name)!; // biome-ignore lint: just set above
      cfg.systemdUnit = unitName;
    }
  } catch {
    /* systemd not available */
  }

  // Phase 3: For configs from PID files without a systemd unit, try to discover one
  for (const cfg of configs.values()) {
    if (cfg.systemdUnit !== undefined) continue;
    try {
      const unitName = `${cfg.processName}.service`;
      const result = execSync(
        `systemctl --user show ${unitName} --property=LoadState --no-pager 2>/dev/null`,
        { encoding: 'utf8', timeout: 3000 },
      );
      if (result.includes('LoadState=loaded')) {
        cfg.systemdUnit = unitName;
      }
    } catch {
      /* unit not found */
    }
  }

  return [...configs.values()];
}

// ---------------------------------------------------------------------------
// Main audit
// ---------------------------------------------------------------------------

/**
 * Run a full process health audit.
 *
 * Checks PID files, systemd units, worker registries, and OS process tables
 * to detect stale processes, orphans, and state mismatches.
 *
 * @example
 * ```ts
 * import { auditProcesses, formatAuditReport } from 'agentflow-core';
 *
 * const result = auditProcesses({
 *   processName: 'alfred',
 *   pidFile: '/home/user/.alfred/data/alfred.pid',
 *   workersFile: '/home/user/.alfred/data/workers.json',
 *   systemdUnit: 'alfred.service',
 * });
 *
 * console.log(formatAuditReport(result));
 * ```
 */
export function auditProcesses(config: ProcessAuditConfig): ProcessAuditResult {
  const pidFile = auditPidFile(config);
  const systemd = auditSystemd(config);
  const workers = auditWorkers(config);
  const osProcesses = getOsProcesses(config.processName);

  // Build set of known PIDs
  const knownPids = new Set<number>();
  if (pidFile?.pid && !pidFile.stale) knownPids.add(pidFile.pid);
  if (workers) {
    if (workers.orchestratorPid) knownPids.add(workers.orchestratorPid);
    for (const w of workers.workers) {
      if (w.pid) knownPids.add(w.pid);
    }
  }
  if (systemd?.mainPid) knownPids.add(systemd.mainPid);

  // Also mark child processes of known PIDs as known (not orphans).
  // This prevents legitimate subprocesses (e.g., Milvus spawned by a worker)
  // from being flagged as orphans.
  const childPids = new Set<number>();
  for (const knownPid of knownPids) {
    try {
      const childrenRaw = readFileSync(
        `/proc/${knownPid}/task/${knownPid}/children`,
        'utf8',
      ).trim();
      if (childrenRaw) {
        for (const c of childrenRaw.split(/\s+/)) {
          const cp = parseInt(c, 10);
          if (!Number.isNaN(cp)) childPids.add(cp);
        }
      }
    } catch {
      // /proc/<pid>/task/<pid>/children may not exist on all systems; fall back to ppid check
    }
  }
  // Fallback: check /proc/<pid>/status for PPid field for each OS process
  for (const p of osProcesses) {
    if (knownPids.has(p.pid)) continue;
    try {
      const statusContent = readFileSync(`/proc/${p.pid}/status`, 'utf8');
      const ppidMatch = statusContent.match(/^PPid:\s+(\d+)/m);
      if (ppidMatch) {
        const ppid = parseInt(ppidMatch[1] ?? '0', 10);
        if (knownPids.has(ppid)) childPids.add(p.pid);
      }
    } catch {
      // process may have exited
    }
  }

  // Exclude current process and its parent from orphan detection
  const selfPid = process.pid;
  const selfPpid = process.ppid;
  const orphans = osProcesses.filter(
    (p) =>
      !knownPids.has(p.pid) && !childPids.has(p.pid) && p.pid !== selfPid && p.pid !== selfPpid,
  );

  // Collect problems
  const problems: string[] = [];
  if (pidFile?.stale) problems.push(`Stale PID file: ${pidFile.reason}`);
  if (systemd?.crashLooping) problems.push('Systemd unit is crash-looping (auto-restart)');
  if (systemd?.failed) problems.push('Systemd unit has failed');
  if (systemd && systemd.restarts > 10)
    problems.push(`High systemd restart count: ${systemd.restarts}`);
  if (pidFile?.pid && systemd?.mainPid && pidFile.pid !== systemd.mainPid) {
    problems.push(`PID mismatch: file says ${pidFile.pid}, systemd says ${systemd.mainPid}`);
  }
  if (workers) {
    for (const w of workers.workers) {
      if (w.stale) problems.push(`Worker "${w.name}" (pid ${w.pid}) declares running but is dead`);
    }
  }
  if (orphans.length > 0)
    problems.push(
      `${orphans.length} orphan process(es) not tracked by PID file or workers registry`,
    );

  return { pidFile, systemd, workers, osProcesses, orphans, problems };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Format an audit result as a human-readable terminal report.
 * Uses Unicode box-drawing characters and status icons.
 */
export function formatAuditReport(result: ProcessAuditResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(
    '\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557',
  );
  lines.push(
    '\u2551            \uD83D\uDD0D  P R O C E S S   A U D I T                      \u2551',
  );
  lines.push(
    '\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D',
  );

  // PID file
  if (result.pidFile) {
    const pf = result.pidFile;
    const icon =
      pf.pid && pf.alive && pf.matchesProcess
        ? '\u2705'
        : pf.stale
          ? '\u26A0\uFE0F '
          : '\u2139\uFE0F ';
    lines.push(`\n  PID File: ${pf.path}`);
    lines.push(`  ${icon} ${pf.reason}`);
  }

  // Systemd
  if (result.systemd) {
    const sd = result.systemd;
    const icon =
      sd.activeState === 'active'
        ? '\uD83D\uDFE2'
        : sd.crashLooping
          ? '\uD83D\uDFE1'
          : sd.failed
            ? '\uD83D\uDD34'
            : '\u26AA';
    lines.push(`\n  Systemd: ${sd.unit}`);
    lines.push(`  ${icon} State: ${sd.activeState} (${sd.subState})  Result: ${sd.result}`);
    lines.push(`     Main PID: ${sd.mainPid || 'none'}  Restarts: ${sd.restarts}`);
  }

  // Workers
  if (result.workers) {
    const w = result.workers;
    lines.push(
      `\n  Workers (orchestrator pid ${w.orchestratorPid ?? 'unknown'} ${w.orchestratorAlive ? '\u2705' : '\u274C'})`,
    );
    for (const worker of w.workers) {
      const icon =
        worker.declaredStatus === 'running' && worker.alive
          ? '\uD83D\uDFE2'
          : worker.stale
            ? '\uD83D\uDD34 STALE'
            : '\u26AA';
      lines.push(
        `  ${icon}  ${worker.name.padEnd(14)} pid=${String(worker.pid ?? '-').padEnd(8)} status=${worker.declaredStatus}`,
      );
    }
  }

  // OS processes
  if (result.osProcesses.length > 0) {
    lines.push(`\n  OS Processes (${result.osProcesses.length} total)`);
    for (const p of result.osProcesses) {
      lines.push(
        `    PID ${String(p.pid).padEnd(8)} CPU=${p.cpu.padEnd(6)} MEM=${p.mem.padEnd(6)} Up=${p.elapsed.padEnd(10)} ${p.command.substring(0, 50)}`,
      );
    }
  }

  // Orphans — detailed view for debugging
  if (result.orphans.length > 0) {
    lines.push(`\n  \u26A0\uFE0F  ${result.orphans.length} ORPHAN PROCESS(ES):`);
    for (const p of result.orphans) {
      lines.push(
        `     PID ${String(p.pid).padEnd(8)} CPU=${p.cpu.padEnd(6)} MEM=${p.mem.padEnd(6)} Up=${p.elapsed}`,
      );
      lines.push(`       Started: ${p.started}`);
      lines.push(`       Command: ${p.cmdline || p.command}`);
    }
  }

  // Summary
  lines.push('');
  if (result.problems.length === 0) {
    lines.push('  \u2705 All checks passed \u2014 no process issues detected.');
  } else {
    lines.push(`  \u26A0\uFE0F  ${result.problems.length} issue(s):`);
    for (const p of result.problems) {
      lines.push(`     \u2022 ${p}`);
    }
  }
  lines.push('');

  return lines.join('\n');
}
