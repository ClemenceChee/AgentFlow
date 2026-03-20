---
sidebar_position: 7
title: Deployment
---

# Deployment

AgentFlow is designed to run as a persistent background service alongside your agent fleet. This page covers the most common deployment patterns.

---

## Docker

### Dashboard only

```dockerfile
FROM node:20-alpine
RUN npm install -g agentflow-dashboard
EXPOSE 3000
CMD ["agentflow-dashboard", "--host", "0.0.0.0", "--traces", "/traces"]
```

```bash
docker build -t agentflow-dashboard .
docker run -d \
  -p 3000:3000 \
  -v /var/log/my-agents:/traces:ro \
  agentflow-dashboard
```

### Dashboard + Storage (Docker Compose)

```yaml
version: '3.8'
services:
  agentflow-storage:
    image: node:18-alpine
    command: >
      sh -c "npm install -g agentflow-storage &&
             agentflow-query ingest --traces /traces --db /data/agentflow.db"
    volumes:
      - ./traces:/traces
      - ./data:/data
    restart: unless-stopped

  agentflow-dashboard:
    image: node:20-alpine
    command: >
      sh -c "npm install -g agentflow-dashboard &&
             agentflow-dashboard --host 0.0.0.0 --traces /traces --port 3000"
    ports:
      - "3000:3000"
    volumes:
      - ./traces:/traces:ro
    depends_on:
      - agentflow-storage
    restart: unless-stopped
```

Mount your agent's trace output directory as `/traces`. The storage container ingests new files as they appear; the dashboard serves the React UI.

---

## Systemd

### Dashboard service

```ini
# /etc/systemd/system/agentflow-dashboard.service
[Unit]
Description=AgentFlow Dashboard
After=network.target

[Service]
Type=simple
User=agentflow
ExecStart=/usr/local/bin/agentflow-dashboard --host 0.0.0.0 --traces /var/log/agentflow --port 3000
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### Storage ingestion service

```ini
# /etc/systemd/system/agentflow-storage.service
[Unit]
Description=AgentFlow Storage Ingestion
After=network.target

[Service]
Type=simple
User=agentflow
WorkingDirectory=/opt/agentflow
ExecStart=/usr/local/bin/agentflow-query ingest \
  --traces /var/log/agentflow \
  --db /var/lib/agentflow/storage.db
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable agentflow-dashboard agentflow-storage
sudo systemctl start agentflow-dashboard agentflow-storage
```

---

## Environment Variables

All runtime configuration can be set via environment variables, which makes container and systemd deployments clean:

```bash
# Dashboard
PORT=3000
HOST=0.0.0.0

# OTel export (optional — only needed if pushing to an external backend)
AGENTFLOW_OTEL_BACKEND=datadog          # jaeger | datadog | grafana | honeycomb | otlp
AGENTFLOW_OTEL_SERVICE=my-agent-system
AGENTFLOW_OTEL_ENDPOINT=https://custom-endpoint.com
AGENTFLOW_OTEL_SAMPLING_RATIO=0.1

# Backend-specific credentials
DD_API_KEY=your-datadog-key
HONEYCOMB_API_KEY=your-honeycomb-key
GRAFANA_TEMPO_USERNAME=your-username
GRAFANA_TEMPO_PASSWORD=your-password
```

---

## Production Tips

### Use a dedicated user

Run AgentFlow under a non-root service account (`agentflow` in the examples above). Grant it read access to the trace directory and write access to the data directory only.

### Mount traces read-only

Give the dashboard read-only access to the trace volume. Only the storage ingestion process needs write access to its own database.

```bash
# Docker
-v /var/log/my-agents:/traces:ro

# Or in compose
volumes:
  - ./traces:/traces:ro
```

### Set a retention period

Without cleanup, the SQLite database grows unbounded. Set `retentionDays` in the storage config or run the cleanup command on a schedule:

```bash
# Kubernetes CronJob runs this daily at 2 AM
agentflow-query cleanup --days 30
```

### Reverse proxy

Put Nginx or Caddy in front of the dashboard for TLS termination. The dashboard itself has no TLS support.

```nginx
server {
    listen 443 ssl;
    server_name agentflow.internal;

    ssl_certificate     /etc/ssl/agentflow.crt;
    ssl_certificate_key /etc/ssl/agentflow.key;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        # Required for WebSocket live updates
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

### Memory for large datasets

If ingesting a high volume of trace files, increase the Node.js heap:

```bash
NODE_OPTIONS="--max-old-space-size=4096" agentflow-query ingest --traces ./traces
```
