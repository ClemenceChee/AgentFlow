import chokidar from 'chokidar';
import * as fs from 'fs';
import * as path from 'path';
import { AgentFlowStorage } from './storage.js';

export class TraceIngester {
    private watcher?: chokidar.FSWatcher;
    private processedFiles = new Set<string>();
    private ingestionQueue: string[] = [];
    private isProcessing = false;

    constructor(
        private tracesDir: string,
        private storage: AgentFlowStorage,
        private options: {
            batchSize?: number;
            processInterval?: number;
        } = {}
    ) {
        this.options = {
            batchSize: 50,
            processInterval: 1000,
            ...options
        };

        this.startWatching();
        this.processExistingFiles();
        this.startProcessingQueue();
    }

    private startWatching() {
        console.log(`Starting trace file ingestion from: ${this.tracesDir}`);

        this.watcher = chokidar.watch(this.tracesDir, {
            ignored: /^\\./,
            persistent: true,
            ignoreInitial: false
        });

        this.watcher.on('add', (filePath) => {
            if (this.isTraceFile(filePath)) {
                this.queueFile(filePath);
            }
        });

        this.watcher.on('change', (filePath) => {
            if (this.isTraceFile(filePath)) {
                this.queueFile(filePath);
            }
        });

        this.watcher.on('error', (error) => {
            console.error('Trace watcher error:', error);
        });
    }

    private isTraceFile(filePath: string): boolean {
        return filePath.endsWith('.json');
    }

    private queueFile(filePath: string) {
        const filename = path.basename(filePath);

        if (!this.processedFiles.has(filename)) {
            this.ingestionQueue.push(filePath);
            console.log(`Queued trace file for ingestion: ${filename}`);
        }
    }

    private processExistingFiles() {
        try {
            const files = fs.readdirSync(this.tracesDir)
                .filter(file => this.isTraceFile(file))
                .map(file => path.join(this.tracesDir, file));

            console.log(`Found ${files.length} existing trace files to process`);

            for (const filePath of files) {
                this.queueFile(filePath);
            }
        } catch (error) {
            console.error('Error scanning existing trace files:', error);
        }
    }

    private startProcessingQueue() {
        setInterval(() => {
            if (!this.isProcessing && this.ingestionQueue.length > 0) {
                this.processQueue();
            }
        }, this.options.processInterval);
    }

    private async processQueue() {
        if (this.isProcessing || this.ingestionQueue.length === 0) {
            return;
        }

        this.isProcessing = true;
        const batchSize = this.options.batchSize!;
        const batch = this.ingestionQueue.splice(0, batchSize);

        console.log(`Processing batch of ${batch.length} trace files...`);

        let processed = 0;
        let errors = 0;

        for (const filePath of batch) {
            try {
                await this.ingestFile(filePath);
                processed++;
            } catch (error) {
                console.error(`Error ingesting ${filePath}:`, error);
                errors++;
            }
        }

        console.log(`Batch complete: ${processed} processed, ${errors} errors, ${this.ingestionQueue.length} remaining`);

        this.isProcessing = false;
    }

    private async ingestFile(filePath: string): Promise<void> {
        const filename = path.basename(filePath);

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const trace = JSON.parse(content);

            // Add file metadata
            const stats = fs.statSync(filePath);
            trace.filename = filename;
            trace.fileSize = stats.size;
            trace.lastModified = stats.mtime.getTime();

            // Normalize trace format
            const normalizedTrace = this.normalizeTrace(trace);

            await this.storage.ingestTrace(normalizedTrace);
            this.processedFiles.add(filename);

        } catch (error) {
            if (error instanceof SyntaxError) {
                console.error(`Invalid JSON in trace file ${filename}:`, error.message);
            } else {
                console.error(`Error processing trace file ${filename}:`, error);
            }
            throw error;
        }
    }

    private normalizeTrace(trace: any): any {
        // Ensure required fields
        if (!trace.agentId) {
            throw new Error('Trace missing agentId');
        }

        if (!trace.timestamp) {
            // Try to extract timestamp from filename or use file modification time
            const timestampMatch = trace.filename?.match(/(\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2})/);
            if (timestampMatch) {
                trace.timestamp = new Date(timestampMatch[1].replace(/-/g, ':')).getTime();
            } else if (trace.lastModified) {
                trace.timestamp = trace.lastModified;
            } else {
                trace.timestamp = Date.now();
            }
        }

        // Normalize nodes format
        if (Array.isArray(trace.nodes)) {
            // Handle Map serialization format
            const nodesMap = new Map(trace.nodes);
            trace.nodes = nodesMap;
        } else if (trace.nodes && typeof trace.nodes === 'object' && !(trace.nodes instanceof Map)) {
            // Convert plain object to Map
            trace.nodes = new Map(Object.entries(trace.nodes));
        }

        // Ensure basic structure
        trace.trigger = trace.trigger || 'unknown';
        trace.name = trace.name || `${trace.agentId} execution`;
        trace.metadata = trace.metadata || {};

        return trace;
    }

    public getStats() {
        return {
            totalProcessed: this.processedFiles.size,
            queueLength: this.ingestionQueue.length,
            isProcessing: this.isProcessing
        };
    }

    public reprocessFile(filename: string) {
        const filePath = path.join(this.tracesDir, filename);
        if (fs.existsSync(filePath)) {
            this.processedFiles.delete(filename);
            this.queueFile(filePath);
            console.log(`Queued file for reprocessing: ${filename}`);
        }
    }

    public reprocessAll() {
        console.log('Queuing all files for reprocessing...');
        this.processedFiles.clear();
        this.ingestionQueue = [];
        this.processExistingFiles();
    }

    public stop() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = undefined;
            console.log('Stopped trace file ingestion');
        }
    }

    // Manual ingestion for testing
    public async ingestTraceData(trace: any): Promise<void> {
        const normalizedTrace = this.normalizeTrace(trace);
        await this.storage.ingestTrace(normalizedTrace);
    }
}