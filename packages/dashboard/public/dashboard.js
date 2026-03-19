/**
 * AgentFlow Dashboard — Production monitoring UI for AI agent infrastructure.
 * Connects to the Express backend via REST + WebSocket.
 * Handles 860+ traces efficiently with DOM limiting and lazy loading.
 */

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
    this.maxReconnectAttempts = 20;
    this.reconnectDelay = 1000;

    this.traces = [];
    this.stats = null;
    this.processHealth = null;
    this.selectedTrace = null;
    this.selectedTraceData = null;
    this.activeTab = 'timeline';
    this.searchFilter = '';
    this.statusFilter = 'all';
    this.timeRangeFilter = 'all';
    this.activityFilter = 'all';
    this.isLive = true;

    this.cy = null;

    this.init();
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------
  init() {
    this.connectWebSocket();
    this.loadInitialData();
    this.loadProcessHealth();
    this.setupEventListeners();
    this._healthInterval = setInterval(() => this.loadProcessHealth(), 10000);
  }

  // ---------------------------------------------------------------------------
  // WebSocket with auto-reconnect + exponential backoff
  // ---------------------------------------------------------------------------
  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = protocol + '//' + window.location.host;

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (e) {
      console.error('WebSocket creation failed:', e);
      this.updateConnectionStatus(false);
      this.attemptReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.updateConnectionStatus(true);
    };

    this.ws.onmessage = (event) => {
      try {
        var message = JSON.parse(event.data);
        this.handleWebSocketMessage(message);
      } catch (e) {
        console.error('WS parse error:', e);
      }
    };

    this.ws.onclose = () => {
      this.updateConnectionStatus(false);
      this.attemptReconnect();
    };

    this.ws.onerror = () => {
      this.updateConnectionStatus(false);
    };
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    this.reconnectAttempts++;
    var delay = this.reconnectDelay * Math.min(Math.pow(1.5, this.reconnectAttempts - 1), 30);
    setTimeout(() => this.connectWebSocket(), delay);
  }

  handleWebSocketMessage(msg) {
    switch (msg.type) {
      case 'init':
        if (msg.data && msg.data.traces) this.traces = msg.data.traces;
        if (msg.data && msg.data.stats) this.stats = msg.data.stats;
        this.renderTraceList();
        this.renderStatsOverview();
        if (this.traces.length > 0 && !this.selectedTrace) {
          this.selectTrace(this.traces[0].filename);
        }
        break;
      case 'trace-added':
        if (this.isLive) {
          this.traces.unshift(msg.data);
          this.renderTraceList();
          this.refreshStats();
        }
        break;
      case 'trace-updated': {
        var idx = this.traces.findIndex(function(t) { return t.filename === msg.data.filename; });
        if (idx >= 0) this.traces[idx] = msg.data;
        this.renderTraceList();
        if (this.selectedTrace && this.selectedTrace.filename === msg.data.filename) {
          this.selectedTrace = msg.data;
          this.selectedTraceData = msg.data;
          this.renderActiveTab();
        }
        break;
      }
      case 'stats-updated':
        this.stats = msg.data;
        this.renderStatsOverview();
        break;
    }
  }

  updateConnectionStatus(connected) {
    var dot = document.getElementById('connectionDot');
    var text = document.getElementById('connectionText');
    var liveInd = document.getElementById('liveIndicator');
    if (connected) {
      dot.className = 'status-dot connected';
      text.textContent = 'Connected';
      if (liveInd) liveInd.className = 'live-indicator active';
    } else {
      dot.className = 'status-dot';
      text.textContent = 'Disconnected';
      if (liveInd) liveInd.className = 'live-indicator';
    }
  }

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------
  async loadInitialData() {
    try {
      var results = await Promise.all([
        fetch('/api/traces'),
        fetch('/api/stats')
      ]);
      if (results[0].ok) this.traces = await results[0].json();
      if (results[1].ok) this.stats = await results[1].json();
      this.renderTraceList();
      this.renderStatsOverview();
      // Auto-select first trace
      if (this.traces.length > 0 && !this.selectedTrace) {
        this.selectTrace(this.traces[0].filename);
      }
    } catch (e) {
      console.error('Initial data load failed:', e);
    }
  }

  async refreshStats() {
    try {
      var res = await fetch('/api/stats');
      if (res.ok) {
        this.stats = await res.json();
        this.renderStatsOverview();
      }
    } catch (e) {
      console.error('Stats refresh failed:', e);
    }
  }

  async loadTraceDetail(filename) {
    try {
      var res = await fetch('/api/traces/' + encodeURIComponent(filename));
      if (res.ok) {
        this.selectedTraceData = await res.json();
        this.renderActiveTab();
      }
    } catch (e) {
      console.error('Trace detail load failed:', e);
    }
  }

  async loadProcessHealth() {
    try {
      var res = await fetch('/api/process-health');
      if (!res.ok) return;
      this.processHealth = await res.json();
      this.renderProcessHealth();
    } catch (e) {
      // silent — endpoint may not always be available
    }
  }

  // ---------------------------------------------------------------------------
  // Event listeners
  // ---------------------------------------------------------------------------
  setupEventListeners() {
    var self = this;

    // Tab switching
    document.querySelectorAll('.tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        self.activeTab = tab.dataset.tab;
        document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
        tab.classList.add('active');
        document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
        document.getElementById('panel-' + self.activeTab).classList.add('active');
        self.renderActiveTab();
      });
    });

    // Search
    document.getElementById('traceSearch').addEventListener('input', function(e) {
      self.searchFilter = e.target.value.toLowerCase();
      self.renderTraceList();
    });

    // Status filter dropdown
    document.getElementById('statusFilter').addEventListener('change', function(e) {
      self.statusFilter = e.target.value;
      self.renderTraceList();
    });

    // Time range filter dropdown
    document.getElementById('timeRangeFilter').addEventListener('change', function(e) {
      self.timeRangeFilter = e.target.value;
      self.renderTraceList();
    });

    // Activity filter dropdown (if exists)
    var activityFilter = document.getElementById('activityFilter');
    if (activityFilter) {
      activityFilter.addEventListener('change', function(e) {
        self.activityFilter = e.target.value;
        self.renderTraceList();
      });
    }

    // Toolbar buttons
    document.getElementById('btnFit').addEventListener('click', function() {
      if (self.cy) self.cy.fit(50);
    });
    document.getElementById('btnLayout').addEventListener('click', function() {
      self.runCytoscapeLayout();
    });
    document.getElementById('btnExportPng').addEventListener('click', function() {
      self.exportGraphPNG();
    });
    document.getElementById('btnRefresh').addEventListener('click', function() {
      self.loadInitialData();
      self.loadProcessHealth();
    });
    document.getElementById('btnPlayPause').addEventListener('click', function() {
      self.isLive = !self.isLive;
      var btn = document.getElementById('btnPlayPause');
      btn.innerHTML = self.isLive ? '&#9208;' : '&#9654;';
      btn.title = self.isLive ? 'Pause live tail' : 'Resume live tail';
      var liveInd = document.getElementById('liveIndicator');
      if (self.isLive && self.ws && self.ws.readyState === WebSocket.OPEN) {
        liveInd.className = 'live-indicator active';
      } else {
        liveInd.className = 'live-indicator';
      }
    });

    // Node detail close
    document.getElementById('nodeDetailClose').addEventListener('click', function() {
      document.getElementById('nodeDetailPanel').classList.remove('active');
    });

    // Trace list click delegation
    document.getElementById('traceList').addEventListener('click', function(e) {
      var item = e.target.closest('.session-item');
      if (!item) return;
      var filename = item.dataset.filename;
      self.selectTrace(filename);
    });

    // Auto-refresh stats every 30s
    setInterval(function() {
      if (self.ws && self.ws.readyState === WebSocket.OPEN) {
        self.refreshStats();
      }
    }, 30000);
  }

  // ---------------------------------------------------------------------------
  // Trace selection
  // ---------------------------------------------------------------------------
  selectTrace(filename) {
    var trace = this.traces.find(function(t) { return t.filename === filename; });
    if (!trace) return;

    this.selectedTrace = trace;
    this.selectedTraceData = trace;

    // Reset process map cache when agent changes
    if (this._processMapAgent !== trace.agentId) {
      this._processMapAgent = null;
      if (this._cyProcessMap) { this._cyProcessMap.destroy(); this._cyProcessMap = null; }
    }

    // Update sidebar selection
    document.querySelectorAll('.session-item').forEach(function(el) { el.classList.remove('active'); });
    var activeEl = document.querySelector('.session-item[data-filename="' + CSS.escape(filename) + '"]');
    if (activeEl) {
      activeEl.classList.add('active');
      // Scroll into view if needed
      activeEl.scrollIntoView({ block: 'nearest' });
    }

    // Load full detail
    this.loadTraceDetail(filename);

    // Render current tab immediately with list data
    this.renderActiveTab();
  }

  // ---------------------------------------------------------------------------
  // Rendering: Stats overview bar
  // ---------------------------------------------------------------------------
  renderStatsOverview() {
    if (!this.stats) return;
    var s = this.stats;
    document.getElementById('statAgents').textContent = s.totalAgents || 0;
    document.getElementById('statExecutions').textContent = (s.totalExecutions || 0).toLocaleString();
    var rate = Math.round((s.globalSuccessRate || 0) * 10) / 10;
    var rateEl = document.getElementById('statSuccessRate');
    rateEl.textContent = rate + '%';
    rateEl.className = 'metric-value ' + (rate >= 90 ? 'success' : rate >= 70 ? 'warning' : 'error');
    document.getElementById('statActive').textContent = s.activeAgents || 0;
  }

  // ---------------------------------------------------------------------------
  // Rendering: Process Health (above metrics, not a tab)
  // ---------------------------------------------------------------------------
  renderProcessHealth() {
    var section = document.getElementById('processHealthSection');
    if (!this.processHealth) {
      section.style.display = 'none';
      return;
    }

    var r = this.processHealth;
    var hasContent = r.pidFile || r.systemd || r.workers || (r.orphans && r.orphans.length > 0) ||
                     (r.osProcesses && r.osProcesses.length > 0) || (r.problems && r.problems.length > 0);
    if (!hasContent) {
      section.style.display = 'none';
      return;
    }

    section.style.display = '';
    var html = '<h4>Process Health</h4>';

    // PID File section
    if (r.pidFile) {
      var pf = r.pidFile;
      var cls = pf.alive && pf.matchesProcess ? 'ok' : pf.stale ? 'bad' : 'warn';
      html += '<div class="ph-row">';
      html += '<span class="ph-label">PID File</span>';
      html += '<span class="ph-value ' + cls + '">';
      html += pf.pid ? ('PID ' + pf.pid + (pf.alive ? ' (alive)' : ' (dead)')) : 'No PID';
      html += '</span></div>';
    }

    // Systemd section
    if (r.systemd) {
      var sd = r.systemd;
      var sdCls = sd.activeState === 'active' ? 'ok' : sd.failed ? 'bad' : 'warn';
      html += '<div class="ph-row">';
      html += '<span class="ph-label">Systemd</span>';
      html += '<span class="ph-value ' + sdCls + '">';
      html += escapeHtml(sd.unit) + ' \u2014 ' + escapeHtml(sd.activeState) + ' (' + escapeHtml(sd.subState) + ')';
      if (sd.restarts > 0) html += ' [' + sd.restarts + ' restarts]';
      html += '</span></div>';
    }

    // Workers detailed view
    if (r.workers && r.workers.workers) {
      html += '<div class="ph-section">';
      html += '<span class="ph-label">Workers</span>';
      html += '<div class="process-grid">';
      for (var i = 0; i < r.workers.workers.length; i++) {
        var worker = r.workers.workers[i];
        var statusCls = worker.alive ? 'ok' : worker.stale ? 'bad' : 'warn';
        html += '<div class="worker-card ' + statusCls + '">';
        html += '<div class="worker-name">' + escapeHtml(worker.name) + '</div>';
        html += '<div class="worker-details">';
        html += '<span>PID: ' + (worker.pid || '-') + '</span>';
        html += '<span>' + escapeHtml(worker.declaredStatus) + '</span>';
        html += '</div></div>';
      }
      html += '</div></div>';
    }

    // Agent Services - categorize processes and build tree
    var categorized = this.categorizeProcesses(r.osProcesses || []);

    if (categorized.agents.length > 0) {
      html += '<div class="ph-section">';
      html += '<span class="ph-label">Agent Services (' + categorized.agents.length + ')</span>';

      // Build process tree for agents
      var agentTree = this.buildProcessTree(categorized.agents);
      html += this.renderProcessTree(agentTree, 'agent');
      html += '</div>';
    }

    // Infrastructure processes
    if (categorized.infrastructure.length > 0) {
      html += '<div class="ph-section">';
      html += '<span class="ph-label">Infrastructure (' + categorized.infrastructure.length + ')</span>';

      // Build process tree for infrastructure
      var infraTree = this.buildProcessTree(categorized.infrastructure);
      html += this.renderProcessTree(infraTree, 'infrastructure');
      html += '</div>';
    }

    // Orphaned processes (uncategorized)
    var uncategorized = this.getUncategorizedOrphans(r.orphans || [], categorized);
    if (uncategorized.length > 0) {
      html += '<div class="ph-section">';
      html += '<span class="ph-label">Orphans (' + uncategorized.length + ')</span>';
      html += '<div class="orphan-list">';
      for (var j = 0; j < uncategorized.length; j++) {
        var o = uncategorized[j];
        html += '<div class="orphan-row">';
        html += '<span class="orphan-pid">PID ' + o.pid + '</span>';
        html += '<span class="orphan-resources">CPU: ' + escapeHtml(o.cpu) + '% | MEM: ' + escapeHtml(o.mem) + '%</span>';
        html += '<span class="orphan-cmd" title="' + escapeHtml(o.cmdline || o.command) + '">' +
                escapeHtml((o.command || '').substring(0, 60)) + (o.command && o.command.length > 60 ? '...' : '') + '</span>';
        html += '</div>';
      }
      html += '</div></div>';
    }

    // Problems section
    if (r.problems && r.problems.length > 0) {
      html += '<div class="ph-section problems-section">';
      html += '<span class="ph-label problems">Issues</span>';
      html += '<div class="problems-list">';
      for (var k = 0; k < r.problems.length; k++) {
        html += '<div class="problem-item">⚠️ ' + escapeHtml(r.problems[k]) + '</div>';
      }
      html += '</div></div>';
    }

    section.innerHTML = html;
  }

  // Helper to categorize processes with enhanced detection and tagging
  categorizeProcesses(processes) {
    var agents = [];
    var infrastructure = [];

    console.log('Categorizing', processes.length, 'processes');

    for (var i = 0; i < processes.length; i++) {
      var proc = processes[i];
      var cmd = proc.command.toLowerCase();
      var cmdline = (proc.cmdline || '').toLowerCase();
      var service = this.detectAgentService(cmd, cmdline);
      var component = this.detectInfrastructureComponent(cmd, cmdline);
      var activityTag = this.getProcessActivityTag(cmd, cmdline, proc.pid);

      if (component) {
        infrastructure.push({
          component: component,
          pid: proc.pid,
          cpu: proc.cpu,
          mem: proc.mem,
          elapsed: proc.elapsed,
          ppid: proc.ppid,
          cmdline: proc.cmdline || proc.command,
          tag: activityTag
        });
        console.log('Detected infrastructure:', proc.pid, component, 'tag:', activityTag);
      }
      else if (service) {
        agents.push({
          service: service,
          pid: proc.pid,
          cpu: proc.cpu,
          mem: proc.mem,
          elapsed: proc.elapsed,
          ppid: proc.ppid,
          cmdline: proc.cmdline || proc.command,
          tag: activityTag
        });
        console.log('Detected agent:', proc.pid, service, 'tag:', activityTag);
      }
    }

    console.log('Categorization result:', {agents: agents.length, infrastructure: infrastructure.length});
    return { agents: agents, infrastructure: infrastructure };
  }

  // Enhanced agent service detection
  detectAgentService(cmd, cmdline) {
    // AgentFlow processes
    if (cmdline.includes('agentflow-dashboard')) return 'AgentFlow Dashboard';
    if (cmdline.includes('agentflow live')) return 'AgentFlow Live';
    if (cmdline.includes('agentflow') && cmdline.includes('server')) return 'AgentFlow Server';

    // OpenClaw ecosystem
    if (cmdline.includes('openclaw-gateway')) return 'OpenClaw Gateway';
    if (cmdline.includes('openclaw-agent')) return 'OpenClaw Agent';
    if (cmdline.includes('openclaw') && cmdline.includes('worker')) return 'OpenClaw Worker';
    if (cmdline.includes('claw-gateway')) return 'Claw Gateway';

    // Alfred workers and processes
    if (cmdline.includes('alfred') && cmdline.includes('curator')) return 'Alfred Curator';
    if (cmdline.includes('alfred') && cmdline.includes('janitor')) return 'Alfred Janitor';
    if (cmdline.includes('alfred') && cmdline.includes('distiller')) return 'Alfred Distiller';
    if (cmdline.includes('alfred') && cmdline.includes('surveyor')) return 'Alfred Surveyor';
    if (cmdline.includes('alfred') && (cmdline.includes('worker') || cmdline.includes('daemon'))) return 'Alfred Worker';
    if (cmdline.includes('.alfred')) return 'Alfred Process';

    // AI/ML agent frameworks
    if (cmdline.includes('langchain') && cmdline.includes('agent')) return 'LangChain Agent';
    if (cmdline.includes('crewai')) return 'CrewAI Agent';
    if (cmdline.includes('autogen')) return 'AutoGen Agent';
    if (cmdline.includes('mastra')) return 'Mastra Agent';

    // Node.js/Python AI processes
    if ((cmd.includes('node') || cmd.includes('python')) &&
        (cmdline.includes('agent') || cmdline.includes('ai') || cmdline.includes('llm'))) {
      return 'AI Agent Process';
    }

    // Temporal workflow processes
    if (cmdline.includes('temporal') && (cmdline.includes('worker') || cmdline.includes('agent'))) {
      return 'Temporal Agent';
    }

    // Generic agent indicators
    if (cmdline.includes('agent') &&
        (cmdline.includes('server') || cmdline.includes('worker') || cmdline.includes('daemon'))) {
      return 'Agent Service';
    }

    return null;
  }

  // Enhanced infrastructure component detection
  detectInfrastructureComponent(cmd, cmdline) {
    // Debug logging
    if (cmdline.includes('milvus')) {
      console.log('Found Milvus process:', cmdline.substring(0, 100));
    }

    // Vector databases
    if (cmd.includes('milvus') || cmdline.includes('milvus')) return 'Milvus Vector DB';
    if (cmd.includes('weaviate') || cmdline.includes('weaviate')) return 'Weaviate Vector DB';
    if (cmd.includes('pinecone') || cmdline.includes('pinecone')) return 'Pinecone Vector DB';
    if (cmd.includes('qdrant') || cmdline.includes('qdrant')) return 'Qdrant Vector DB';

    // Traditional databases
    if (cmd.includes('redis') || cmdline.includes('redis')) return 'Redis Cache';
    if (cmd.includes('postgres') || cmdline.includes('postgres')) return 'PostgreSQL';
    if (cmd.includes('mongodb') || cmdline.includes('mongo')) return 'MongoDB';

    // Message queues and workflows
    if (cmdline.includes('temporal') && cmdline.includes('server')) return 'Temporal Server';
    if (cmd.includes('rabbitmq') || cmdline.includes('rabbitmq')) return 'RabbitMQ';
    if (cmd.includes('kafka') || cmdline.includes('kafka')) return 'Apache Kafka';

    // Observability
    if (cmdline.includes('prometheus')) return 'Prometheus';
    if (cmdline.includes('grafana')) return 'Grafana';
    if (cmdline.includes('jaeger')) return 'Jaeger Tracing';

    // Container/orchestration
    if (cmd.includes('docker') && !cmdline.includes('agent')) return 'Docker';
    if (cmd.includes('k3s') || cmd.includes('kubectl')) return 'Kubernetes';

    return null;
  }

  // Get orphans that weren't categorized
  getUncategorizedOrphans(orphans, categorized) {
    var allCategorizedPids = categorized.agents.concat(categorized.infrastructure).map(function(p) { return p.pid; });
    return orphans.filter(function(o) { return allCategorizedPids.indexOf(o.pid) === -1; });
  }

  // Build hierarchical process tree from flat process list
  buildProcessTree(processes) {
    var tree = [];
    var processMap = {};

    // Create a map of all processes
    for (var i = 0; i < processes.length; i++) {
      var proc = processes[i];
      processMap[proc.pid] = {
        process: proc,
        children: []
      };
    }

    // Build parent-child relationships
    for (var j = 0; j < processes.length; j++) {
      var proc = processes[j];
      if (proc.ppid && processMap[proc.ppid]) {
        // This process has a parent in our categorized list
        processMap[proc.ppid].children.push(processMap[proc.pid]);
      } else {
        // This is a root process (no parent in our list)
        tree.push(processMap[proc.pid]);
      }
    }

    return tree;
  }

  // Render process tree with indentation
  renderProcessTree(tree, type) {
    var html = '<div class="process-tree">';

    for (var i = 0; i < tree.length; i++) {
      html += this.renderProcessNode(tree[i], type, 0);
    }

    html += '</div>';
    return html;
  }

  // Render individual process node recursively
  renderProcessNode(node, type, depth) {
    var proc = node.process;
    var indent = 'padding-left: ' + (depth * 20) + 'px;';
    var cpuNum = parseFloat(proc.cpu) || 0;
    var cpuCls = type === 'agent'
      ? (cpuNum > 50 ? 'high' : cpuNum > 10 ? 'medium' : 'low')
      : (cpuNum > 20 ? 'high' : cpuNum > 5 ? 'medium' : 'low');

    var serviceName = type === 'agent' ? proc.service : proc.component;

    var html = '<div class="process-node ' + type + '-node ' + cpuCls + '" style="' + indent + '">';

    // Process icon and name
    if (depth > 0) {
      html += '<span class="tree-connector">└─ </span>';
    }
    html += '<div class="process-main">';
    html += '<div class="process-name" title="' + escapeHtml(proc.cmdline) + '">' + escapeHtml(serviceName) + '</div>';

    // Add activity tag
    if (proc.tag && proc.tag !== 'other') {
      html += '<span class="activity-tag tag-' + proc.tag + '">' + proc.tag + '</span>';
    }

    html += '<div class="process-metrics">';
    html += '<span class="pid-badge">PID: ' + proc.pid + '</span>';
    html += '<span class="cpu-badge">CPU: ' + escapeHtml(proc.cpu) + '%</span>';
    html += '<span class="mem-badge">MEM: ' + escapeHtml(proc.mem) + '%</span>';
    html += '<span class="time-badge">Up: ' + escapeHtml(proc.elapsed) + '</span>';
    html += '</div>';
    html += '</div>';
    html += '</div>';

    // Render children recursively
    for (var i = 0; i < node.children.length; i++) {
      html += this.renderProcessNode(node.children[i], type, depth + 1);
    }

    return html;
  }

  // ---------------------------------------------------------------------------
  // Rendering: Trace list (limit to 100 most recent for perf)
  // ---------------------------------------------------------------------------
  renderTraceList() {
    var container = document.getElementById('traceList');
    var countEl = document.getElementById('traceCount');
    var self = this;

    var filtered = this.traces;

    // Search filter
    if (this.searchFilter) {
      var sf = this.searchFilter;
      filtered = filtered.filter(function(t) {
        return (t.agentId || '').toLowerCase().indexOf(sf) >= 0 ||
               (t.name || '').toLowerCase().indexOf(sf) >= 0 ||
               (t.filename || '').toLowerCase().indexOf(sf) >= 0;
      });
    }

    // Time range filter
    if (this.timeRangeFilter !== 'all') {
      var now = Date.now();
      var cutoff;
      switch (this.timeRangeFilter) {
        case '1h': cutoff = now - 3600000; break;
        case '24h': cutoff = now - 86400000; break;
        case '7d': cutoff = now - 604800000; break;
        default: cutoff = 0;
      }
      filtered = filtered.filter(function(t) {
        var ts = t.timestamp ? new Date(t.timestamp).getTime() : (t.startTime || t.lastModified || 0);
        return ts >= cutoff;
      });
    }

    // Status filter
    if (this.statusFilter !== 'all') {
      var statusTarget = this.statusFilter;
      filtered = filtered.filter(function(t) {
        return self.getTraceStatus(t) === statusTarget;
      });
    }

    // Activity filter
    if (this.activityFilter && this.activityFilter !== 'all') {
      var activityTarget = this.activityFilter;
      filtered = filtered.filter(function(t) {
        return self.getTraceActivity(t) === activityTarget;
      });
    }

    countEl.textContent = filtered.length + ' of ' + this.traces.length + ' traces';

    // Render max 100 items for performance
    var visible = filtered.slice(0, 100);

    if (visible.length === 0) {
      container.innerHTML = '<div class="empty-state" style="height:120px;"><div class="empty-state-text">No traces match the filter.</div></div>';
      return;
    }

    var html = '';
    for (var i = 0; i < visible.length; i++) {
      var trace = visible[i];
      var status = this.getTraceStatus(trace);
      var isActive = this.selectedTrace && this.selectedTrace.filename === trace.filename;
      var name = trace.name || trace.agentId || trace.filename;
      var ts = this.formatTimestamp(trace.timestamp || trace.startTime || trace.lastModified);
      var badgeClass = status === 'success' ? 'badge-success' : status === 'failure' ? 'badge-error' : status === 'running' ? 'badge-running' : 'badge-unknown';
      var badgeText = status === 'success' ? 'OK' : status === 'failure' ? 'FAIL' : status === 'running' ? 'LIVE' : '?';

      // Compute node stats for this trace
      var traceNodes = this.getNodesArray(trace);
      var nodeCount = traceNodes.length;
      var agentCount = 0, toolCount = 0, subagentCount = 0, otherCount = 0;
      for (var j = 0; j < traceNodes.length; j++) {
        var nt = traceNodes[j].type;
        if (nt === 'agent') agentCount++;
        else if (nt === 'tool') toolCount++;
        else if (nt === 'subagent') subagentCount++;
        else otherCount++;
      }
      var traceDuration = this.computeDuration(trace.startTime, traceNodes.length > 0 ? Math.max.apply(null, traceNodes.map(function(n) { return n.endTime ? new Date(n.endTime).getTime() : 0; }).filter(function(v) { return v > 0; })) || null : null);
      var sourceLabel = trace.sourceType === 'session' ? 'session' : 'trace';

      html += '<div class="session-item' + (isActive ? ' active' : '') + '" data-filename="' + escapeHtml(trace.filename) + '">';
      html += '<div class="session-id" title="' + escapeHtml(trace.filename) + '">' + escapeHtml(name.length > 45 ? name.substring(0, 42) + '...' : name) + '</div>';
      html += '<div class="session-meta">';
      html += '<span class="session-agent">' + escapeHtml(trace.agentId || '') + '</span>';
      html += '<span>' + escapeHtml(ts) + '</span>';
      html += '<span class="badge ' + badgeClass + '">' + badgeText + '</span>';
      html += '</div>';
      // Node type breakdown + duration
      html += '<div class="session-meta" style="margin-top:3px;">';
      html += '<span style="font-size:0.7rem;color:var(--accent-primary);">' + nodeCount + ' nodes</span>';
      if (agentCount > 0) html += '<span class="badge badge-type badge-agent">' + agentCount + ' agent</span>';
      if (toolCount > 0) html += '<span class="badge badge-type badge-tool">' + toolCount + ' tool</span>';
      if (subagentCount > 0) html += '<span class="badge badge-type badge-subagent">' + subagentCount + ' sub</span>';
      if (otherCount > 0) html += '<span class="badge badge-type badge-other">' + otherCount + ' other</span>';
      if (traceDuration !== '--') html += '<span style="font-size:0.7rem;color:var(--text-secondary);">' + escapeHtml(traceDuration) + '</span>';
      if (trace.tokenUsage && trace.tokenUsage.total > 0) {
        html += '<span style="font-size:0.7rem;color:#bc8cff;">' + (trace.tokenUsage.total > 1000 ? Math.round(trace.tokenUsage.total/1000) + 'k' : trace.tokenUsage.total) + ' tok</span>';
        if (trace.tokenUsage.cost > 0) {
          html += '<span style="font-size:0.7rem;color:#f0883e;">$' + trace.tokenUsage.cost.toFixed(4) + '</span>';
        }
      }
      html += '</div>';
      html += '</div>';
    }

    container.innerHTML = html;
  }

  getTraceStatus(trace) {
    if (!trace.nodes) return 'unknown';
    var nodes = this.getNodesArray(trace);
    if (nodes.length === 0) return 'unknown';
    var hasFailed = nodes.some(function(n) { return n.status === 'failed' || (n.metadata && n.metadata.error); });
    if (hasFailed) return 'failure';
    var hasRunning = nodes.some(function(n) { return n.status === 'running'; });
    if (hasRunning) return 'running';
    var hasCompleted = nodes.some(function(n) { return n.status === 'completed' || n.endTime; });
    if (hasCompleted) return 'success';
    return 'unknown';
  }

  getNodesArray(trace) {
    if (!trace.nodes) return [];
    if (Array.isArray(trace.nodes)) {
      return trace.nodes.map(function(entry) { return Array.isArray(entry) ? entry[1] : entry; });
    }
    if (trace.nodes instanceof Map) return Array.from(trace.nodes.values());
    return Object.values(trace.nodes);
  }

  formatTimestamp(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return String(ts);
    var now = new Date();
    var diffMs = now - d;
    if (diffMs < 60000) return 'just now';
    if (diffMs < 3600000) return Math.floor(diffMs / 60000) + 'm ago';
    if (diffMs < 86400000) return Math.floor(diffMs / 3600000) + 'h ago';
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  computeDuration(startTime, endTime) {
    if (!startTime || !endTime) return '--';
    var ms = new Date(endTime).getTime() - new Date(startTime).getTime();
    if (isNaN(ms) || ms < 0) return '--';
    if (ms < 1000) return ms + 'ms';
    if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
    return (ms / 60000).toFixed(1) + 'm';
  }

  formatDuration(ms) {
    if (!ms || ms <= 0) return '--';
    if (ms < 1000) return Math.round(ms) + 'ms';
    if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
    return (ms / 60000).toFixed(1) + 'm';
  }

  // ---------------------------------------------------------------------------
  // Render active tab
  // ---------------------------------------------------------------------------
  renderActiveTab() {
    switch (this.activeTab) {
      case 'timeline': this.renderTimeline(); break;
      case 'metrics': this.renderMetrics(); break;
      case 'graph': this.renderGraph(); break;
      case 'heatmap': this.renderHeatmap(); break;
      case 'state': this.renderStateMachine(); break;
      case 'summary': this.renderSummary(); break;
      case 'transcript': this.renderTranscript(); break;
      case 'processmap': this.renderProcessMap(); break;
    }
    this.updateToolbarInfo();
  }

  updateToolbarInfo() {
    var info = document.getElementById('toolbarInfo');
    var trace = this.selectedTraceData || this.selectedTrace;
    if (!trace) {
      info.textContent = '';
      return;
    }
    var nodes = this.getNodesArray(trace);
    info.textContent = nodes.length + ' nodes' + (trace.agentId ? ' | ' + trace.agentId : '');
  }

  // ---------------------------------------------------------------------------
  // Tab 1: Timeline
  // ---------------------------------------------------------------------------
  renderTimeline() {
    var container = document.getElementById('timelineContent');
    var trace = this.selectedTraceData || this.selectedTrace;
    if (!trace || !trace.nodes) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#9776;</div><div class="empty-state-title">Select a trace</div><div class="empty-state-text">Choose a trace from the sidebar to view its execution timeline.</div></div>';
      return;
    }

    // For session traces, render rich session timeline if available
    if (trace.sourceType === 'session') {
      this.renderSessionTimeline(trace, container);
      return;
    }

    var nodes = this.getNodesArray(trace);
    if (nodes.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-text">No nodes in this trace.</div></div>';
      return;
    }

    // Build depth map for tree indentation
    var nodeMap = {};
    for (var j = 0; j < nodes.length; j++) {
      if (nodes[j].id) nodeMap[nodes[j].id] = nodes[j];
    }
    var depthCache = {};
    var getDepth = function(nid, visited) {
      if (!nid || (visited && visited.has(nid))) return 0;
      if (depthCache[nid] !== undefined) return depthCache[nid];
      var nd = nodeMap[nid];
      if (!nd || !nd.parentId) { depthCache[nid] = 0; return 0; }
      var vis = visited || new Set();
      vis.add(nid);
      depthCache[nid] = 1 + getDepth(nd.parentId, vis);
      return depthCache[nid];
    };
    for (var k = 0; k < nodes.length; k++) getDepth(nodes[k].id);

    // Compute timeline range for duration bars
    var allStarts = nodes.map(function(n) { return n.startTime ? new Date(n.startTime).getTime() : Infinity; }).filter(function(v) { return isFinite(v); });
    var allEnds = nodes.map(function(n) { return n.endTime ? new Date(n.endTime).getTime() : 0; }).filter(function(v) { return v > 0; });
    var timelineStart = allStarts.length > 0 ? Math.min.apply(null, allStarts) : 0;
    var timelineEnd = allEnds.length > 0 ? Math.max.apply(null, allEnds) : 0;
    var timelineSpan = timelineEnd - timelineStart || 1;

    // Sort by startTime then depth
    var sorted = nodes.slice().sort(function(a, b) {
      var sa = a.startTime ? new Date(a.startTime).getTime() : Infinity;
      var sb = b.startTime ? new Date(b.startTime).getTime() : Infinity;
      if (sa !== sb) return sa - sb;
      return (depthCache[a.id] || 0) - (depthCache[b.id] || 0);
    });

    // Type icons
    var typeIcons = { agent: '\ud83e\udd16', tool: '\ud83d\udee0\ufe0f', subagent: '\ud83d\udc64', wait: '\u23f3', decision: '\ud83d\udd00', custom: '\u2b50', exec: '\u25b6\ufe0f' };
    var statusIcons = { completed: '\u2705', failed: '\u274c', running: '\ud83d\udfe2', hung: '\u26a0\ufe0f', timeout: '\u23f0' };

    var html = '';
    // Summary header
    html += '<div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;">';
    var typeCounts = {};
    for (var m = 0; m < sorted.length; m++) { var tt = sorted[m].type || 'unknown'; typeCounts[tt] = (typeCounts[tt] || 0) + 1; }
    html += '<span style="font-size:0.85rem;color:var(--text-secondary);">' + sorted.length + ' nodes</span>';
    var typeEntries = Object.entries(typeCounts);
    for (var p = 0; p < typeEntries.length; p++) {
      var tIcon = typeIcons[typeEntries[p][0]] || '\u25cf';
      html += '<span class="badge badge-type badge-' + escapeHtml(typeEntries[p][0]) + '">' + tIcon + ' ' + typeEntries[p][1] + ' ' + escapeHtml(typeEntries[p][0]) + '</span>';
    }
    if (timelineSpan > 1) {
      html += '<span style="font-size:0.85rem;color:var(--text-secondary);">Total: ' + this.formatDuration(timelineSpan) + '</span>';
    }
    html += '</div>';

    for (var i = 0; i < sorted.length; i++) {
      var n = sorted[i];
      var depth = depthCache[n.id] || 0;
      var markerClass = n.status === 'failed' ? 'failed' :
                        n.status === 'completed' ? 'completed' :
                        n.status === 'running' ? 'running' :
                        n.status === 'hung' || n.status === 'timeout' ? 'hung' :
                        n.type === 'agent' ? 'agent' :
                        n.type === 'tool' ? 'tool' :
                        n.type === 'subagent' ? 'subagent' : 'agent';

      var typeIcon = typeIcons[n.type] || '\u25cf';
      var statusIcon = statusIcons[n.status] || '';
      var eventName = escapeHtml(n.name || n.id || 'unnamed');
      var eventTs = n.startTime ? new Date(n.startTime).toLocaleTimeString() : '--';
      var dur = this.computeDuration(n.startTime, n.endTime);
      var durMs = (n.startTime && n.endTime) ? new Date(n.endTime).getTime() - new Date(n.startTime).getTime() : 0;

      // Duration bar width proportional to timeline
      var barLeft = 0, barWidth = 0;
      if (n.startTime && timelineSpan > 1) {
        barLeft = ((new Date(n.startTime).getTime() - timelineStart) / timelineSpan) * 100;
        barWidth = Math.max(1, (durMs / timelineSpan) * 100);
      }

      var details = '';
      if (n.metadata) {
        var showKeys = Object.keys(n.metadata).filter(function(k) {
          return k !== 'error' && typeof n.metadata[k] !== 'object';
        });
        if (showKeys.length > 0) {
          details = showKeys.slice(0, 4).map(function(k) {
            return escapeHtml(k) + ': ' + escapeHtml(String(n.metadata[k]).substring(0, 50));
          }).join(' \u00b7 ');
        }
      }

      var indent = depth * 24;
      html += '<div class="timeline-item" style="margin-left:' + indent + 'px;">';
      html += '<div class="timeline-marker ' + markerClass + '"></div>';
      html += '<div class="timeline-content">';
      html += '<div class="timeline-header">';
      html += '<span class="event-type">' + typeIcon + ' <span class="badge badge-type badge-' + escapeHtml(n.type || 'unknown') + '" style="font-size:0.7rem;">' + escapeHtml(n.type || 'node') + '</span> ' + eventName + ' ' + statusIcon + '</span>';
      html += '<span class="event-time">' + eventTs;
      if (dur !== '--') html += ' \u00b7 <strong>' + escapeHtml(dur) + '</strong>';
      html += '</span></div>';
      // Duration bar
      if (barWidth > 0) {
        var barColor = n.status === 'failed' ? 'var(--accent-error)' : n.status === 'completed' ? 'var(--accent-success)' : n.status === 'running' ? 'var(--accent-primary)' : 'var(--accent-warning)';
        html += '<div style="position:relative;height:6px;background:var(--bg-tertiary);border-radius:3px;margin:4px 0;">';
        html += '<div style="position:absolute;left:' + barLeft.toFixed(1) + '%;width:' + barWidth.toFixed(1) + '%;height:100%;background:' + barColor + ';border-radius:3px;"></div>';
        html += '</div>';
      }
      if (details) {
        html += '<div class="event-details">' + details + '</div>';
      }
      if (n.metadata && n.metadata.error) {
        html += '<div class="event-details" style="color:var(--accent-error);">\u274c ' + escapeHtml(String(n.metadata.error).substring(0, 120)) + '</div>';
      }
      html += '</div></div>';
    }

    container.innerHTML = html;
  }

  // ---------------------------------------------------------------------------
  // Tab 2: Metrics
  // ---------------------------------------------------------------------------
  renderMetrics() {
    var container = document.getElementById('metricsContent');
    var trace = this.selectedTraceData || this.selectedTrace;
    if (!trace || !trace.nodes) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-text">Select a trace to view metrics.</div></div>';
      return;
    }

    var nodes = this.getNodesArray(trace);
    var totalNodes = nodes.length;
    var completedNodes = nodes.filter(function(n) { return n.status === 'completed'; }).length;
    var failedNodes = nodes.filter(function(n) { return n.status === 'failed'; }).length;
    var runningNodes = nodes.filter(function(n) { return n.status === 'running'; }).length;
    var hungNodes = nodes.filter(function(n) { return n.status === 'hung' || n.status === 'timeout'; }).length;
    var successRate = totalNodes > 0 ? Math.round(completedNodes / totalNodes * 1000) / 10 : 0;

    // Compute average and max duration
    var totalDur = 0, durCount = 0, maxDur = 0;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.startTime && n.endTime) {
        var ms = new Date(n.endTime).getTime() - new Date(n.startTime).getTime();
        if (!isNaN(ms) && ms >= 0) {
          totalDur += ms;
          durCount++;
          if (ms > maxDur) maxDur = ms;
        }
      }
    }
    var avgDur = durCount > 0 ? totalDur / durCount : 0;

    // Compute max depth
    var nodeMap = {};
    for (var j = 0; j < nodes.length; j++) {
      if (nodes[j].id) nodeMap[nodes[j].id] = nodes[j];
    }
    var maxDepth = 0;
    var depthOf = function(nid, visited) {
      if (!nid || visited.has(nid)) return 0;
      visited.add(nid);
      var nd = nodeMap[nid];
      if (!nd || !nd.parentId) return 0;
      return 1 + depthOf(nd.parentId, visited);
    };
    for (var k = 0; k < nodes.length; k++) {
      maxDepth = Math.max(maxDepth, depthOf(nodes[k].id, new Set()));
    }

    // Type breakdown
    var typeCounts = {};
    for (var m = 0; m < nodes.length; m++) {
      var t = nodes[m].type || 'unknown';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }

    var html = '<div class="metrics-grid">';
    html += this.metricCard('Total Nodes', totalNodes, 'primary');
    html += this.metricCard('Success Rate', successRate + '%', successRate >= 90 ? 'success' : successRate >= 70 ? 'warning' : 'error');
    html += this.metricCard('Avg Duration', this.formatDuration(avgDur), 'primary', durCount > 0 ? 'across ' + durCount + ' nodes' : 'no timing data');
    html += this.metricCard('Max Duration', this.formatDuration(maxDur), 'primary', 'tool execution time');
    html += this.metricCard('Max Depth', maxDepth, 'primary');
    html += this.metricCard('Failures', failedNodes, failedNodes > 0 ? 'error' : 'success');
    html += this.metricCard('Running/Active', runningNodes, runningNodes > 0 ? 'warning' : 'primary');
    html += this.metricCard('Completed', completedNodes, 'success');
    html += '</div>';

    // Token/cost metrics for session traces
    if (trace.tokenUsage && trace.tokenUsage.total > 0) {
      html += '<h4 style="margin:1.5rem 0 0.75rem;font-size:0.85rem;color:var(--text-secondary);">Token Usage</h4>';
      html += '<div class="metrics-grid">';
      html += this.metricCard('Total Tokens', trace.tokenUsage.total > 1000 ? Math.round(trace.tokenUsage.total / 1000) + 'k' : trace.tokenUsage.total, 'primary');
      html += this.metricCard('Input Tokens', trace.tokenUsage.input > 1000 ? Math.round(trace.tokenUsage.input / 1000) + 'k' : trace.tokenUsage.input, 'primary');
      html += this.metricCard('Output Tokens', trace.tokenUsage.output > 1000 ? Math.round(trace.tokenUsage.output / 1000) + 'k' : trace.tokenUsage.output, 'primary');
      html += this.metricCard('Estimated Cost', trace.tokenUsage.cost > 0 ? '$' + trace.tokenUsage.cost.toFixed(4) : '$0', trace.tokenUsage.cost > 0.10 ? 'warning' : 'success');
      if (totalNodes > 0) html += this.metricCard('Tokens/Node', Math.round(trace.tokenUsage.total / totalNodes), 'primary');
      var modelName = (trace.metadata && trace.metadata.model) || '';
      if (modelName) html += this.metricCard('Model', modelName.length > 20 ? modelName.slice(0, 18) + '..' : modelName, 'primary', (trace.metadata && trace.metadata.provider) || '');
      html += '</div>';
    }

    // Type breakdown
    html += '<h4 style="margin:1.5rem 0 0.75rem;font-size:0.85rem;color:var(--text-secondary);">Node Type Breakdown</h4>';
    html += '<div class="metrics-grid">';
    var typeEntries = Object.entries(typeCounts).sort(function(a, b) { return b[1] - a[1]; });
    for (var p = 0; p < typeEntries.length; p++) {
      html += this.metricCard(typeEntries[p][0], typeEntries[p][1], 'primary');
    }
    html += '</div>';

    container.innerHTML = html;
  }

  metricCard(label, value, colorClass, sub) {
    var html = '<div class="metric-card"><div class="metric-label">' + escapeHtml(label) + '</div><div class="metric-value ' + colorClass + '">' + escapeHtml(String(value)) + '</div>';
    if (sub) html += '<div class="metric-sub">' + escapeHtml(sub) + '</div>';
    html += '</div>';
    return html;
  }

  // ---------------------------------------------------------------------------
  // Tab 3: Dependency Graph (Cytoscape.js)
  // ---------------------------------------------------------------------------
  renderGraph() {
    var trace = this.selectedTraceData || this.selectedTrace;
    if (!trace || !trace.nodes) {
      document.getElementById('graphEmpty').style.display = '';
      if (this.cy) { this.cy.destroy(); this.cy = null; }
      return;
    }

    document.getElementById('graphEmpty').style.display = 'none';

    var nodes = this.getNodesArray(trace);
    if (nodes.length === 0) {
      document.getElementById('graphEmpty').style.display = '';
      return;
    }

    // Build cytoscape elements
    var elements = [];
    var nodeIds = new Set();

    // Collect valid IDs
    if (typeof trace.nodes === 'object' && !Array.isArray(trace.nodes)) {
      Object.keys(trace.nodes).forEach(function(key) { nodeIds.add(key); });
    }
    nodes.forEach(function(n) { if (n.id) nodeIds.add(n.id); });

    // Add nodes
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var id = node.id || ('n-' + i);
      elements.push({
        group: 'nodes',
        data: {
          id: id,
          label: node.name || node.type || id,
          status: node.status || 'unknown',
          nodeType: node.type || 'custom',
          fullData: node
        }
      });
    }

    // Build edges from parentId relationships
    for (var j = 0; j < nodes.length; j++) {
      var n = nodes[j];
      if (n.parentId && nodeIds.has(n.parentId) && n.id) {
        elements.push({
          group: 'edges',
          data: {
            source: n.parentId,
            target: n.id,
            id: 'e-' + n.parentId + '-' + n.id
          }
        });
      }
    }

    // Also add explicit trace edges if present
    if (trace.edges && Array.isArray(trace.edges)) {
      for (var k = 0; k < trace.edges.length; k++) {
        var edge = trace.edges[k];
        var src = edge.source || edge.from;
        var tgt = edge.target || edge.to;
        if (src && tgt && nodeIds.has(src) && nodeIds.has(tgt)) {
          var eid = 'e-' + src + '-' + tgt;
          if (!elements.some(function(el) { return el.data && el.data.id === eid; })) {
            elements.push({
              group: 'edges',
              data: { source: src, target: tgt, id: eid, edgeType: edge.type || '' }
            });
          }
        }
      }
    }

    // Destroy previous instance
    if (this.cy) { this.cy.destroy(); this.cy = null; }

    var cyContainer = document.getElementById('cy');

    this.cy = cytoscape({
      container: cyContainer,
      elements: elements,
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'width': 45,
            'height': 45,
            'font-size': '10px',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 6,
            'color': '#c9d1d9',
            'text-outline-color': '#0d1117',
            'text-outline-width': 2,
            'border-width': 2,
            'border-color': '#30363d',
            'background-color': '#3b82f6'
          }
        },
        { selector: 'node[status="completed"]', style: { 'background-color': '#10b981', 'border-color': '#2ea043' } },
        { selector: 'node[status="failed"]', style: { 'background-color': '#ef4444', 'border-color': '#f85149', 'shape': 'diamond' } },
        { selector: 'node[status="running"]', style: { 'background-color': '#3b82f6', 'border-color': '#79b8ff' } },
        { selector: 'node[status="hung"]', style: { 'background-color': '#f0883e', 'border-color': '#f5a623' } },
        { selector: 'node[status="timeout"]', style: { 'background-color': '#f0883e', 'border-color': '#f5a623' } },
        // Shape by type
        { selector: 'node[nodeType="agent"]', style: { 'shape': 'ellipse', 'width': 50, 'height': 50 } },
        { selector: 'node[nodeType="tool"]', style: { 'shape': 'round-rectangle', 'width': 50, 'height': 35 } },
        { selector: 'node[nodeType="subagent"]', style: { 'shape': 'ellipse', 'width': 38, 'height': 38 } },
        { selector: 'node[nodeType="wait"]', style: { 'shape': 'round-rectangle', 'width': 40, 'height': 30 } },
        { selector: 'node[nodeType="decision"]', style: { 'shape': 'diamond', 'width': 45, 'height': 45 } },
        { selector: 'node[nodeType="custom"]', style: { 'shape': 'diamond', 'width': 40, 'height': 40 } },
        // Selected node — gold border
        { selector: ':selected', style: { 'border-width': 4, 'border-color': '#f59e0b', 'overlay-opacity': 0.08 } },
        // Edges
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': '#6b7280',
            'target-arrow-color': '#6b7280',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 0.8
          }
        },
        // Dashed edges for specific types
        {
          selector: 'edge[edgeType]',
          style: {
            'line-style': 'dashed',
            'line-color': '#f0883e',
            'target-arrow-color': '#f0883e'
          }
        }
      ],
      layout: { name: 'breadthfirst', directed: true, padding: 40, spacingFactor: 1.4, animate: true, animationDuration: 300 },
      minZoom: 0.2,
      maxZoom: 4,
      wheelSensitivity: 0.3
    });

    var self = this;

    // Node tap -> detail panel
    this.cy.on('tap', 'node', function(e) {
      var data = e.target.data();
      self.showNodeDetail(data.fullData);
    });

    // Background tap -> close panel
    this.cy.on('tap', function(e) {
      if (e.target === self.cy) {
        document.getElementById('nodeDetailPanel').classList.remove('active');
      }
    });
  }

  runCytoscapeLayout() {
    if (!this.cy) return;
    this.cy.layout({
      name: 'breadthfirst',
      directed: true,
      padding: 40,
      spacingFactor: 1.4,
      animate: true,
      animationDuration: 400
    }).run();
  }

  showNodeDetail(node) {
    var panel = document.getElementById('nodeDetailPanel');
    var body = document.getElementById('nodeDetailBody');
    var title = document.getElementById('nodeDetailTitle');

    title.textContent = node.name || node.id || 'Node';

    var duration = this.computeDuration(node.startTime, node.endTime);

    var html = '';
    html += this.detailRow('ID', node.id);
    html += this.detailRow('Type', node.type);
    html += '<div class="detail-row"><span class="detail-label">Status</span><span class="detail-value status-' + escapeHtml(node.status || '') + '">' + escapeHtml(node.status || 'unknown') + '</span></div>';
    html += this.detailRow('Duration', duration);
    if (node.startTime) html += this.detailRow('Start', new Date(node.startTime).toLocaleString());
    if (node.endTime) html += this.detailRow('End', new Date(node.endTime).toLocaleString());
    if (node.parentId) html += this.detailRow('Parent', node.parentId);
    if (node.children && node.children.length) html += this.detailRow('Children', node.children.length);

    if (node.metadata && Object.keys(node.metadata).length > 0) {
      html += '<div style="margin-top:0.5rem;font-size:0.7rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.3px;">Metadata</div>';
      html += '<div class="detail-metadata">' + escapeHtml(JSON.stringify(node.metadata, null, 2)) + '</div>';
    }

    body.innerHTML = html;
    panel.classList.add('active');
  }

  detailRow(label, value) {
    if (value === undefined || value === null || value === '') return '';
    return '<div class="detail-row"><span class="detail-label">' + escapeHtml(label) + '</span><span class="detail-value">' + escapeHtml(String(value)) + '</span></div>';
  }

  exportGraphPNG() {
    if (!this.cy) return;
    var png = this.cy.png({ bg: '#0d1117', full: true, maxWidth: 4000, maxHeight: 4000 });
    var link = document.createElement('a');
    var traceName = this.selectedTrace ? this.selectedTrace.filename.replace(/\.json$/, '') : 'graph';
    link.download = 'agentflow-' + traceName + '.png';
    link.href = png;
    link.click();
  }

  // ---------------------------------------------------------------------------
  // Tab 4: Error Heatmap
  // ---------------------------------------------------------------------------
  renderHeatmap() {
    var container = document.getElementById('heatmapContent');
    var trace = this.selectedTraceData || this.selectedTrace;

    // Build heatmap from recent traces (not just selected trace)
    var tracesToUse = this.traces.slice(0, 100);
    if (tracesToUse.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-text">No traces available for heatmap.</div></div>';
      return;
    }

    var html = '<h3 class="heatmap-header">Error Distribution Across Recent Traces</h3>';
    html += '<div class="heatmap-grid">';

    for (var i = 0; i < Math.min(tracesToUse.length, 100); i++) {
      var tr = tracesToUse[i];
      var nodes = this.getNodesArray(tr);
      var failCount = 0;
      var warnCount = 0;
      for (var j = 0; j < nodes.length; j++) {
        if (nodes[j].status === 'failed') failCount++;
        if (nodes[j].status === 'hung' || nodes[j].status === 'timeout') warnCount++;
      }

      var color;
      if (failCount > 2) color = 'rgba(218, 54, 51, 0.9)';
      else if (failCount > 0) color = 'rgba(218, 54, 51, 0.5)';
      else if (warnCount > 0) color = 'rgba(240, 136, 62, 0.5)';
      else color = 'rgba(35, 134, 54, 0.3)';

      var cellLabel = failCount > 0 ? failCount : '';
      var agentName = escapeHtml(tr.agentId || tr.name || 'unknown');
      var tooltipText = escapeHtml((tr.name || tr.filename || '').substring(0, 30)) + ' | ' + agentName + ' | ' + failCount + ' errors, ' + warnCount + ' warnings';

      html += '<div class="heatmap-cell" style="background:' + color + ';" title="' + tooltipText + '">';
      html += cellLabel;
      html += '<div class="heatmap-tooltip">' + tooltipText + '</div>';
      html += '</div>';
    }

    html += '</div>';

    // Legend
    html += '<div style="display:flex;gap:1.5rem;font-size:0.75rem;color:var(--text-secondary);margin-top:0.5rem;">';
    html += '<span><span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:rgba(35,134,54,0.3);vertical-align:middle;margin-right:4px;"></span>No errors</span>';
    html += '<span><span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:rgba(240,136,62,0.5);vertical-align:middle;margin-right:4px;"></span>Warnings</span>';
    html += '<span><span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:rgba(218,54,51,0.5);vertical-align:middle;margin-right:4px;"></span>1-2 failures</span>';
    html += '<span><span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:rgba(218,54,51,0.9);vertical-align:middle;margin-right:4px;"></span>3+ failures</span>';
    html += '</div>';

    container.innerHTML = html;
  }

  // ---------------------------------------------------------------------------
  // Tab 5: State Machine
  // ---------------------------------------------------------------------------
  renderStateMachine() {
    var container = document.getElementById('stateContent');
    var trace = this.selectedTraceData || this.selectedTrace;
    if (!trace || !trace.nodes) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-text">Select a trace to view state machine.</div></div>';
      return;
    }

    var nodes = this.getNodesArray(trace);
    var pendingCount = 0, runningCount = 0, completedCount = 0, failedCount = 0;

    for (var i = 0; i < nodes.length; i++) {
      var s = nodes[i].status;
      if (s === 'completed') completedCount++;
      else if (s === 'failed') failedCount++;
      else if (s === 'running') runningCount++;
      else pendingCount++;
    }

    // Determine which states are "active" (have nodes)
    var pendingActive = pendingCount > 0 ? ' pending' : '';
    var runningActive = runningCount > 0 ? ' running' : '';
    var completedActive = completedCount > 0 ? ' completed' : '';
    var failedActive = failedCount > 0 ? ' failed' : '';

    var html = '<div class="state-machine">';

    html += '<div class="state">';
    html += '<div class="state-circle' + pendingActive + '"><span class="state-count">' + pendingCount + '</span>PENDING</div>';
    html += '<span class="state-label">Queued</span>';
    html += '</div>';

    html += '<div class="state-arrow">&rarr;</div>';

    html += '<div class="state">';
    html += '<div class="state-circle' + runningActive + '"><span class="state-count">' + runningCount + '</span>RUNNING</div>';
    html += '<span class="state-label">Active</span>';
    html += '</div>';

    html += '<div class="state-arrow">&rarr;</div>';

    html += '<div class="state">';
    html += '<div class="state-circle' + completedActive + '"><span class="state-count">' + completedCount + '</span>COMPLETED</div>';
    html += '<span class="state-label">Success</span>';
    html += '</div>';

    html += '<div class="state-arrow">&harr;</div>';

    html += '<div class="state">';
    html += '<div class="state-circle' + failedActive + '"><span class="state-count">' + failedCount + '</span>FAILED</div>';
    html += '<span class="state-label">Error</span>';
    html += '</div>';

    html += '</div>';

    // State details
    html += '<div style="padding:1rem;">';
    html += '<div class="metrics-grid">';
    html += this.metricCard('Pending', pendingCount, 'primary');
    html += this.metricCard('Running', runningCount, runningCount > 0 ? 'warning' : 'primary');
    html += this.metricCard('Completed', completedCount, 'success');
    html += this.metricCard('Failed', failedCount, failedCount > 0 ? 'error' : 'success');
    html += '</div></div>';

    container.innerHTML = html;
  }

  // ---------------------------------------------------------------------------
  // Tab 6: Summary
  // ---------------------------------------------------------------------------
  renderSummary() {
    var container = document.getElementById('summaryContent');
    var trace = this.selectedTraceData || this.selectedTrace;
    if (!trace || !trace.nodes) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-text">Select a trace to view summary.</div></div>';
      return;
    }

    // Show spinner briefly then generate
    container.innerHTML = '<div class="empty-state"><div class="spinner"></div><div class="empty-state-text">Generating summary...</div></div>';

    var self = this;
    // Use setTimeout to avoid blocking render
    setTimeout(function() { self.generateSummary(trace, container); }, 50);
  }

  generateSummary(trace, container) {
    var nodes = this.getNodesArray(trace);
    var totalNodes = nodes.length;
    var completedCount = 0, failedCount = 0, runningCount = 0;
    var agentNames = new Set();
    var totalDur = 0, durCount = 0;

    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.status === 'completed') completedCount++;
      else if (n.status === 'failed') failedCount++;
      else if (n.status === 'running') runningCount++;

      if (n.type === 'agent' || n.type === 'subagent') {
        agentNames.add(n.name || n.id || 'unnamed');
      }

      if (n.startTime && n.endTime) {
        var ms = new Date(n.endTime).getTime() - new Date(n.startTime).getTime();
        if (!isNaN(ms) && ms >= 0) { totalDur += ms; durCount++; }
      }
    }

    var successRate = totalNodes > 0 ? Math.round(completedCount / totalNodes * 100) : 0;
    var agentList = Array.from(agentNames);

    // Build summary title
    var titleText = 'Trace: ' + escapeHtml(trace.name || trace.agentId || trace.filename || 'Unknown');

    // Build summary text
    var summaryText = 'This trace contains ' + totalNodes + ' node' + (totalNodes !== 1 ? 's' : '') + '. ';
    summaryText += completedCount + ' completed successfully, ' + failedCount + ' failed';
    if (runningCount > 0) summaryText += ', and ' + runningCount + ' are still running';
    summaryText += '. ';
    if (durCount > 0) {
      summaryText += 'Average node duration was ' + this.formatDuration(totalDur / durCount) + '. ';
      summaryText += 'Total execution time: ' + this.formatDuration(totalDur) + '.';
    }

    // Build details list
    var details = [];
    details.push('Total nodes: ' + totalNodes);
    details.push('Completed: ' + completedCount);
    details.push('Failed: ' + failedCount);
    if (runningCount > 0) details.push('Running: ' + runningCount);
    if (agentList.length > 0) details.push('Agents involved: ' + agentList.join(', '));
    if (trace.trigger) details.push('Trigger: ' + trace.trigger);

    // Recommendations
    var recommendations = '';
    if (failedCount === 0 && runningCount === 0) {
      recommendations = '<strong>Status:</strong> All tasks completed successfully. No issues detected.';
    } else if (failedCount > 0) {
      recommendations = '<strong>Action needed:</strong> ' + failedCount + ' node' + (failedCount !== 1 ? 's' : '') + ' failed. Investigate the failed nodes in the Timeline or Dependency Graph tabs for error details.';
    }
    if (runningCount > 0) {
      recommendations += (recommendations ? ' ' : '') + '<strong>Note:</strong> ' + runningCount + ' node' + (runningCount !== 1 ? 's are' : ' is') + ' still running. The trace may not be complete yet.';
    }

    var html = '<div class="summary-card">';
    html += '<h3 class="summary-title">' + titleText + '</h3>';
    html += '<p class="summary-text">' + escapeHtml(summaryText) + '</p>';
    html += '<ul class="summary-details">';
    for (var j = 0; j < details.length; j++) {
      html += '<li>' + escapeHtml(details[j]) + '</li>';
    }
    html += '</ul>';

    if (recommendations) {
      html += '<div class="summary-recommendations">' + recommendations + '</div>';
    }

    // Confidence bar based on success rate
    html += '<div class="confidence-bar">';
    html += '<span>Confidence:</span>';
    html += '<div class="bar"><div class="bar-fill" style="width:' + successRate + '%;"></div></div>';
    html += '<span>' + successRate + '%</span>';
    html += '</div>';

    html += '</div>';

    container.innerHTML = html;
  }

  // ---------------------------------------------------------------------------
  // Session Timeline (rich event-based timeline for JSONL sessions)
  // ---------------------------------------------------------------------------
  async renderSessionTimeline(trace, container) {
    var filename = trace.filename;
    var html = '';

    // Try to fetch session events from the API
    var events = trace.sessionEvents || [];
    var tokenUsage = trace.tokenUsage || null;

    if (events.length === 0 && filename) {
      try {
        var res = await fetch('/api/traces/' + encodeURIComponent(filename) + '/events');
        if (res.ok) {
          var data = await res.json();
          events = data.events || [];
          tokenUsage = data.tokenUsage || null;
        }
      } catch (e) {
        // fall through to node-based rendering
      }
    }

    if (events.length === 0) {
      // Fallback: render nodes like a normal trace
      container.innerHTML = '<div class="empty-state"><div class="empty-state-text">No session events found. Try the node-based timeline.</div></div>';
      return;
    }

    // Token usage summary at top
    if (tokenUsage && tokenUsage.total > 0) {
      html += '<div style="display:flex;gap:16px;margin-bottom:12px;flex-wrap:wrap;padding:8px 12px;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:8px;">';
      html += '<span style="font-size:0.8rem;color:#bc8cff;">Tokens: ' + (tokenUsage.total > 1000 ? Math.round(tokenUsage.total / 1000) + 'k' : tokenUsage.total) + '</span>';
      html += '<span style="font-size:0.8rem;color:var(--text-secondary);">In: ' + (tokenUsage.input > 1000 ? Math.round(tokenUsage.input / 1000) + 'k' : tokenUsage.input) + '</span>';
      html += '<span style="font-size:0.8rem;color:var(--text-secondary);">Out: ' + (tokenUsage.output > 1000 ? Math.round(tokenUsage.output / 1000) + 'k' : tokenUsage.output) + '</span>';
      if (tokenUsage.cost > 0) html += '<span style="font-size:0.8rem;color:#f0883e;">Cost: $' + tokenUsage.cost.toFixed(4) + '</span>';
      html += '</div>';
    }

    // Summary badges
    var userCount = 0, assistantCount = 0, toolCount = 0, thinkCount = 0, spawnCount = 0;
    for (var i = 0; i < events.length; i++) {
      switch (events[i].type) {
        case 'user': userCount++; break;
        case 'assistant': assistantCount++; break;
        case 'tool_call': toolCount++; break;
        case 'thinking': thinkCount++; break;
        case 'spawn': spawnCount++; break;
      }
    }
    html += '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">';
    html += '<span style="font-size:0.8rem;color:var(--text-secondary);">' + events.length + ' events</span>';
    if (userCount) html += '<span class="badge" style="background:rgba(88,166,255,0.15);color:#58a6ff;">' + userCount + ' user</span>';
    if (assistantCount) html += '<span class="badge" style="background:rgba(35,134,54,0.15);color:#3fb950;">' + assistantCount + ' assistant</span>';
    if (toolCount) html += '<span class="badge" style="background:rgba(240,136,62,0.15);color:#f0883e;">' + toolCount + ' tools</span>';
    if (thinkCount) html += '<span class="badge" style="background:rgba(188,140,255,0.15);color:#bc8cff;">' + thinkCount + ' thinking</span>';
    if (spawnCount) html += '<span class="badge" style="background:rgba(0,200,200,0.15);color:#00c8c8;">' + spawnCount + ' spawns</span>';
    html += '</div>';

    // Render events
    var typeMarkers = {
      user: { icon: '\ud83e\uddd1', color: '#58a6ff', label: 'User' },
      assistant: { icon: '\ud83e\udd16', color: '#3fb950', label: 'Assistant' },
      thinking: { icon: '\ud83d\udcad', color: '#bc8cff', label: 'Thinking' },
      tool_call: { icon: '\ud83d\udee0\ufe0f', color: '#f0883e', label: 'Tool Call' },
      tool_result: { icon: '\u2705', color: '#3fb950', label: 'Tool Result' },
      spawn: { icon: '\ud83d\udc64', color: '#00c8c8', label: 'Subagent' },
      model_change: { icon: '\u2699\ufe0f', color: '#8b949e', label: 'Model' },
      system: { icon: '\u2139\ufe0f', color: '#6e7681', label: 'System' },
    };

    for (var j = 0; j < events.length; j++) {
      var evt = events[j];
      var marker = typeMarkers[evt.type] || typeMarkers.system;
      var evtTime = evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : '';
      var contentPreview = escapeHtml((evt.content || '').substring(0, 300));
      if ((evt.content || '').length > 300) contentPreview += '...';

      // Tool result with error gets red marker
      if (evt.type === 'tool_result' && evt.toolError) {
        marker = { icon: '\u274c', color: '#f85149', label: 'Tool Error' };
      }

      html += '<div class="timeline-item">';
      html += '<div class="timeline-marker" style="background:' + marker.color + ';"></div>';
      html += '<div class="timeline-content">';
      html += '<div class="timeline-header">';
      html += '<span class="event-type">' + marker.icon + ' <strong>' + escapeHtml(evt.name || marker.label) + '</strong>';
      if (evt.type === 'tool_call' && evt.toolName) html += ' <code style="font-size:0.75rem;color:#f0883e;">' + escapeHtml(evt.toolName) + '</code>';
      html += '</span>';
      html += '<span class="event-time">' + evtTime;
      if (evt.duration) html += ' &middot; ' + this.formatDuration(evt.duration);
      if (evt.tokens && evt.tokens.total) html += ' &middot; <span style="color:#bc8cff;">' + (evt.tokens.total > 1000 ? Math.round(evt.tokens.total / 1000) + 'k' : evt.tokens.total) + ' tok</span>';
      html += '</span></div>';

      if (contentPreview) {
        html += '<div class="event-details" style="margin-top:4px;">' + contentPreview + '</div>';
      }

      if (evt.type === 'tool_call' && evt.toolArgs) {
        var argsStr = typeof evt.toolArgs === 'string' ? evt.toolArgs : JSON.stringify(evt.toolArgs);
        html += '<div class="event-details" style="margin-top:2px;font-family:monospace;font-size:0.7rem;color:var(--text-secondary);max-height:60px;overflow:hidden;">' + escapeHtml(argsStr.substring(0, 200)) + '</div>';
      }

      if (evt.type === 'tool_result' && evt.toolResult) {
        var resultColor = evt.toolError ? 'var(--accent-error)' : 'var(--text-secondary)';
        html += '<div class="event-details" style="margin-top:2px;font-family:monospace;font-size:0.7rem;color:' + resultColor + ';max-height:80px;overflow:hidden;">' + escapeHtml(evt.toolResult.substring(0, 300)) + '</div>';
      }

      html += '</div></div>';
    }

    container.innerHTML = html;
  }

  // ---------------------------------------------------------------------------
  // Tab 7: Transcript (chat bubble UI for session traces)
  // ---------------------------------------------------------------------------
  async renderTranscript() {
    var container = document.getElementById('transcriptContent');
    var trace = this.selectedTraceData || this.selectedTrace;

    if (!trace) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-text">Select a trace to view transcript.</div></div>';
      return;
    }

    if (trace.sourceType !== 'session') {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-text">Transcript view is only available for session traces (JSONL files).</div></div>';
      return;
    }

    var events = trace.sessionEvents || [];
    if (events.length === 0 && trace.filename) {
      try {
        var res = await fetch('/api/traces/' + encodeURIComponent(trace.filename) + '/events');
        if (res.ok) {
          var data = await res.json();
          events = data.events || [];
        }
      } catch (e) { /* ignore */ }
    }

    if (events.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-text">No session events found.</div></div>';
      return;
    }

    var html = '<div style="display:flex;flex-direction:column;gap:4px;padding:0.5rem;">';

    var thinkingIdx = 0;
    for (var i = 0; i < events.length; i++) {
      var evt = events[i];
      var evtTime = evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : '';

      if (evt.type === 'user') {
        html += '<div class="chat-bubble chat-user">';
        html += escapeHtml(evt.content || '');
        html += '<div class="chat-meta">' + evtTime + '</div>';
        html += '</div>';
      }

      if (evt.type === 'assistant') {
        html += '<div class="chat-bubble chat-assistant">';
        html += escapeHtml(evt.content || '');
        html += '<div class="chat-meta">' + evtTime;
        if (evt.tokens && evt.tokens.total) {
          html += ' &middot; <span class="chat-tokens">' + (evt.tokens.total > 1000 ? Math.round(evt.tokens.total / 1000) + 'k' : evt.tokens.total) + ' tokens';
          if (evt.tokens.cost) html += ' ($' + evt.tokens.cost.toFixed(4) + ')';
          html += '</span>';
        }
        if (evt.model) html += ' &middot; ' + escapeHtml(evt.model);
        html += '</div></div>';
      }

      if (evt.type === 'thinking') {
        thinkingIdx++;
        var tId = 'thinking-toggle-' + thinkingIdx;
        html += '<div class="chat-bubble chat-thinking">';
        html += '<span class="chat-thinking-toggle" onclick="var b=document.getElementById(\'' + tId + '\');b.classList.toggle(\'open\');">\ud83d\udcad Thinking (click to expand)</span>';
        html += '<div class="chat-thinking-body" id="' + tId + '">' + escapeHtml(evt.content || '') + '</div>';
        html += '<div class="chat-meta">' + evtTime + '</div>';
        html += '</div>';
      }

      if (evt.type === 'tool_call') {
        html += '<div class="chat-bubble chat-tool">';
        html += '<strong>\ud83d\udee0\ufe0f ' + escapeHtml(evt.toolName || evt.name || 'Tool') + '</strong>';
        if (evt.toolArgs) {
          var argsStr = typeof evt.toolArgs === 'string' ? evt.toolArgs : JSON.stringify(evt.toolArgs, null, 2);
          html += '<div style="margin-top:4px;max-height:100px;overflow:hidden;font-size:0.75rem;color:var(--text-secondary);">' + escapeHtml(argsStr.substring(0, 300)) + '</div>';
        }
        html += '<div class="chat-meta">' + evtTime;
        if (evt.duration) html += ' &middot; ' + this.formatDuration(evt.duration);
        html += '</div></div>';
      }

      if (evt.type === 'tool_result') {
        var isError = !!evt.toolError;
        html += '<div class="chat-bubble chat-tool" style="' + (isError ? 'border-color:var(--accent-error);' : 'border-color:rgba(35,134,54,0.3);') + '">';
        html += '<strong>' + (isError ? '\u274c' : '\u2705') + ' Result</strong>';
        var resultText = evt.toolError || evt.toolResult || '';
        html += '<div style="margin-top:4px;max-height:120px;overflow:hidden;font-size:0.75rem;color:' + (isError ? 'var(--accent-error)' : 'var(--text-secondary)') + ';">' + escapeHtml(resultText.substring(0, 400)) + '</div>';
        html += '<div class="chat-meta">' + evtTime + '</div>';
        html += '</div>';
      }

      if (evt.type === 'spawn') {
        html += '<div class="chat-bubble" style="margin:0 auto;max-width:70%;background:rgba(0,200,200,0.08);border:1px solid rgba(0,200,200,0.25);text-align:center;">';
        html += '\ud83d\udc64 Subagent spawned';
        if (evt.content) html += ': <code>' + escapeHtml(evt.content.substring(0, 40)) + '</code>';
        html += '<div class="chat-meta">' + evtTime + '</div>';
        html += '</div>';
      }
    }

    html += '</div>';
    container.innerHTML = html;
  }

  // ---------------------------------------------------------------------------
  // Alert panel
  // ---------------------------------------------------------------------------
  showAlert(messages) {
    var panel = document.getElementById('alertPanel');
    var list = document.getElementById('alertList');
    if (!messages || messages.length === 0) {
      panel.classList.remove('show');
      return;
    }
    list.innerHTML = messages.map(function(m) { return '<li>' + escapeHtml(m) + '</li>'; }).join('');
    panel.classList.add('show');
  }

  // ---------------------------------------------------------------------------
  // Public / debug
  // ---------------------------------------------------------------------------
  getStats() { return this.stats; }
  getTraces() { return this.traces; }
  reconnect() {
    if (this.ws) this.ws.close();
    this.reconnectAttempts = 0;
    this.connectWebSocket();
  }

  // Categorize traces by activity type
  getTraceActivity(trace) {
    if (!trace) return 'unknown';

    var agentId = (trace.agentId || '').toLowerCase();
    var name = (trace.name || '').toLowerCase();
    var filename = (trace.filename || '').toLowerCase();

    // Check for specific agent types
    if (agentId.includes('main') || name.includes('main')) return 'main';
    if (agentId.includes('agent') || name.includes('agent')) return 'agents';

    // Check filename patterns
    if (filename.includes('browser') || name.includes('browser')) return 'browser';
    if (filename.includes('context') || name.includes('context')) return 'context';

    // Check for activity types in trace content
    var nodes = trace.nodes || {};
    var nodeTypes = [];

    if (nodes instanceof Map) {
      nodes.forEach(function(node) {
        if (node.type) nodeTypes.push(node.type);
      });
    } else if (typeof nodes === 'object') {
      for (var nodeId in nodes) {
        var node = nodes[nodeId];
        if (node && node.type) nodeTypes.push(node.type);
      }
    }

    // Categorize based on node types and content
    if (nodeTypes.includes('tool') || nodeTypes.includes('exec')) return 'exec';
    if (nodeTypes.includes('read') || name.includes('read')) return 'read';
    if (nodeTypes.includes('write') || name.includes('write')) return 'write';
    if (nodeTypes.includes('think') || name.includes('think')) return 'think';
    if (nodeTypes.includes('user') || name.includes('user')) return 'user';
    if (nodeTypes.includes('tool')) return 'tool';

    return 'other';
  }

  // Tag processes by activity type
  getProcessActivityTag(cmd, cmdline, pid) {
    // Main processes (primary orchestrators)
    if (cmdline.includes('main') || cmdline.includes('orchestrator') ||
        cmdline.includes('coordinator') || cmdline.includes('master')) {
      return 'main';
    }

    // Agent processes
    if (cmdline.includes('agent') && !cmdline.includes('browser')) {
      return 'agents';
    }

    // Browser/UI processes
    if (cmdline.includes('browser') || cmdline.includes('chrome') ||
        cmdline.includes('firefox') || cmdline.includes('dashboard')) {
      return 'browser';
    }

    // Context/memory processes
    if (cmdline.includes('context') || cmdline.includes('memory') ||
        cmdline.includes('cache') || cmdline.includes('embedding')) {
      return 'context';
    }

    // Execution processes
    if (cmdline.includes('exec') || cmdline.includes('runner') ||
        cmdline.includes('executor') || cmdline.includes('worker')) {
      return 'exec';
    }

    // Read operations
    if (cmdline.includes('read') || cmdline.includes('scanner') ||
        cmdline.includes('parser') || cmdline.includes('loader')) {
      return 'read';
    }

    // Tool processes
    if (cmdline.includes('tool') || cmdline.includes('utility') ||
        cmdline.includes('helper') || cmdline.includes('script')) {
      return 'tool';
    }

    // Thinking/AI processes
    if (cmdline.includes('think') || cmdline.includes('reason') ||
        cmdline.includes('llm') || cmdline.includes('model')) {
      return 'think';
    }

    // User interface processes
    if (cmdline.includes('ui') || cmdline.includes('frontend') ||
        cmdline.includes('interface') || cmdline.includes('client')) {
      return 'user';
    }

    // Write/output processes
    if (cmdline.includes('write') || cmdline.includes('output') ||
        cmdline.includes('export') || cmdline.includes('save')) {
      return 'write';
    }

    return 'other';
  }

  // ---------------------------------------------------------------------------
  // Tab 8: Process Map (Process Mining Graph)
  // ---------------------------------------------------------------------------
  renderProcessMap() {
    var trace = this.selectedTraceData || this.selectedTrace;
    if (!trace || !trace.agentId) {
      document.getElementById('processMapEmpty').style.display = '';
      return;
    }

    var agentId = trace.agentId;
    var self = this;

    // Avoid re-fetching for same agent
    if (this._processMapAgent === agentId && this._cyProcessMap) return;
    this._processMapAgent = agentId;

    document.getElementById('processMapEmpty').innerHTML =
      '<div class="empty-state-icon" style="animation:spin 1s linear infinite">&#9881;</div>' +
      '<div class="empty-state-text">Building process map for ' + escapeHtml(agentId) + '...</div>';
    document.getElementById('processMapEmpty').style.display = '';

    fetch('/api/agents/' + encodeURIComponent(agentId) + '/process-graph')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.error || !data.nodes || data.nodes.length === 0) {
          document.getElementById('processMapEmpty').innerHTML =
            '<div class="empty-state-icon">&#9881;</div>' +
            '<div class="empty-state-text">No process data for ' + escapeHtml(agentId) + '</div>';
          return;
        }
        document.getElementById('processMapEmpty').style.display = 'none';
        self._buildProcessMapGraph(data);
      })
      .catch(function() {
        document.getElementById('processMapEmpty').innerHTML =
          '<div class="empty-state-icon">&#9881;</div>' +
          '<div class="empty-state-text">Failed to load process map.</div>';
      });
  }

  _buildProcessMapGraph(data) {
    if (this._cyProcessMap) { this._cyProcessMap.destroy(); this._cyProcessMap = null; }

    var elements = [];
    var maxNode = data.maxNodeCount || 1;
    var maxEdge = data.maxEdgeCount || 1;

    // Add nodes
    for (var i = 0; i < data.nodes.length; i++) {
      var node = data.nodes[i];
      // Skip very rare activities (< 2% frequency) to reduce clutter, but keep virtual nodes
      if (!node.isVirtual && node.frequency < 0.02 && data.nodes.length > 15) continue;

      var size = node.isVirtual ? 30 : Math.max(25, Math.min(70, 25 + 45 * (node.count / maxNode)));
      var label = node.label;
      if (!node.isVirtual && node.count > 1) label += ' (' + node.count + ')';

      elements.push({
        group: 'nodes',
        data: {
          id: node.id,
          label: label,
          count: node.count,
          frequency: node.frequency,
          avgDuration: node.avgDuration,
          failRate: node.failRate,
          isVirtual: node.isVirtual,
          size: size,
          fullData: node
        }
      });
    }

    // Collect valid node IDs
    var validIds = new Set(elements.map(function(e) { return e.data.id; }));

    // Add edges (only between valid nodes)
    for (var j = 0; j < data.edges.length; j++) {
      var edge = data.edges[j];
      if (!validIds.has(edge.source) || !validIds.has(edge.target)) continue;
      // Skip very rare transitions
      if (edge.frequency < 0.02 && data.edges.length > 30) continue;

      var width = Math.max(1, Math.min(8, 1 + 7 * (edge.count / maxEdge)));
      var opacity = Math.max(0.3, Math.min(1.0, 0.3 + 0.7 * (edge.count / maxEdge)));

      elements.push({
        group: 'edges',
        data: {
          id: 'pe-' + edge.source + '-' + edge.target,
          source: edge.source,
          target: edge.target,
          count: edge.count,
          frequency: edge.frequency,
          width: width,
          opacity: opacity,
          label: edge.count > 1 ? String(edge.count) : ''
        }
      });
    }

    var container = document.getElementById('cyProcessMap');
    var self = this;

    this._cyProcessMap = cytoscape({
      container: container,
      elements: elements,
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'width': 'data(size)',
            'height': 'data(size)',
            'font-size': '9px',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 6,
            'color': '#c9d1d9',
            'text-outline-color': '#0d1117',
            'text-outline-width': 2,
            'text-wrap': 'ellipsis',
            'text-max-width': '100px',
            'border-width': 2,
            'border-color': '#30363d',
            'background-color': '#3b82f6',
            'shape': 'round-rectangle'
          }
        },
        // Virtual START/END nodes
        { selector: 'node[?isVirtual]', style: {
          'background-color': '#6b7280', 'shape': 'ellipse', 'border-color': '#4b5563',
          'font-size': '8px', 'font-weight': 'bold', 'text-valign': 'center', 'text-margin-y': 0
        }},
        // Color by fail rate: green → yellow → red
        { selector: 'node[failRate <= 0]', style: { 'background-color': '#10b981', 'border-color': '#2ea043' }},
        { selector: 'node[failRate > 0][failRate <= 0.1]', style: { 'background-color': '#22c55e', 'border-color': '#3fb950' }},
        { selector: 'node[failRate > 0.1][failRate <= 0.3]', style: { 'background-color': '#eab308', 'border-color': '#d29922' }},
        { selector: 'node[failRate > 0.3]', style: { 'background-color': '#ef4444', 'border-color': '#f85149' }},
        // Selected
        { selector: ':selected', style: { 'border-width': 4, 'border-color': '#f59e0b', 'overlay-opacity': 0.08 }},
        // Edges
        {
          selector: 'edge',
          style: {
            'width': 'data(width)',
            'opacity': 'data(opacity)',
            'line-color': '#6b7280',
            'target-arrow-color': '#6b7280',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 0.7,
            'label': 'data(label)',
            'font-size': '8px',
            'color': '#8b949e',
            'text-outline-color': '#0d1117',
            'text-outline-width': 1.5,
            'text-rotation': 'autorotate'
          }
        }
      ],
      layout: {
        name: 'breadthfirst',
        directed: true,
        padding: 50,
        spacingFactor: 1.6,
        animate: true,
        animationDuration: 400,
        roots: elements.filter(function(e) { return e.data && e.data.id === '[START]'; }).length > 0
          ? ['[START]'] : undefined
      },
      minZoom: 0.15,
      maxZoom: 4,
      wheelSensitivity: 0.3
    });

    // Click node → show detail
    this._cyProcessMap.on('tap', 'node', function(e) {
      var d = e.target.data().fullData;
      if (!d || d.isVirtual) return;
      var panel = document.getElementById('processMapDetailPanel');
      var title = document.getElementById('processMapDetailTitle');
      var body = document.getElementById('processMapDetailBody');

      title.textContent = d.label;
      var html = '';
      html += self.detailRow('Occurrences', d.count);
      html += self.detailRow('Frequency', (d.frequency * 100).toFixed(1) + '% of traces');
      if (d.avgDuration > 0) html += self.detailRow('Avg Duration', self.computeDuration(0, d.avgDuration));
      html += self.detailRow('Failure Rate', (d.failRate * 100).toFixed(1) + '%');
      body.innerHTML = html;
      panel.classList.add('active');
    });

    this._cyProcessMap.on('tap', function(e) {
      if (e.target === self._cyProcessMap) {
        document.getElementById('processMapDetailPanel').classList.remove('active');
      }
    });

    // Close button
    var closeBtn = document.getElementById('processMapDetailClose');
    if (closeBtn) {
      closeBtn.onclick = function() {
        document.getElementById('processMapDetailPanel').classList.remove('active');
      };
    }
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
  window.dashboard = new AgentFlowDashboard();
});

window.AgentFlowDashboard = AgentFlowDashboard;
