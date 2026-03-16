# AgentFlow Dashboard

Real-time monitoring dashboard for AgentFlow - Visualize agent execution graphs and performance metrics in a beautiful web interface.

## Features

- **Real-time Monitoring** - Live updates via WebSocket connections
- **Agent Performance Metrics** - Success rates, execution times, and activity tracking
- **Execution Graph Visualization** - Interactive display of agent execution flows
- **Multi-Agent System Overview** - Monitor entire agent ecosystems at once
- **Responsive Design** - Works on desktop and mobile devices
- **Zero Configuration** - Auto-discovers trace files and starts monitoring

## Quick Start

```bash
# Install globally
npm install -g @agentflow/dashboard

# Start monitoring your traces
agentflow-dashboard --traces ./traces --port 3000

# Or run with npx
npx @agentflow/dashboard --traces ./my-agent-traces
```

Open http://localhost:3000 to view the dashboard.

## Installation

```bash
npm install @agentflow/dashboard
```

**Requirements:**
- Node.js 18+
- AgentFlow traces directory

## Usage

### Command Line Interface

```bash
agentflow-dashboard [options]
```

**Options:**
- `-p, --port <number>` - Server port (default: 3000)
- `-t, --traces <path>` - Traces directory (default: ./traces)
- `-h, --host <address>` - Host address (default: localhost)
- `--cors` - Enable CORS headers
- `--help` - Show help message

### Examples

```bash
# Basic usage
agentflow-dashboard

# Custom port and traces directory
agentflow-dashboard --port 8080 --traces /var/log/agentflow

# Enable external access with CORS
agentflow-dashboard --host 0.0.0.0 --cors --port 3000

# Monitor specific agent traces
agentflow-dashboard --traces ./my-ai-agent/traces
```

### Programmatic Usage

```typescript
import { DashboardServer } from '@agentflow/dashboard';

const dashboard = new DashboardServer({
    port: 3000,
    tracesDir: './traces',
    host: 'localhost',
    enableCors: false
});

await dashboard.start();
console.log('Dashboard started!');
```

## Dashboard Interface

### Overview Page

The main dashboard shows:

- **Global Statistics** - Total agents, executions, success rate, active agents
- **Agent List** - All agents with execution counts and success rates
- **Recent Activity** - Latest agent executions with status indicators
- **Performance Trends** - Success/failure patterns over time

### Agent Details

Click any agent to view:

- **Execution History** - All recent executions for that agent
- **Performance Metrics** - Success rate, average execution time
- **Trigger Analysis** - How the agent is being invoked
- **Error Patterns** - Common failure modes and debugging info

### Real-Time Updates

The dashboard automatically updates when:

- New trace files are created
- Existing traces are updated
- Agent performance changes
- System status changes

## Configuration

### Directory Structure

The dashboard expects this structure:

```
traces/
├── agent1-2024-01-15T10-30-00.json
├── agent1-2024-01-15T10-35-00.json
├── agent2-2024-01-15T10-32-00.json
└── ...
```

### Trace File Format

Compatible with standard AgentFlow trace format:

```json
{
  "agentId": "my-agent",
  "trigger": "cron_job",
  "name": "my-agent data_processing execution",
  "timestamp": 1642234200000,
  "nodes": [...],
  "rootId": "node_1",
  "metadata": {...}
}
```

### Environment Variables

- `AGENTFLOW_DASHBOARD_PORT` - Default port
- `AGENTFLOW_DASHBOARD_HOST` - Default host
- `AGENTFLOW_TRACES_DIR` - Default traces directory

## API Endpoints

The dashboard exposes REST endpoints for integration:

### GET /api/traces
Get all trace files with metadata.

```bash
curl http://localhost:3000/api/traces
```

### GET /api/traces/:filename
Get specific trace file content.

```bash
curl http://localhost:3000/api/traces/agent1-2024-01-15T10-30-00.json
```

### GET /api/stats
Get global performance statistics.

```bash
curl http://localhost:3000/api/stats
```

### GET /api/stats/:agentId
Get statistics for specific agent.

```bash
curl http://localhost:3000/api/stats/my-agent
```

### GET /api/agents
Get list of all known agents.

```bash
curl http://localhost:3000/api/agents
```

## Integration Examples

### Docker Deployment

```dockerfile
FROM node:18-alpine

RUN npm install -g @agentflow/dashboard

EXPOSE 3000

CMD ["agentflow-dashboard", "--host", "0.0.0.0", "--traces", "/traces"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  agentflow-dashboard:
    image: node:18-alpine
    ports:
      - "3000:3000"
    volumes:
      - ./traces:/traces
    command: >
      sh -c "npm install -g @agentflow/dashboard &&
             agentflow-dashboard --host 0.0.0.0 --traces /traces"
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agentflow-dashboard
spec:
  replicas: 1
  selector:
    matchLabels:
      app: agentflow-dashboard
  template:
    metadata:
      labels:
        app: agentflow-dashboard
    spec:
      containers:
      - name: dashboard
        image: node:18-alpine
        ports:
        - containerPort: 3000
        command:
        - sh
        - -c
        - "npm install -g @agentflow/dashboard && agentflow-dashboard --host 0.0.0.0"
        volumeMounts:
        - name: traces
          mountPath: /traces
      volumes:
      - name: traces
        persistentVolumeClaim:
          claimName: agentflow-traces
```

### Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name dashboard.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Systemd Service

```ini
# /etc/systemd/system/agentflow-dashboard.service
[Unit]
Description=AgentFlow Dashboard
After=network.target

[Service]
Type=simple
User=agentflow
WorkingDirectory=/opt/agentflow
ExecStart=/usr/local/bin/agentflow-dashboard --traces /var/log/agentflow
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## Performance Tuning

### Large Trace Volumes

For high-volume agent systems:

```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" agentflow-dashboard

# Use dedicated traces directory with log rotation
agentflow-dashboard --traces /var/log/agentflow/current
```

### Network Optimization

```typescript
// Disable real-time updates for low-bandwidth connections
const dashboard = new DashboardServer({
    port: 3000,
    tracesDir: './traces',
    enableCors: true,
    // Custom update intervals can be configured
});
```

## Troubleshooting

### Common Issues

**Dashboard not loading traces:**
```bash
# Check traces directory permissions
ls -la ./traces

# Check trace file format
cat traces/agent-*.json | head -20
```

**WebSocket connection failures:**
```bash
# Check firewall settings
sudo ufw status

# Test WebSocket connectivity
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" http://localhost:3000
```

**High memory usage:**
```bash
# Monitor dashboard process
top -p $(pgrep -f agentflow-dashboard)

# Clean old trace files
find ./traces -name "*.json" -mtime +7 -delete
```

### Debug Mode

```bash
# Enable debug logging
DEBUG=agentflow:* agentflow-dashboard --traces ./traces

# Check dashboard health
curl http://localhost:3000/api/stats
```

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## License

MIT - See [LICENSE](../../LICENSE) for details.