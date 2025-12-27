# Database Schema Management

## Files

### `schema.sql` - SAFE Automatic Initialization
- ✅ **Runs automatically on every server startup**
- ✅ **Safe - Uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`**
- ✅ **Idempotent - Can run multiple times without data loss**
- ✅ **Production-safe - Preserves existing data**

This is the main schema file used during normal operations.

### `MANUAL-clean-database.sql` - DANGEROUS Manual Cleanup
- ⚠️ **MANUAL USE ONLY**
- ⚠️ **DELETES ALL DATA**
- ⚠️ **DO NOT run automatically**
- ⚠️ **DO NOT use in production unless you want data loss**

Use this ONLY when:
- Fixing schema conflicts during development
- Setting up a fresh development environment
- You explicitly want to wipe all data

**How to use (PostgreSQL CLI):**
```bash
# Connect to your database
psql -h your-host -U your-user -d your-database

# Run the cleanup script
\i backend/db/MANUAL-clean-database.sql

# Exit
\q

# Restart your server - it will recreate tables
npm start
```

**Or via code (one-time operation):**
```javascript
// Create a one-time script: clean-db-once.js
import pg from 'pg';
import fs from 'fs';

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL
});

await client.connect();
const sql = fs.readFileSync('./backend/db/MANUAL-clean-database.sql', 'utf8');
await client.query(sql);
await client.end();

console.log('✓ Database cleaned - restart server to recreate tables');
```

## Schema Migration Best Practices

### Adding New Tables
Just add to `schema.sql` with `CREATE TABLE IF NOT EXISTS` - safe!

### Adding New Columns
Use `ALTER TABLE` with `IF NOT EXISTS` checks:
```sql
-- Add to schema.sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS new_field VARCHAR(255);
```

### Renaming Columns
Requires data migration - do NOT use clean script in production!

### Dropping Tables
Never use clean script in production - write specific DROP statements with backups!

## Development vs Production

### Development
- Feel free to use `MANUAL-clean-database.sql` to reset your local database
- No production data at risk

### Production
- **NEVER** run `MANUAL-clean-database.sql`
- Use proper migration tools (e.g., `node-pg-migrate`, `knex`)
- Always backup before schema changes
- Test migrations on staging first

## Safety Checks

The `initializeDatabase()` function:
- ✅ Only runs `schema.sql` (safe, idempotent)
- ❌ Does NOT run cleanup scripts
- ✅ Preserves existing data
- ✅ Safe for production restarts

