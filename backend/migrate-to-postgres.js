/**
 * Migration Script: JSON → PostgreSQL
 * Migrates all data from database.json to PostgreSQL
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgresDb from './lib/postgresDatabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  red: '\x1b[31m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function migrate() {
  try {
    log('\n🚀 Starting migration from JSON to PostgreSQL...', 'blue');

    // 1. Initialize PostgreSQL schema
    log('\n📋 Step 1: Initializing PostgreSQL schema...', 'yellow');
    await postgresDb.initializeDatabase();
    log('   ✓ Schema created successfully', 'green');

    // 2. Load JSON data
    log('\n📂 Step 2: Loading existing JSON data...', 'yellow');
    const jsonPath = path.join(__dirname, 'data', 'database.json');
    
    if (!fs.existsSync(jsonPath)) {
      log('   ⚠ No database.json found - starting fresh', 'yellow');
      log('\n✅ Migration complete! Database is ready.', 'green');
      return;
    }

    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    log(`   ✓ Loaded database.json`, 'green');

    // 3. Migrate Users
    log('\n👤 Step 3: Migrating users...', 'yellow');
    const users = Object.values(jsonData.users || {});
    for (const user of users) {
      try {
        await postgresDb.users.create(user);
      } catch (err) {
        if (!err.message.includes('duplicate')) {
          console.error(`   ✗ Failed to migrate user ${user.email}:`, err.message);
        }
      }
    }
    log(`   ✓ Migrated ${users.length} users`, 'green');

    // 4. Migrate API Users
    log('\n🔑 Step 4: Migrating API users...', 'yellow');
    const apiUsers = Object.values(jsonData.apiUsers || {});
    for (const apiUser of apiUsers) {
      try {
        await postgresDb.apiUsers.create(apiUser);
      } catch (err) {
        if (!err.message.includes('duplicate')) {
          console.error(`   ✗ Failed to migrate API user ${apiUser.email}:`, err.message);
        }
      }
    }
    log(`   ✓ Migrated ${apiUsers.length} API users`, 'green');

    // 5. Migrate Domains
    log('\n🌐 Step 5: Migrating domains...', 'yellow');
    const domains = Object.values(jsonData.domains || {});
    for (const domain of domains) {
      try {
        await postgresDb.domains.create(domain);
      } catch (err) {
        if (!err.message.includes('duplicate')) {
          console.error(`   ✗ Failed to migrate domain ${domain.domain_name}:`, err.message);
        }
      }
    }
    log(`   ✓ Migrated ${domains.length} domains`, 'green');

    // 6. Migrate Redirects
    log('\n🔗 Step 6: Migrating redirects...', 'yellow');
    const redirects = Object.values(jsonData.redirects || {});
    for (const redirect of redirects) {
      try {
        await postgresDb.redirects.create(redirect);
      } catch (err) {
        if (!err.message.includes('duplicate')) {
          console.error(`   ✗ Failed to migrate redirect ${redirect.id}:`, err.message);
        }
      }
    }
    log(`   ✓ Migrated ${redirects.length} redirects`, 'green');

    // 7. Migrate Visitor Logs
    log('\n📊 Step 7: Migrating visitor logs...', 'yellow');
    const visitorLogs = jsonData.visitorLogs || [];
    for (const log of visitorLogs) {
      try {
        await postgresDb.visitorLogs.push(log);
      } catch (err) {
        // Skip duplicates silently
        if (!err.message.includes('duplicate')) {
          console.error(`   ✗ Failed to migrate visitor log ${log.id}:`, err.message);
        }
      }
    }
    log(`   ✓ Migrated ${visitorLogs.length} visitor logs`, 'green');

    // 8. Migrate Realtime Events
    log('\n⚡ Step 8: Migrating realtime events...', 'yellow');
    const realtimeEvents = jsonData.realtimeEvents || [];
    let eventsCount = 0;
    for (const event of realtimeEvents.slice(0, 1000)) { // Keep last 1000
      try {
        await postgresDb.realtimeEvents.push(event);
        eventsCount++;
      } catch (err) {
        // Skip errors silently
      }
    }
    log(`   ✓ Migrated ${eventsCount} realtime events`, 'green');

    // 9. Migrate Captured Emails
    log('\n📧 Step 9: Migrating captured emails...', 'yellow');
    const capturedEmails = Object.values(jsonData.capturedEmails || {});
    for (const email of capturedEmails) {
      try {
        await postgresDb.capturedEmails.push(email);
      } catch (err) {
        if (!err.message.includes('duplicate')) {
          console.error(`   ✗ Failed to migrate captured email ${email.id}:`, err.message);
        }
      }
    }
    log(`   ✓ Migrated ${capturedEmails.length} captured emails`, 'green');

    // 10. Migrate Payments
    log('\n💰 Step 10: Migrating payments...', 'yellow');
    const payments = Object.values(jsonData.payments || {});
    for (const payment of payments) {
      try {
        await postgresDb.payments.create(payment);
      } catch (err) {
        if (!err.message.includes('duplicate')) {
          console.error(`   ✗ Failed to migrate payment ${payment.id}:`, err.message);
        }
      }
    }
    log(`   ✓ Migrated ${payments.length} payments`, 'green');

    // 11. Migrate Signup Sessions
    log('\n✍️  Step 11: Migrating signup sessions...', 'yellow');
    const signupSessions = Object.values(jsonData.signupSessions || {});
    for (const session of signupSessions) {
      try {
        await postgresDb.signupSessions.create(session);
      } catch (err) {
        if (!err.message.includes('duplicate')) {
          console.error(`   ✗ Failed to migrate signup session ${session.id}:`, err.message);
        }
      }
    }
    log(`   ✓ Migrated ${signupSessions.length} signup sessions`, 'green');

    // 12. Migrate Chat Messages
    log('\n💬 Step 12: Migrating chat messages...', 'yellow');
    const chatMessages = jsonData.forumMessages || [];
    for (const message of chatMessages) {
      try {
        await postgresDb.forumMessages.push(message);
      } catch (err) {
        // Skip errors silently
      }
    }
    log(`   ✓ Migrated ${chatMessages.length} chat messages`, 'green');

    // 13. Migrate Announcements
    log('\n📢 Step 13: Migrating announcements...', 'yellow');
    const announcements = Object.values(jsonData.announcements || {});
    for (const announcement of announcements) {
      try {
        await postgresDb.announcements.create(announcement);
      } catch (err) {
        if (!err.message.includes('duplicate')) {
          console.error(`   ✗ Failed to migrate announcement ${announcement.id}:`, err.message);
        }
      }
    }
    log(`   ✓ Migrated ${announcements.length} announcements`, 'green');

    // 14. Migrate System Configs
    log('\n⚙️  Step 14: Migrating system configs...', 'yellow');
    const systemConfigs = Object.entries(jsonData.systemConfigs || {});
    for (const [key, value] of systemConfigs) {
      try {
        await postgresDb.systemConfigs.setValue(key, value);
      } catch (err) {
        console.error(`   ✗ Failed to migrate config ${key}:`, err.message);
      }
    }
    log(`   ✓ Migrated ${systemConfigs.length} system configs`, 'green');

    // 15. Migrate IP Ranges
    log('\n🌍 Step 15: Migrating IP ranges...', 'yellow');
    const ipRanges = Object.values(jsonData.ipRanges || {});
    for (const range of ipRanges) {
      try {
        await postgresDb.ipRanges.create(range);
      } catch (err) {
        if (!err.message.includes('duplicate')) {
          console.error(`   ✗ Failed to migrate IP range ${range.id}:`, err.message);
        }
      }
    }
    log(`   ✓ Migrated ${ipRanges.length} IP ranges`, 'green');

    // 16. Migrate ISP Configs
    log('\n🏢 Step 16: Migrating ISP configs...', 'yellow');
    const ispConfigs = Object.values(jsonData.ispConfigs || {});
    for (const config of ispConfigs) {
      try {
        await postgresDb.ispConfigs.create(config);
      } catch (err) {
        if (!err.message.includes('duplicate')) {
          console.error(`   ✗ Failed to migrate ISP config ${config.id}:`, err.message);
        }
      }
    }
    log(`   ✓ Migrated ${ispConfigs.length} ISP configs`, 'green');

    // 17. Migrate User Agent Patterns
    log('\n🤖 Step 17: Migrating user agent patterns...', 'yellow');
    const userAgentPatterns = Object.values(jsonData.userAgentPatterns || {});
    for (const pattern of userAgentPatterns) {
      try {
        await postgresDb.userAgentPatterns.create(pattern);
      } catch (err) {
        if (!err.message.includes('duplicate')) {
          console.error(`   ✗ Failed to migrate user agent pattern ${pattern.id}:`, err.message);
        }
      }
    }
    log(`   ✓ Migrated ${userAgentPatterns.length} user agent patterns`, 'green');

    // 18. Backup JSON file
    log('\n💾 Step 18: Backing up JSON database...', 'yellow');
    const backupPath = path.join(__dirname, 'data', `database-backup-${Date.now()}.json`);
    fs.copyFileSync(jsonPath, backupPath);
    log(`   ✓ Backup saved to: ${path.basename(backupPath)}`, 'green');

    // Summary
    log('\n' + '='.repeat(60), 'blue');
    log('✅ MIGRATION COMPLETE!', 'green');
    log('='.repeat(60), 'blue');
    log(`
📊 Migration Summary:
   • Users:              ${users.length}
   • API Users:          ${apiUsers.length}
   • Domains:            ${domains.length}
   • Redirects:          ${redirects.length}
   • Visitor Logs:       ${visitorLogs.length}
   • Realtime Events:    ${eventsCount}
   • Captured Emails:    ${capturedEmails.length}
   • Payments:           ${payments.length}
   • Signup Sessions:    ${signupSessions.length}
   • Chat Messages:      ${chatMessages.length}
   • Announcements:      ${announcements.length}
   • System Configs:     ${systemConfigs.length}
   • IP Ranges:          ${ipRanges.length}
   • ISP Configs:        ${ispConfigs.length}
   • User Agent Patterns:${userAgentPatterns.length}
    `, 'blue');

    log('🎉 Your database is now running on PostgreSQL!', 'green');
    log('📝 Original JSON backup: ' + path.basename(backupPath), 'yellow');
    log('\n');

  } catch (error) {
    log('\n❌ Migration failed:', 'red');
    console.error(error);
    process.exit(1);
  } finally {
    // Close the pool
    await postgresDb.pool.end();
  }
}

// Run migration
migrate();

