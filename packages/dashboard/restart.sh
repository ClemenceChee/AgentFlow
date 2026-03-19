#!/bin/bash
# Restart the AgentFlow Dashboard with OpenClaw support
set -e

cd /home/trader/agentflow/packages/dashboard

# Kill any running dashboard
pkill -f "dashboard.js.*port 3000" 2>/dev/null || true
sleep 2

# Start fresh
nohup ./bin/dashboard.js --host 0.0.0.0 --port 3000 \
  --traces /home/trader/.openclaw/workspace/traces \
  --data-dir /home/trader/.alfred/data \
  --data-dir /home/trader/.openclaw/cron \
  --data-dir /home/trader/.openclaw/cron/runs \
  --data-dir /home/trader/.openclaw/agents/main/sessions \
  --data-dir /home/trader/.openclaw/agents/vault-curator/sessions \
  --data-dir /home/trader/.openclaw/agents/vault-janitor/sessions \
  --data-dir /home/trader/.openclaw/agents/vault-distiller/sessions \
  --data-dir /tmp/openclaw \
  --cors > /tmp/agentflow-dashboard.log 2>&1 &

echo "Dashboard started with PID $!"
sleep 5

# Validate
echo "=== Agent IDs ==="
curl -s http://localhost:3000/api/traces | jq '.[].agentId' | sort -u

echo ""
echo "=== Stats ==="
curl -s http://localhost:3000/api/stats | jq '{totalAgents, totalExecutions, topAgents: [.topAgents[].agentId]}'

echo ""
echo "=== Process Health ==="
curl -s http://localhost:3000/api/process-health | jq '.osProcesses[] | select(.cmdline | contains("openclaw")) | {pid, command: .cmdline}' 2>/dev/null || echo "No openclaw processes found"

echo ""
echo "=== Last 10 log lines ==="
tail -10 /tmp/agentflow-dashboard.log
