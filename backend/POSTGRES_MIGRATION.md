# PostgreSQL Migration Guide

Your system has been successfully prepared for PostgreSQL migration! 🎉

## ✅ What's Done

- ✅ PostgreSQL driver installed (`pg` package)
- ✅ Database schema created (`db/schema.sql`)
- ✅ PostgreSQL database module created (`lib/postgresDatabase.js`)
- ✅ Server updated to use PostgreSQL (`server.js`)
- ✅ Migration script ready (`migrate-to-postgres.js`)
- ✅ Setup scripts created (`setup-postgres.ps1`)

## 📋 Next Steps

### Option A: Using Docker (Recommended)

**Prerequisites:**
- Docker Desktop installed
- Docker Desktop is running

**Steps:**
1. **Start Docker Desktop** (if not running)
   - Open Docker Desktop from Start menu
   - Wait for it to fully start (green icon in taskbar)

2. **Run the setup script:**
   ```powershell
   cd backend
   .\setup-postgres.ps1
   ```

3. **Start the server:**
   ```powershell
   node server.js
   ```

### Option B: Using Native PostgreSQL

**Prerequisites:**
- PostgreSQL 14+ installed
- PostgreSQL service running

**Steps:**
1. **Install PostgreSQL** (if not installed):
   - Download: https://www.postgresql.org/download/windows/
   - Install with default settings
   - Remember your postgres password!

2. **Configure database:**
   - Create `.env` file in `backend/` directory:
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=secure_redirect
   DB_USER=postgres
   DB_PASSWORD=your_password_here
   PORT=3001
   JWT_SECRET=your-secret-key-here
   ```

3. **Create database:**
   ```powershell
   # Using psql
   createdb -U postgres secure_redirect
   ```

4. **Run migration:**
   ```powershell
   cd backend
   node migrate-to-postgres.js
   ```

5. **Start the server:**
   ```powershell
   node server.js
   ```

## 📊 What Gets Migrated

The migration will copy **ALL** your existing data from `database.json` to PostgreSQL:

- ✅ Users & API Users
- ✅ Domains & Redirects
- ✅ Visitor Logs (all history)
- ✅ Captured Emails
- ✅ Chat Messages
- ✅ Payments & Sessions
- ✅ System Configurations
- ✅ Announcements
- ✅ IP Ranges, ISP Configs, User Agent Patterns

**Backup:** Your original `database.json` is automatically backed up as `database-backup-TIMESTAMP.json`

## 🐘 Database Information

### Docker Setup
- **Container Name:** `secure_redirect_postgres`
- **Host:** `localhost:5432`
- **Database:** `secure_redirect`
- **User:** `postgres`
- **Password:** `postgres`

### Useful Docker Commands
```powershell
# Stop database
docker stop secure_redirect_postgres

# Start database
docker start secure_redirect_postgres

# View logs
docker logs secure_redirect_postgres

# Connect to database
docker exec -it secure_redirect_postgres psql -U postgres -d secure_redirect

# Remove container (to start fresh)
docker rm -f secure_redirect_postgres
```

## 🔍 Verifying Migration

After migration, you should see:
```
✅ MIGRATION COMPLETE!
📊 Migration Summary:
   • Users:              X
   • API Users:          X
   • Domains:            X
   • Redirects:          X
   • Visitor Logs:       X
   ...
```

## 🚀 Performance Benefits

PostgreSQL provides:
- ✅ **Production-ready reliability**
- ✅ **True ACID transactions**
- ✅ **Concurrent writes** (no race conditions)
- ✅ **Indexed queries** (10-100x faster)
- ✅ **Handles millions of records**
- ✅ **Connection pooling**
- ✅ **Automatic backups**

## ⚠️ Troubleshooting

### Docker won't start
- Make sure Docker Desktop is installed
- Restart Docker Desktop
- Check Windows services for "Docker Desktop Service"

### Migration fails
- Check database connection (host, port, password)
- Ensure PostgreSQL is running
- Check error messages for specific issues

### Port 5432 already in use
- Another PostgreSQL instance is running
- Stop it: `Get-Service postgresql* | Stop-Service`
- Or use a different port in `.env`

### "Permission denied" errors
- Run PowerShell as Administrator
- Or: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

## 🎯 What's Next?

Once migration is complete:
1. Start your server: `node server.js`
2. Login: `admin@example.com` / `admin123`
3. All your data will be there!
4. Enjoy production-ready performance! 🚀

## 📝 Rollback (If Needed)

If something goes wrong, you can rollback:
1. Stop the server
2. Restore the old database: `backend/lib/database.js`
3. Your backup is safe: `database-backup-TIMESTAMP.json`

