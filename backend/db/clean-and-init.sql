-- Clean Database Script
-- Drops all existing tables and recreates them fresh

-- Drop all tables (in reverse order of dependencies)
DROP TABLE IF EXISTS companion_domains CASCADE;
DROP TABLE IF EXISTS ip_cache CASCADE;
DROP TABLE IF EXISTS realtime_events CASCADE;
DROP TABLE IF EXISTS signup_sessions CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS domains CASCADE;
DROP TABLE IF EXISTS system_configs CASCADE;
DROP TABLE IF EXISTS announcements CASCADE;
DROP TABLE IF EXISTS forum_messages CASCADE;
DROP TABLE IF EXISTS captured_emails CASCADE;
DROP TABLE IF EXISTS visitor_logs CASCADE;
DROP TABLE IF EXISTS hosted_links CASCADE;
DROP TABLE IF EXISTS redirects CASCADE;
DROP TABLE IF EXISTS user_agent_patterns CASCADE;
DROP TABLE IF EXISTS isp_configs CASCADE;
DROP TABLE IF EXISTS ip_ranges CASCADE;
DROP TABLE IF EXISTS api_users CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Now all tables are clean!
-- The schema.sql will recreate them

