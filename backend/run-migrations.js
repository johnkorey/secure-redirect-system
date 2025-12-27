import { query } from './lib/postgresDatabase.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runMigrations() {
  console.log('[MIGRATIONS] Starting database migrations...');
  
  try {
    // Read and run the migration
    const migrationPath = path.join(__dirname, 'db', 'migrations', 'add_mailgun_domain_column.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('[MIGRATIONS] Running: add_mailgun_domain_column.sql');
    await query(migrationSQL);
    console.log('[MIGRATIONS] ✓ Migration completed successfully');
    
    process.exit(0);
  } catch (error) {
    console.error('[MIGRATIONS] ✗ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigrations();

