CREATE TABLE integrations (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(128) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  kind VARCHAR(32) NOT NULL,
  provider VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  last_tested_at TIMESTAMP NULL,
  last_error TEXT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX idx_integrations_tenant_user_provider
ON integrations (tenant_id, user_id, provider);

CREATE INDEX idx_integrations_tenant_status
ON integrations (tenant_id, status);

CREATE TABLE marketplace_accounts (
  id VARCHAR(64) PRIMARY KEY,
  integration_id VARCHAR(64) NOT NULL,
  tenant_id VARCHAR(128) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  provider VARCHAR(64) NOT NULL,
  external_account_id VARCHAR(160) NULL,
  shop_name VARCHAR(255) NULL,
  status VARCHAR(32) NOT NULL,
  encrypted_access_token TEXT NULL,
  encrypted_refresh_token TEXT NULL,
  token_expires_at TIMESTAMP NULL,
  scopes JSON NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_marketplace_accounts_tenant_user_provider
ON marketplace_accounts (tenant_id, user_id, provider);

CREATE TABLE marketplace_orders (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(128) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  provider VARCHAR(64) NOT NULL,
  integration_id VARCHAR(64) NOT NULL,
  external_order_id VARCHAR(180) NOT NULL,
  idempotency_key VARCHAR(255) NOT NULL,
  status VARCHAR(64) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  currency VARCHAR(8) NOT NULL,
  raw_payload JSON NOT NULL,
  imported_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX idx_marketplace_orders_tenant_provider_external
ON marketplace_orders (tenant_id, provider, external_order_id);

CREATE UNIQUE INDEX idx_marketplace_orders_tenant_idempotency
ON marketplace_orders (tenant_id, idempotency_key);

CREATE INDEX idx_marketplace_orders_tenant_user_provider
ON marketplace_orders (tenant_id, user_id, provider);

CREATE TABLE integration_logs (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(128) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  integration_id VARCHAR(64) NULL,
  provider VARCHAR(64) NULL,
  action VARCHAR(80) NOT NULL,
  status VARCHAR(32) NOT NULL,
  message TEXT NOT NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_integration_logs_tenant_user_created
ON integration_logs (tenant_id, user_id, created_at);

CREATE TABLE pagespeed_reports (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(128) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  url TEXT NOT NULL,
  strategy VARCHAR(16) NOT NULL,
  performance_score INT NOT NULL,
  accessibility_score INT NOT NULL,
  best_practices_score INT NOT NULL,
  seo_score INT NOT NULL,
  lcp_ms INT NULL,
  cls DECIMAL(10, 4) NULL,
  inp_ms INT NULL,
  fid_ms INT NULL,
  total_blocking_time_ms INT NULL,
  speed_index_ms INT NULL,
  load_time_ms INT NULL,
  raw_summary JSON NOT NULL,
  created_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_pagespeed_reports_tenant_user_created
ON pagespeed_reports (tenant_id, user_id, created_at);
