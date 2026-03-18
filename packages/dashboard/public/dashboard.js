function escapeHtml(str) {
  if (typeof str !== 'string') return str == null ? '' : String(str);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

class AgentFlowDashboard {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000;
    this.selectedAgent = null;
    this.traces = [];
    this.agents = [];
    this.stats = null;
    this.processHealth = null;

    this.init();
  }

  init() {
    this.connectWebSocket();
    this.setupEventListeners();
    this.loadInitialData();
    this.loadProcessHealth();
    this._processHealthInterval = setInterval(() => this.loadProcessHealth(), 10000);
  }

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('Connected to AgentFlow Dashboard');
      this.reconnectAttempts = 0;
      this.updateConnectionStatus(true);
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleWebSocketMessage(message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    this.ws.onclose = () => {
      console.log('Disconnected from AgentFlow Dashboard');
      this.updateConnectionStatus(false);
      this.attemptReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.updateConnectionStatus(false);
    };
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * 1.5 ** (this.reconnectAttempts - 1);

    setTimeout(() => {
      console.log(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      this.connectWebSocket();
    }, delay);
  }

  handleWebSocketMessage(message) {
    switch (message.type) {
      case 'init':
        this.traces = message.data.traces || [];
        this.stats = message.data.stats || null;
        this.updateUI();
        break;

      case 'trace-added':
        this.traces.unshift(message.data);
        this.updateTraces();
        this.refreshStats();
        break;

      case 'trace-updated': {
        const index = this.traces.findIndex((t) => t.filename === message.data.filename);
        if (index >= 0) {
          this.traces[index] = message.data;
          this.updateTraces();
        }
        break;
      }

      case 'stats-updated':
        this.stats = message.data;
        this.updateStats();
        this.updateAgents();
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  }

  async loadInitialData() {
    try {
      const [tracesRes, statsRes] = await Promise.all([fetch('/api/traces'), fetch('/api/stats')]);

      if (tracesRes.ok) {
        this.traces = await tracesRes.json();
      }

      if (statsRes.ok) {
        this.stats = await statsRes.json();
      }

      this.updateUI();
    } catch (error) {
      console.error('Error loading initial data:', error);
    }
  }

  async refreshStats() {
    try {
      const response = await fetch('/api/stats');
      if (response.ok) {
        this.stats = await response.json();
        this.updateStats();
        this.updateAgents();
      }
    } catch (error) {
      console.error('Error refreshing stats:', error);
    }
  }

  updateUI() {
    this.updateStats();
    this.updateAgents();
    this.updateTraces();
  }

  updateConnectionStatus(connected) {
    const statusEl = document.getElementById('connectionStatus');
    if (connected) {
      statusEl.textContent = 'Connected';
      statusEl.className = 'connection-status connected';
    } else {
      statusEl.textContent = 'Disconnected';
      statusEl.className = 'connection-status disconnected';
    }
  }

  updateStats() {
    const statsGrid = document.getElementById('statsGrid');

    if (!this.stats) {
      statsGrid.innerHTML = '<div class="loading">Loading statistics...</div>';
      return;
    }

    const successRate = Math.round(this.stats.globalSuccessRate * 10) / 10;

    statsGrid.innerHTML = `
            <div class="stat-card">
                <h3>Total Agents</h3>
                <div class="value">${this.stats.totalAgents}</div>
            </div>
            <div class="stat-card">
                <h3>Total Executions</h3>
                <div class="value">${this.stats.totalExecutions.toLocaleString()}</div>
            </div>
            <div class="stat-card">
                <h3>Success Rate</h3>
                <div class="value">${successRate}%</div>
            </div>
            <div class="stat-card">
                <h3>Active Agents</h3>
                <div class="value">${this.stats.activeAgents}</div>
            </div>
        `;
  }

  updateAgents() {
    const agentList = document.getElementById('agentList');

    if (!this.stats || !this.stats.topAgents) {
      agentList.innerHTML = '<div class="loading">Loading agents...</div>';
      return;
    }

    const agentItems = this.stats.topAgents
      .map((agent) => {
        const successRate = Math.round(agent.successRate * 10) / 10;
        let rateClass = 'success-rate';
        if (successRate < 50) rateClass += ' critical';
        else if (successRate < 80) rateClass += ' low';

        return `
                <div class="agent-item" data-agent-id="${agent.agentId}">
                    <div class="agent-name">${agent.agentId}</div>
                    <div class="agent-stats">
                        <span>${agent.executionCount} executions</span>
                        <span class="${rateClass}">${successRate}%</span>
                    </div>
                </div>
            `;
      })
      .join('');

    agentList.innerHTML = agentItems;
  }

  updateTraces() {
    const tracesList = document.getElementById('tracesList');

    if (!this.traces || this.traces.length === 0) {
      tracesList.innerHTML = '<div class="loading">No traces available</div>';
      return;
    }

    // Filter traces if an agent is selected
    const filteredTraces = this.selectedAgent
      ? this.traces.filter((trace) => trace.agentId === this.selectedAgent)
      : this.traces;

    const traceItems = filteredTraces
      .slice(0, 50)
      .map((trace) => {
        const timestamp = new Date(trace.timestamp).toLocaleString();
        const statusClass = this.getTraceStatusClass(trace);

        return `
                <div class="trace-item">
                    <div class="trace-header">
                        <div class="trace-name">
                            <span class="status-indicator ${statusClass}"></span>
                            ${escapeHtml(trace.name) || `${escapeHtml(trace.agentId)} execution`}
                        </div>
                        <div class="trace-timestamp">${escapeHtml(timestamp)}</div>
                    </div>
                    <div class="trace-details">
                        <div class="trace-agent">${escapeHtml(trace.agentId)}</div>
                        <div class="trace-trigger">${escapeHtml(trace.trigger)}</div>
                    </div>
                </div>
            `;
      })
      .join('');

    tracesList.innerHTML = traceItems || '<div class="loading">No traces found</div>';
  }

  getTraceStatusClass(trace) {
    // Try to determine status from the trace structure
    if (trace.nodes) {
      const nodes = Array.isArray(trace.nodes)
        ? trace.nodes.map(([, node]) => node)
        : trace.nodes instanceof Map
          ? Array.from(trace.nodes.values())
          : Object.values(trace.nodes);

      const hasFailures = nodes.some(
        (node) => node.status === 'failed' || node.error || (node.metadata && node.metadata.error),
      );

      if (hasFailures) return 'status-failure';

      const hasCompleted = nodes.some(
        (node) =>
          node.status === 'completed' ||
          node.endTime ||
          (node.metadata && node.metadata.status === 'success'),
      );

      if (hasCompleted) return 'status-success';
    }

    return 'status-unknown';
  }

  setupEventListeners() {
    // Agent selection
    document.addEventListener('click', (event) => {
      const agentItem = event.target.closest('.agent-item');
      if (agentItem) {
        const agentId = agentItem.dataset.agentId;
        this.selectAgent(agentId);
      }
    });

    // Auto-refresh every 30 seconds
    setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.refreshStats();
      }
    }, 30000);
  }

  selectAgent(agentId) {
    // Update UI selection
    document.querySelectorAll('.agent-item').forEach((item) => {
      item.classList.remove('active');
    });

    const selectedItem = document.querySelector(`[data-agent-id="${agentId}"]`);
    if (selectedItem) {
      selectedItem.classList.add('active');
      this.selectedAgent = agentId;
    } else {
      this.selectedAgent = null;
    }

    // Update traces view
    this.updateTraces();

    // Update page title
    document.title = this.selectedAgent
      ? `AgentFlow Dashboard - ${this.selectedAgent}`
      : 'AgentFlow Dashboard';
  }

  async loadProcessHealth() {
    try {
      const res = await fetch('/api/process-health');
      if (!res.ok) return;
      this.processHealth = await res.json();
      this.renderProcessHealth();
    } catch (error) {
      console.error('Error loading process health:', error);
    }
  }

  renderProcessHealth() {
    const container = document.getElementById('processHealth');
    if (!this.processHealth) {
      container.style.display = 'none';
      return;
    }

    container.style.display = '';
    const r = this.processHealth;
    let html = '<h3 class="section-title">Process Health</h3>';

    // Main status card
    html += '<div class="process-health-card"><h4>Process Status</h4>';

    // PID file info
    if (r.pidFile) {
      const pf = r.pidFile;
      const cls = pf.alive && pf.matchesProcess ? 'ok' : pf.stale ? 'bad' : 'warn';
      html += '<div class="ph-row">';
      html += '<span class="ph-label">PID File</span>';
      html += '<span class="ph-value ' + cls + '">';
      html += pf.pid ? ('PID ' + pf.pid + (pf.alive ? ' (alive)' : ' (dead)')) : 'No PID';
      html += '</span>';
      html += '</div>';
    }

    // Systemd info
    if (r.systemd) {
      const sd = r.systemd;
      const cls = sd.activeState === 'active' ? 'ok' : sd.failed ? 'bad' : 'warn';
      html += '<div class="ph-row">';
      html += '<span class="ph-label">Systemd</span>';
      html += '<span class="ph-value ' + cls + '">';
      html += escapeHtml(sd.unit) + ' \u2014 ' + escapeHtml(sd.activeState) + ' (' + escapeHtml(sd.subState) + ')';
      if (sd.restarts > 0) html += ' [' + sd.restarts + ' restarts]';
      html += '</span>';
      html += '</div>';
    }

    // Workers as dots
    if (r.workers) {
      const w = r.workers;
      html += '<div class="ph-row">';
      html += '<span class="ph-label">Workers</span>';
      html += '<div class="worker-dots">';
      for (const worker of w.workers) {
        const dotCls = worker.alive ? 'alive' : worker.stale ? 'stale' : 'unknown';
        html += '<span class="worker-dot ' + dotCls + '" title="' + escapeHtml(worker.name) + ' (pid ' + (worker.pid || '-') + ') \u2014 ' + escapeHtml(worker.declaredStatus) + '"></span>';
        html += '<span class="worker-dot-label">' + escapeHtml(worker.name) + '</span>';
      }
      html += '</div></div>';
    }

    // Problems
    if (r.problems && r.problems.length > 0) {
      html += '<ul class="problems-list">';
      for (const p of r.problems) {
        html += '<li>' + escapeHtml(p) + '</li>';
      }
      html += '</ul>';
    }

    html += '</div>';

    // Orphans section
    if (r.orphans && r.orphans.length > 0) {
      html += '<div class="process-health-card">';
      html += '<h4>Orphan Processes (' + r.orphans.length + ')</h4>';
      html += '<table class="orphan-table"><thead><tr>';
      html += '<th>PID</th><th>CPU%</th><th>MEM%</th><th>Uptime</th><th>Command</th>';
      html += '</tr></thead><tbody>';
      for (const o of r.orphans) {
        html += '<tr>';
        html += '<td>' + o.pid + '</td>';
        html += '<td>' + escapeHtml(o.cpu) + '</td>';
        html += '<td>' + escapeHtml(o.mem) + '</td>';
        html += '<td>' + escapeHtml(o.elapsed) + '</td>';
        html += '<td title="' + escapeHtml(o.cmdline || o.command) + '">' + escapeHtml(o.command) + '</td>';
        html += '</tr>';
      }
      html += '</tbody></table></div>';
    }

    container.innerHTML = html;
  }

  // Public methods for debugging
  getStats() {
    return this.stats;
  }

  getTraces() {
    return this.traces;
  }

  reconnect() {
    if (this.ws) {
      this.ws.close();
    }
    this.reconnectAttempts = 0;
    this.connectWebSocket();
  }
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
  window.dashboard = new AgentFlowDashboard();
});

// Expose dashboard for debugging
window.AgentFlowDashboard = AgentFlowDashboard;
