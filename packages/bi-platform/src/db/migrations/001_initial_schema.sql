-- Migration 001: Initial business intelligence schema
-- Creates core tables for the BI platform

BEGIN;

-- Track applied migrations
CREATE TABLE IF NOT EXISTS bi_migrations (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  applied_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Agent performance metrics (aggregated from AgentFlow)
-- ============================================================================
CREATE TABLE agent_metrics (
  id                  BIGSERIAL PRIMARY KEY,
  agent_id            TEXT NOT NULL,
  agent_name          TEXT NOT NULL,
  period_start        TIMESTAMPTZ NOT NULL,
  period_end          TIMESTAMPTZ NOT NULL,
  total_executions    INTEGER NOT NULL DEFAULT 0,
  successful          INTEGER NOT NULL DEFAULT 0,
  failed              INTEGER NOT NULL DEFAULT 0,
  avg_duration_ms     DOUBLE PRECISION,
  p95_duration_ms     DOUBLE PRECISION,
  error_rate          DOUBLE PRECISION,
  satisfaction_score  DOUBLE PRECISION,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_metrics_agent_id ON agent_metrics (agent_id);
CREATE INDEX idx_agent_metrics_period ON agent_metrics (period_start, period_end);

-- ============================================================================
-- ROI / financial analytics
-- ============================================================================
CREATE TABLE financial_metrics (
  id                  BIGSERIAL PRIMARY KEY,
  agent_id            TEXT,
  category            TEXT NOT NULL,  -- 'agent_cost', 'revenue_impact', 'savings'
  period_start        TIMESTAMPTZ NOT NULL,
  period_end          TIMESTAMPTZ NOT NULL,
  amount              DOUBLE PRECISION NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'USD',
  metadata            JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_financial_metrics_category ON financial_metrics (category);
CREATE INDEX idx_financial_metrics_period ON financial_metrics (period_start, period_end);

-- ============================================================================
-- Compliance tracking
-- ============================================================================
CREATE TABLE compliance_records (
  id                  BIGSERIAL PRIMARY KEY,
  regulation          TEXT NOT NULL,   -- 'GDPR', 'SOX', 'HIPAA', etc.
  agent_id            TEXT,
  status              TEXT NOT NULL DEFAULT 'compliant',  -- compliant, violation, remediation
  severity            TEXT,            -- critical, high, medium, low
  description         TEXT,
  evidence            JSONB,
  detected_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_compliance_regulation ON compliance_records (regulation);
CREATE INDEX idx_compliance_status ON compliance_records (status);

-- ============================================================================
-- Business decisions tracked
-- ============================================================================
CREATE TABLE business_decisions (
  id                  BIGSERIAL PRIMARY KEY,
  decision_type       TEXT NOT NULL,   -- 'strategic', 'operational', 'tactical'
  title               TEXT NOT NULL,
  description         TEXT,
  recommendation      JSONB,
  impact_assessment   JSONB,
  status              TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected, implemented
  confidence_score    DOUBLE PRECISION,
  stakeholders        TEXT[],
  created_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at          TIMESTAMPTZ,
  implemented_at      TIMESTAMPTZ
);

CREATE INDEX idx_decisions_type ON business_decisions (decision_type);
CREATE INDEX idx_decisions_status ON business_decisions (status);

-- ============================================================================
-- Anomaly detection results
-- ============================================================================
CREATE TABLE anomalies (
  id                  BIGSERIAL PRIMARY KEY,
  source_system       TEXT NOT NULL,   -- 'soma', 'agentflow', 'opsintel'
  metric_name         TEXT NOT NULL,
  severity            TEXT NOT NULL,   -- 'critical', 'high', 'medium', 'low'
  description         TEXT NOT NULL,
  baseline_value      DOUBLE PRECISION,
  observed_value      DOUBLE PRECISION,
  deviation_pct       DOUBLE PRECISION,
  business_impact     JSONB,
  acknowledged        BOOLEAN NOT NULL DEFAULT FALSE,
  detected_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at         TIMESTAMPTZ
);

CREATE INDEX idx_anomalies_severity ON anomalies (severity);
CREATE INDEX idx_anomalies_source ON anomalies (source_system);

-- ============================================================================
-- Data freshness tracking
-- ============================================================================
CREATE TABLE data_freshness (
  id                  SERIAL PRIMARY KEY,
  source_system       TEXT NOT NULL UNIQUE,
  last_sync_at        TIMESTAMPTZ,
  last_success_at     TIMESTAMPTZ,
  record_count        BIGINT DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'unknown', -- healthy, degraded, failing, unknown
  error_message       TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- User preferences and dashboard configs
-- ============================================================================
CREATE TABLE user_preferences (
  user_id             TEXT PRIMARY KEY,
  role                TEXT NOT NULL,
  dashboard_layout    JSONB,
  metric_preferences  JSONB,
  notification_prefs  JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- API usage tracking
-- ============================================================================
CREATE TABLE api_usage (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             TEXT,
  endpoint            TEXT NOT NULL,
  method              TEXT NOT NULL,
  status_code         INTEGER NOT NULL,
  response_time_ms    INTEGER,
  request_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_usage_endpoint ON api_usage (endpoint);
CREATE INDEX idx_api_usage_request_at ON api_usage (request_at);

COMMIT;
