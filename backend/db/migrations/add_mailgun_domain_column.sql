-- Add mailgun_domain column to domains table
-- This column stores the Mailgun sending domain (e.g., mg.yourdomain.com)

ALTER TABLE domains ADD COLUMN IF NOT EXISTS mailgun_domain VARCHAR(255);

-- Log the migration
DO $$
BEGIN
    RAISE NOTICE 'Migration completed: Added mailgun_domain column to domains table';
END $$;

