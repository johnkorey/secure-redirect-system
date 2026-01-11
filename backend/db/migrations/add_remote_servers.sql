-- Migration: Add Remote Servers Feature (Per-User)
-- This allows each user to control their own satellite/remote servers

-- ==========================================
-- REMOTE SERVERS TABLE
-- ==========================================
-- Stores registered remote/satellite servers that will fetch config from this central server

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
  status VARCHAR(50) DEFAULT 'active',  -- active, inactive, suspended
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

-- Add user_id column if table already exists without it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'remote_servers' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE remote_servers ADD COLUMN user_id VARCHAR(50);
    -- Set a default user_id for existing records (first admin user)
    UPDATE remote_servers SET user_id = (SELECT id FROM users WHERE role = 'admin' LIMIT 1) WHERE user_id IS NULL;
    ALTER TABLE remote_servers ALTER COLUMN user_id SET NOT NULL;
  END IF;
END $$;

-- Indexes for remote_servers
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
  classification VARCHAR(50),  -- HUMAN or BOT
  decision_reason VARCHAR(255),

  -- Redirect info
  redirected_to TEXT,

  -- Captured email (if any)
  captured_email VARCHAR(255),

  -- Timing
  visit_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (remote_server_id) REFERENCES remote_servers(id) ON DELETE CASCADE
);

-- Indexes for remote_server_logs
CREATE INDEX IF NOT EXISTS idx_remote_server_logs_server_id ON remote_server_logs(remote_server_id);
CREATE INDEX IF NOT EXISTS idx_remote_server_logs_classification ON remote_server_logs(classification);
CREATE INDEX IF NOT EXISTS idx_remote_server_logs_timestamp ON remote_server_logs(visit_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_remote_server_logs_ip ON remote_server_logs(ip_address);

-- ==========================================
-- UPDATE TRIGGER FOR remote_servers
-- ==========================================

DROP TRIGGER IF EXISTS trigger_remote_servers_updated_at ON remote_servers;
CREATE TRIGGER trigger_remote_servers_updated_at
BEFORE UPDATE ON remote_servers
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();
