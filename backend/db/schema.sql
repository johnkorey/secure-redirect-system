-- PostgreSQL Schema for Secure Redirect System
-- Production-ready database schema

-- ==========================================
-- USERS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(50) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ==========================================
-- API USERS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS api_users (
  id VARCHAR(50) PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) NOT NULL,
  api_key VARCHAR(100) UNIQUE NOT NULL,
  access_type VARCHAR(50) DEFAULT 'daily',
  status VARCHAR(50) DEFAULT 'active',
  daily_link_limit INTEGER DEFAULT 1,
  daily_request_limit INTEGER DEFAULT 20000,
  links_created_today INTEGER DEFAULT 0,
  links_created_date DATE,
  current_usage INTEGER DEFAULT 0,
  credits INTEGER DEFAULT 0,
  subscription_start TIMESTAMP,
  subscription_expiry TIMESTAMP,
  telegram_chat_id VARCHAR(100),
  display_name VARCHAR(255),
  referral_code VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (email) REFERENCES users(email) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_users_email ON api_users(email);
CREATE INDEX IF NOT EXISTS idx_api_users_api_key ON api_users(api_key);
CREATE INDEX IF NOT EXISTS idx_api_users_status ON api_users(status);
CREATE INDEX IF NOT EXISTS idx_api_users_telegram ON api_users(telegram_chat_id);

-- ==========================================
-- REDIRECTS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS redirects (
  id VARCHAR(50) PRIMARY KEY,
  public_id VARCHAR(100) UNIQUE NOT NULL,
  user_id VARCHAR(50) NOT NULL,
  name VARCHAR(255),
  full_url TEXT,
  domain_id VARCHAR(50),
  domain_name VARCHAR(255),
  human_url TEXT NOT NULL,
  bot_url TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  total_clicks INTEGER DEFAULT 0,
  human_clicks INTEGER DEFAULT 0,
  bot_clicks INTEGER DEFAULT 0,
  created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_redirects_user_id ON redirects(user_id);
CREATE INDEX IF NOT EXISTS idx_redirects_public_id ON redirects(public_id);
CREATE INDEX IF NOT EXISTS idx_redirects_domain_id ON redirects(domain_id);
CREATE INDEX IF NOT EXISTS idx_redirects_enabled ON redirects(is_enabled);

-- ==========================================
-- VISITOR LOGS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS visitor_logs (
  id VARCHAR(50) PRIMARY KEY,
  redirect_id VARCHAR(50) NOT NULL,
  redirect_name VARCHAR(255),
  user_id VARCHAR(50) NOT NULL,
  ip_address VARCHAR(100),
  country VARCHAR(100),
  region VARCHAR(100),
  city VARCHAR(100),
  isp VARCHAR(255),
  user_agent TEXT,
  browser VARCHAR(100),
  device VARCHAR(100),
  classification VARCHAR(50),
  trust_level VARCHAR(50),
  decision_reason VARCHAR(255),
  redirected_to TEXT,
  visit_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (redirect_id) REFERENCES redirects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_visitor_logs_redirect_id ON visitor_logs(redirect_id);
CREATE INDEX IF NOT EXISTS idx_visitor_logs_user_id ON visitor_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_visitor_logs_ip ON visitor_logs(ip_address);
CREATE INDEX IF NOT EXISTS idx_visitor_logs_classification ON visitor_logs(classification);
CREATE INDEX IF NOT EXISTS idx_visitor_logs_created_date ON visitor_logs(created_date DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_logs_visit_timestamp ON visitor_logs(visit_timestamp DESC);

-- ==========================================
-- REALTIME EVENTS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS realtime_events (
  id VARCHAR(50) PRIMARY KEY,
  visitor_type VARCHAR(50),
  ip_address VARCHAR(100),
  country VARCHAR(100),
  browser VARCHAR(100),
  device VARCHAR(100),
  detection_method VARCHAR(255),
  trust_level VARCHAR(50),
  redirect_id VARCHAR(50),
  redirect_name VARCHAR(255),
  user_id VARCHAR(50),
  created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_realtime_events_created_date ON realtime_events(created_date DESC);
CREATE INDEX IF NOT EXISTS idx_realtime_events_visitor_type ON realtime_events(visitor_type);
CREATE INDEX IF NOT EXISTS idx_realtime_events_user_id ON realtime_events(user_id);

-- Auto-cleanup old realtime events (keep last 1000)
CREATE OR REPLACE FUNCTION cleanup_realtime_events() RETURNS void AS $$
BEGIN
  DELETE FROM realtime_events WHERE id IN (
    SELECT id FROM realtime_events ORDER BY created_date DESC OFFSET 1000
  );
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- DOMAINS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS domains (
  id VARCHAR(50) PRIMARY KEY,
  domain_name VARCHAR(255) UNIQUE NOT NULL,
  domain_type VARCHAR(50) DEFAULT 'redirect',
  is_main BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  mailgun_api_key VARCHAR(255),
  mailgun_domain VARCHAR(255),
  mailgun_region VARCHAR(50) DEFAULT 'us',
  mailgun_from_email VARCHAR(255),
  mailgun_from_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_domains_type ON domains(domain_type);
CREATE INDEX IF NOT EXISTS idx_domains_active ON domains(is_active);
CREATE INDEX IF NOT EXISTS idx_domains_main ON domains(is_main);

-- ==========================================
-- COMPANION DOMAINS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS companion_domains (
  id VARCHAR(50) PRIMARY KEY,
  domain_name VARCHAR(255) UNIQUE NOT NULL,
  vercel_deployment_url VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active',
  is_verified BOOLEAN DEFAULT false,
  verification_code VARCHAR(100),
  added_by VARCHAR(50),
  notes TEXT,
  mailgun_api_key VARCHAR(255),
  mailgun_domain VARCHAR(255),
  mailgun_from_email VARCHAR(255),
  mailgun_from_name VARCHAR(255),
  mailgun_region VARCHAR(50) DEFAULT 'us',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  verified_at TIMESTAMP,
  last_used_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_companion_domains_status ON companion_domains(status);
CREATE INDEX IF NOT EXISTS idx_companion_domains_verified ON companion_domains(is_verified);

-- ==========================================
-- CAPTURED EMAILS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS captured_emails (
  id VARCHAR(50) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  parameter_format VARCHAR(50),
  redirect_id VARCHAR(50) NOT NULL,
  redirect_name VARCHAR(255),
  redirect_url TEXT,
  user_id VARCHAR(50),
  classification VARCHAR(50),
  ip_address VARCHAR(100),
  country VARCHAR(100),
  user_agent TEXT,
  browser VARCHAR(100),
  device VARCHAR(100),
  captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (redirect_id) REFERENCES redirects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_captured_emails_email ON captured_emails(email);
CREATE INDEX IF NOT EXISTS idx_captured_emails_redirect_id ON captured_emails(redirect_id);
CREATE INDEX IF NOT EXISTS idx_captured_emails_user_id ON captured_emails(user_id);
CREATE INDEX IF NOT EXISTS idx_captured_emails_captured_at ON captured_emails(captured_at DESC);

-- ==========================================
-- PAYMENTS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR(50) PRIMARY KEY,
  user_email VARCHAR(255) NOT NULL,
  username VARCHAR(100),
  plan_type VARCHAR(50),
  amount DECIMAL(10, 2),
  crypto_currency VARCHAR(50),
  wallet_address TEXT,
  transaction_hash VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending',
  expires_at TIMESTAMP,
  verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payments_user_email ON payments(user_email);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_transaction_hash ON payments(transaction_hash);

-- ==========================================
-- SIGNUP SESSIONS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS signup_sessions (
  id VARCHAR(50) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  username VARCHAR(100),
  full_name VARCHAR(255),
  plan_type VARCHAR(50),
  verification_code VARCHAR(10),
  is_verified BOOLEAN DEFAULT false,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_signup_sessions_email ON signup_sessions(email);
CREATE INDEX IF NOT EXISTS idx_signup_sessions_code ON signup_sessions(verification_code);
CREATE INDEX IF NOT EXISTS idx_signup_sessions_expires ON signup_sessions(expires_at);

-- ==========================================
-- CHAT MESSAGES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id VARCHAR(50) PRIMARY KEY,
  user_id VARCHAR(50),
  sender_email VARCHAR(255),
  sender_name VARCHAR(255),
  sender_role VARCHAR(50) DEFAULT 'user',
  display_name VARCHAR(255),
  is_support BOOLEAN DEFAULT false,
  is_moderated BOOLEAN DEFAULT false,
  message TEXT NOT NULL,
  source VARCHAR(50) DEFAULT 'web',
  telegram_message_id INTEGER,
  telegram_chat_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_telegram_chat_id ON chat_messages(telegram_chat_id);

-- ==========================================
-- ANNOUNCEMENTS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS announcements (
  id VARCHAR(50) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'info',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active);
CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON announcements(created_at DESC);

-- ==========================================
-- SYSTEM CONFIGS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS system_configs (
  config_key VARCHAR(100) PRIMARY KEY,
  config_value TEXT,
  config_type VARCHAR(50) DEFAULT 'system',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- IP RANGES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS ip_ranges (
  id VARCHAR(50) PRIMARY KEY,
  start_ip VARCHAR(100) NOT NULL,
  end_ip VARCHAR(100) NOT NULL,
  classification VARCHAR(50) NOT NULL,
  reason VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ip_ranges_classification ON ip_ranges(classification);

-- ==========================================
-- ISP CONFIGS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS isp_configs (
  id VARCHAR(50) PRIMARY KEY,
  isp_name VARCHAR(255) UNIQUE NOT NULL,
  classification VARCHAR(50) NOT NULL,
  reason VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_isp_configs_classification ON isp_configs(classification);

-- ==========================================
-- USER AGENT PATTERNS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS user_agent_patterns (
  id VARCHAR(50) PRIMARY KEY,
  pattern VARCHAR(255) UNIQUE NOT NULL,
  classification VARCHAR(50) NOT NULL,
  reason VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_agent_patterns_classification ON user_agent_patterns(classification);

-- ==========================================
-- IP CACHE TABLE (for bot caching)
-- ==========================================
CREATE TABLE IF NOT EXISTS ip_cache (
  ip VARCHAR(100) PRIMARY KEY,
  classification VARCHAR(50) NOT NULL,
  reason VARCHAR(255),
  trust_level VARCHAR(50),
  country VARCHAR(100),
  region VARCHAR(100),
  city VARCHAR(100),
  isp VARCHAR(255),
  usage_type VARCHAR(50),
  hit_count INTEGER DEFAULT 1,
  cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_hit TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ip_cache_classification ON ip_cache(classification);
CREATE INDEX IF NOT EXISTS idx_ip_cache_hit_count ON ip_cache(hit_count DESC);

-- ==========================================
-- REMOTE SERVERS TABLE
-- ==========================================
-- Stores registered remote/satellite servers that fetch config from this central server

CREATE TABLE IF NOT EXISTS remote_servers (
  id VARCHAR(50) PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255) NOT NULL,
  api_key VARCHAR(100) UNIQUE NOT NULL,

  -- Configuration that this remote server will use
  human_redirect_url TEXT,
  bot_redirect_url TEXT,

  -- Detection settings
  enable_bot_detection BOOLEAN DEFAULT true,
  enable_email_capture BOOLEAN DEFAULT true,

  -- Status and tracking
  status VARCHAR(50) DEFAULT 'active',
  is_verified BOOLEAN DEFAULT false,
  last_sync_at TIMESTAMP,
  last_heartbeat_at TIMESTAMP,

  -- Statistics
  total_requests INTEGER DEFAULT 0,
  human_count INTEGER DEFAULT 0,
  bot_count INTEGER DEFAULT 0,

  -- Metadata
  notes TEXT,
  created_by VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_remote_servers_api_key ON remote_servers(api_key);
CREATE INDEX IF NOT EXISTS idx_remote_servers_domain ON remote_servers(domain);
CREATE INDEX IF NOT EXISTS idx_remote_servers_status ON remote_servers(status);
CREATE INDEX IF NOT EXISTS idx_remote_servers_user_id ON remote_servers(user_id);

-- ==========================================
-- REMOTE SERVER LOGS TABLE
-- ==========================================
-- Logs visits processed by remote servers (reported back to central)

CREATE TABLE IF NOT EXISTS remote_server_logs (
  id VARCHAR(50) PRIMARY KEY,
  remote_server_id VARCHAR(50) NOT NULL,

  -- Visitor info
  ip_address VARCHAR(100),
  country VARCHAR(100),
  city VARCHAR(100),
  user_agent TEXT,
  browser VARCHAR(100),
  device VARCHAR(100),

  -- Classification
  classification VARCHAR(50),
  decision_reason VARCHAR(255),

  -- Redirect info
  redirected_to TEXT,

  -- Captured email (if any)
  captured_email VARCHAR(255),

  -- Timing
  visit_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (remote_server_id) REFERENCES remote_servers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_remote_server_logs_server_id ON remote_server_logs(remote_server_id);
CREATE INDEX IF NOT EXISTS idx_remote_server_logs_classification ON remote_server_logs(classification);
CREATE INDEX IF NOT EXISTS idx_remote_server_logs_timestamp ON remote_server_logs(visit_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_remote_server_logs_ip ON remote_server_logs(ip_address);

-- ==========================================
-- HELPER FUNCTIONS
-- ==========================================

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for system_configs
DROP TRIGGER IF EXISTS trigger_system_configs_updated_at ON system_configs;
CREATE TRIGGER trigger_system_configs_updated_at
BEFORE UPDATE ON system_configs
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- Trigger for domains
DROP TRIGGER IF EXISTS trigger_domains_updated_at ON domains;
CREATE TRIGGER trigger_domains_updated_at
BEFORE UPDATE ON domains
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- Trigger for remote_servers
DROP TRIGGER IF EXISTS trigger_remote_servers_updated_at ON remote_servers;
CREATE TRIGGER trigger_remote_servers_updated_at
BEFORE UPDATE ON remote_servers
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

