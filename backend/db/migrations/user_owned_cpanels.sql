-- Add support for user-owned cPanel configurations
-- owner_type: 'admin' for admin-added cPanels, 'user' for user-added cPanels
-- owner_id: user_id for user-owned cPanels, NULL for admin-owned

ALTER TABLE cpanel_config ADD COLUMN IF NOT EXISTS owner_type VARCHAR(10) DEFAULT 'admin';
ALTER TABLE cpanel_config ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES api_users(id) ON DELETE CASCADE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_cpanel_config_owner ON cpanel_config(owner_type, owner_id);

-- Update existing configs to be admin-owned
UPDATE cpanel_config SET owner_type = 'admin' WHERE owner_type IS NULL;
