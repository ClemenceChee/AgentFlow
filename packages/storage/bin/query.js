#!/usr/bin/env node

// Import and start the CLI
import('../dist/cli.js').then(({ startCLI }) => {
    startCLI().catch((error) => {
        console.error('Failed to start AgentFlow Storage CLI:', error);
        process.exit(1);
    });
}).catch((error) => {
    console.error('Failed to load AgentFlow Storage CLI:', error);
    process.exit(1);
});