-- Migration: Add cPanel deployment tables
-- Date: 2026-01-10

-- cPanel configuration (admin and user cPanels)
CREATE TABLE IF NOT EXISTS cpanel_config (
  id VARCHAR(50) PRIMARY KEY DEFAULT 'main',
  host VARCHAR(255) NOT NULL,
  username VARCHAR(255) NOT NULL,
  password_encrypted TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  owner_type VARCHAR(10) DEFAULT 'admin',  -- 'admin' or 'user'
  owner_id INTEGER,  -- user_id for user-owned, NULL for admin
  last_verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cpanel_config_owner ON cpanel_config(owner_type, owner_id);

-- Add owner columns if table already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cpanel_config' AND column_name = 'owner_type'
  ) THEN
    ALTER TABLE cpanel_config ADD COLUMN owner_type VARCHAR(10) DEFAULT 'admin';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cpanel_config' AND column_name = 'owner_id'
  ) THEN
    ALTER TABLE cpanel_config ADD COLUMN owner_id INTEGER;
  END IF;
END $$;

-- cPanel domains (fetched from cPanel)
CREATE TABLE IF NOT EXISTS cpanel_domains (
  id VARCHAR(50) PRIMARY KEY,
  domain VARCHAR(255) NOT NULL UNIQUE,
  document_root VARCHAR(500) NOT NULL,
  domain_type VARCHAR(50),
  is_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cpanel_domains_enabled ON cpanel_domains(is_enabled);
CREATE INDEX IF NOT EXISTS idx_cpanel_domains_domain ON cpanel_domains(domain);

-- cPanel deployments (user deployments)
CREATE TABLE IF NOT EXISTS cpanel_deployments (
  id VARCHAR(50) PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  domain_id VARCHAR(50) NOT NULL,
  deployed_url TEXT NOT NULL,
  human_redirect_url TEXT,
  bot_redirect_url TEXT,
  status VARCHAR(50) DEFAULT 'active',
  deployed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (domain_id) REFERENCES cpanel_domains(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cpanel_deployments_user ON cpanel_deployments(user_id);
CREATE INDEX IF NOT EXISTS idx_cpanel_deployments_status ON cpanel_deployments(status);

-- Add cpanel_deploy_limit column to api_users if not exists
-- Normal users: 2 deployments, Unlimited users: 4 deployments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'api_users' AND column_name = 'cpanel_deploy_limit'
  ) THEN
    ALTER TABLE api_users ADD COLUMN cpanel_deploy_limit INTEGER DEFAULT 2;
  END IF;
END $$;
