import chokidar from 'chokidar';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import type { ExecutionGraph } from 'agentflow-core';
import { loadGraph } from 'agentflow-core';

/** Extended graph with file metadata added by the watcher. */
export interface WatchedTrace extends ExecutionGraph {
    filename?: string;
    lastModified?: number;
}

export class TraceWatcher extends EventEmitter {
    private watcher?: chokidar.FSWatcher;
    private traces = new Map<string, WatchedTrace>();
    private tracesDir: string;

    constructor(tracesDir: string) {
        super();
        this.tracesDir = path.resolve(tracesDir);
        this.ensureTracesDir();
        this.loadExistingTraces();
        this.startWatching();
    }

    private ensureTracesDir() {
        if (!fs.existsSync(this.tracesDir)) {
            fs.mkdirSync(this.tracesDir, { recursive: true });
            console.log(`Created traces directory: ${this.tracesDir}`);
        }
    }

    private loadExistingTraces() {
        try {
            const files = fs.readdirSync(this.tracesDir)
                .filter(file => file.endsWith('.json'));

            console.log(`Loading ${files.length} existing trace files...`);

            for (const file of files) {
                this.loadTraceFile(path.join(this.tracesDir, file));
            }

            console.log(`Loaded ${this.traces.size} traces`);
        } catch (error) {
            console.error('Error loading existing traces:', error);
        }
    }

    private loadTraceFile(filePath: string): boolean {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const graph = loadGraph(content) as WatchedTrace;

            const filename = path.basename(filePath);
            const stats = fs.statSync(filePath);

            graph.filename = filename;
            graph.lastModified = stats.mtime.getTime();

            this.traces.set(filename, graph);
            return true;
        } catch (error) {
            console.error(`Error loading trace file ${filePath}:`, error);
            return false;
        }
    }

    private startWatching() {
        this.watcher = chokidar.watch(this.tracesDir, {
            ignored: /^\./,
            persistent: true,
            ignoreInitial: true
        });

        this.watcher.on('add', (filePath) => {
            if (filePath.endsWith('.json')) {
                console.log(`New trace file: ${path.basename(filePath)}`);
                if (this.loadTraceFile(filePath)) {
                    const filename = path.basename(filePath);
                    const trace = this.traces.get(filename);
                    if (trace) {
                        this.emit('trace-added', trace);
                    }
                }
            }
        });

        this.watcher.on('change', (filePath) => {
            if (filePath.endsWith('.json')) {
                console.log(`Trace file updated: ${path.basename(filePath)}`);
                if (this.loadTraceFile(filePath)) {
                    const filename = path.basename(filePath);
                    const trace = this.traces.get(filename);
                    if (trace) {
                        this.emit('trace-updated', trace);
                    }
                }
            }
        });

        this.watcher.on('unlink', (filePath) => {
            if (filePath.endsWith('.json')) {
                const filename = path.basename(filePath);
                console.log(`Trace file removed: ${filename}`);
                this.traces.delete(filename);
                this.emit('trace-removed', filename);
            }
        });

        this.watcher.on('error', (error) => {
            console.error('Trace watcher error:', error);
        });

        console.log(`Started watching traces directory: ${this.tracesDir}`);
    }

    public getAllTraces(): WatchedTrace[] {
        return Array.from(this.traces.values()).sort((a, b) => {
            return (b.lastModified || b.startTime) - (a.lastModified || a.startTime);
        });
    }

    public getTrace(filename: string): WatchedTrace | undefined {
        return this.traces.get(filename);
    }

    public getTracesByAgent(agentId: string): WatchedTrace[] {
        return this.getAllTraces().filter(trace => trace.agentId === agentId);
    }

    public getRecentTraces(limit: number = 50): WatchedTrace[] {
        return this.getAllTraces().slice(0, limit);
    }

    public getTraceCount(): number {
        return this.traces.size;
    }

    public getAgentIds(): string[] {
        const agentIds = new Set<string>();
        for (const trace of this.traces.values()) {
            agentIds.add(trace.agentId);
        }
        return Array.from(agentIds).sort();
    }

    public stop() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = undefined;
            console.log('Stopped watching traces directory');
        }
    }

    public getTraceStats() {
        const total = this.traces.size;
        const agentCount = this.getAgentIds().length;
        const recentCount = this.getRecentTraces(24).length;

        const triggers = new Map<string, number>();
        for (const trace of this.traces.values()) {
            const trigger = trace.trigger || 'unknown';
            triggers.set(trigger, (triggers.get(trigger) || 0) + 1);
        }

        return {
            total,
            agentCount,
            recentCount,
            triggers: Object.fromEntries(triggers)
        };
    }
}
