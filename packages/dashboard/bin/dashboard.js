#!/usr/bin/env node

// Import and start the CLI
import('../dist/cli.js')
  .then(({ startDashboard }) => {
    startDashboard().catch((error) => {
      console.error('Failed to start AgentFlow Dashboard:', error);
      process.exit(1);
    });
  })
  .catch((error) => {
    console.error('Failed to load AgentFlow Dashboard:', error);
    process.exit(1);
  });
