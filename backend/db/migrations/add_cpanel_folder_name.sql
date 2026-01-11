-- Add folder_name column to cpanel_deployments table
ALTER TABLE cpanel_deployments ADD COLUMN IF NOT EXISTS folder_name VARCHAR(255);
