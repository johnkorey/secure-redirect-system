-- Add support for multiple cPanel configurations
-- Add cpanel_config_id to link domains to their cPanel account
ALTER TABLE cpanel_domains ADD COLUMN IF NOT EXISTS cpanel_config_id VARCHAR(50);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_cpanel_domains_config ON cpanel_domains(cpanel_config_id);

-- Update existing domains to link to 'main' config if they exist
UPDATE cpanel_domains SET cpanel_config_id = 'main' WHERE cpanel_config_id IS NULL;
