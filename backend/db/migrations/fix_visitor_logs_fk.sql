-- Migration: Fix visitor_logs foreign key constraints for API classification calls
-- This allows logging API classify calls without requiring a redirect or strict user reference

-- Step 1: Drop the existing foreign key constraints
ALTER TABLE visitor_logs DROP CONSTRAINT IF EXISTS visitor_logs_redirect_id_fkey;
ALTER TABLE visitor_logs DROP CONSTRAINT IF EXISTS visitor_logs_user_id_fkey;

-- Step 2: Make redirect_id nullable (for API classification calls that don't have a redirect)
ALTER TABLE visitor_logs ALTER COLUMN redirect_id DROP NOT NULL;

-- Step 3: Re-add user_id foreign key but allow it to reference api_users OR be any string
-- (We'll handle the validation in code instead of DB constraints)
-- The user_id column stays as-is but without strict FK

-- Step 4: Add an index for api_user_id if we want to track API users separately
-- For now, we'll use user_id to store either users.id or api_users.id

-- Note: This migration is safe to run multiple times (uses IF EXISTS)

