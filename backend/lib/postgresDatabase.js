/**
 * PostgreSQL Database Module
 * Production-ready database with connection pooling and transactions
 */

import pg from 'pg';
const { Pool } = pg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ==========================================
// Database Connection Configuration
// ==========================================
// Supports both:
// 1. DATABASE_URL (DigitalOcean/Heroku format)
// 2. Individual env vars (DB_HOST, DB_PORT, etc.)

let poolConfig;

// Pool size - DigitalOcean Dev DB only allows ~10-22 connections total
// Keep pool small to avoid exhausting connection slots
const POOL_SIZE = parseInt(process.env.DB_POOL_SIZE || '8');

if (process.env.DATABASE_URL) {
  // DigitalOcean App Platform / Heroku format
  console.log('[PostgreSQL] Using DATABASE_URL connection string');
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL !== 'false' ? {
      rejectUnauthorized: false // Required for managed databases
    } : false,
    max: POOL_SIZE,                    // Max connections in pool
    min: 2,                            // Keep 2 connections warm
    idleTimeoutMillis: 30000,          // Release idle connections after 30s
    connectionTimeoutMillis: 30000,    // Wait up to 30s for connection
    allowExitOnIdle: false,            // Keep pool alive
    statement_timeout: 30000,          // Kill queries after 30s
  };
} else {
  // Individual environment variables (local development)
  console.log('[PostgreSQL] Using individual DB environment variables');
  poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'secure_redirect',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: process.env.DB_SSL === 'true' ? {
      rejectUnauthorized: false
    } : false,
    max: POOL_SIZE,
    min: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 30000,
    allowExitOnIdle: false,
    statement_timeout: 30000,
  };
}

console.log(`[PostgreSQL] Pool configured with max ${POOL_SIZE} connections`);

const pool = new Pool(poolConfig);

// Connection event handlers
pool.on('connect', (client) => {
  console.log('[PostgreSQL] ✓ New database connection established');
});

pool.on('error', (err, client) => {
  console.error('[PostgreSQL] ✗ Unexpected pool error:', err.message);
  console.error('[PostgreSQL] This might be a network issue or the database went down');
  // Don't crash - let the retry logic handle it
});

// Log pool stats periodically in development
if (process.env.NODE_ENV !== 'production') {
  setInterval(() => {
    console.log(`[PostgreSQL] Pool stats: total=${pool.totalCount}, idle=${pool.idleCount}, waiting=${pool.waitingCount}`);
  }, 60000); // Every minute
}

pool.on('remove', () => {
  console.log('[PostgreSQL] Connection removed from pool');
});

// Test initial connection
async function testConnection() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time, version() as version');
    console.log('[PostgreSQL] ✓ Connection test successful');
    console.log(`[PostgreSQL] Server time: ${result.rows[0].current_time}`);
    console.log(`[PostgreSQL] Version: ${result.rows[0].version.split(' ').slice(0, 2).join(' ')}`);
    client.release();
    return true;
  } catch (error) {
    console.error('[PostgreSQL] ✗ Connection test failed:', error.message);
    throw error;
  }
}

// Export test function
export { testConnection };

/**
 * Initialize database schema
 * SAFE: Uses CREATE TABLE/INDEX IF NOT EXISTS - preserves existing data
 */
export async function initializeDatabase() {
  try {
    console.log('[PostgreSQL] Initializing database schema...');
    
    // Read and execute schema (safe - uses IF NOT EXISTS)
    const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Execute schema (idempotent - won't affect existing tables)
    await pool.query(schema);
    
    console.log('[PostgreSQL] ✓ Database schema initialized (existing data preserved)');
    return true;
  } catch (error) {
    console.error('[PostgreSQL] Failed to initialize schema:', error.message);
    throw error;
  }
}

// ==========================================
// GENERIC QUERY HELPERS
// ==========================================

// Track recent errors to avoid log spam
let recentErrorCount = 0;
let lastErrorLogTime = 0;

// ==========================================
// HIGH-PERFORMANCE CACHING LAYER
// ==========================================
// For 5000+ req/s - cache redirects in memory

const redirectCache = new Map();
const REDIRECT_CACHE_TTL = 300000; // 5 minutes
let lastRedirectCacheClean = Date.now();

// Batch logging queue - collect logs and write in batches
const visitorLogQueue = [];
const realtimeEventQueue = [];
const emailCaptureQueue = [];
let batchFlushTimer = null;
const BATCH_SIZE = 100;
const BATCH_INTERVAL = 2000; // Flush every 2 seconds

// Start batch flush timer - called after server is ready
let batchTimerStarted = false;
function startBatchFlushTimer() {
  if (batchTimerStarted || batchFlushTimer) return;
  batchTimerStarted = true;
  batchFlushTimer = setInterval(flushAllQueues, BATCH_INTERVAL);
  console.log('[BATCH-LOG] Batch flush timer started');
}

async function flushAllQueues() {
  // Only flush if pool is available
  if (!pool || pool.ended) return;
  
  try {
    await Promise.all([
      flushVisitorLogs(),
      flushRealtimeEvents(),
      flushEmailCaptures()
    ]);
  } catch (error) {
    // Ignore flush errors - non-critical
  }
}

async function flushVisitorLogs() {
  if (visitorLogQueue.length === 0 || !pool || pool.ended) return;
  
  const batch = visitorLogQueue.splice(0, BATCH_SIZE);
  if (batch.length === 0) return;
  
  try {
    // Bulk insert with individual inserts as fallback for reliability
    for (const log of batch) {
      await pool.query(
        `INSERT INTO visitor_logs (
          id, redirect_id, redirect_name, user_id, ip_address, country, region, city, isp,
          user_agent, browser, device, classification, trust_level, decision_reason,
          redirected_to, visit_timestamp, created_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        ON CONFLICT DO NOTHING`,
        [
          log.id, log.redirect_id, log.redirect_name, log.user_id, log.ip_address,
          log.country, log.region, log.city, log.isp, log.user_agent, log.browser, log.device,
          log.classification, log.trust_level, log.decision_reason, log.redirected_to,
          log.visit_timestamp || new Date(), log.created_date || new Date()
        ]
      );
    }
  } catch (error) {
    // Re-queue failed items for retry (only first few to avoid infinite growth)
    if (batch.length <= 10) {
      visitorLogQueue.unshift(...batch);
    }
  }
}

async function flushRealtimeEvents() {
  if (realtimeEventQueue.length === 0 || !pool || pool.ended) return;
  
  const batch = realtimeEventQueue.splice(0, BATCH_SIZE);
  if (batch.length === 0) return;
  
  try {
    for (const event of batch) {
      await pool.query(
        `INSERT INTO realtime_events (
          id, visitor_type, ip_address, country, browser, device,
          detection_method, trust_level, redirect_id, redirect_name, user_id,
          created_date, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT DO NOTHING`,
        [
          event.id, event.visitor_type, event.ip_address, event.country,
          event.browser, event.device, event.detection_method, event.trust_level,
          event.redirect_id, event.redirect_name, event.user_id,
          event.created_date || new Date(), event.created_at || new Date()
        ]
      );
    }
  } catch (error) {
    // Re-queue failed items for retry
    if (batch.length <= 10) {
      realtimeEventQueue.unshift(...batch);
    }
  }
}

async function flushEmailCaptures() {
  if (emailCaptureQueue.length === 0 || !pool || pool.ended) return;
  
  const batch = emailCaptureQueue.splice(0, BATCH_SIZE);
  if (batch.length === 0) return;
  
  try {
    for (const email of batch) {
      await pool.query(
        `INSERT INTO captured_emails (
          id, email, parameter_format, redirect_id, redirect_name, redirect_url,
          user_id, classification, ip_address, country, user_agent, browser, device, captured_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT DO NOTHING`,
        [
          email.id, email.email, email.parameter_format, email.redirect_id,
          email.redirect_name, email.redirect_url, email.user_id, email.classification,
          email.ip_address, email.country, email.user_agent, email.browser,
          email.device, email.captured_at || new Date()
        ]
      );
    }
  } catch (error) {
    // Re-queue failed items for retry
    if (batch.length <= 10) {
      emailCaptureQueue.unshift(...batch);
    }
  }
}

// Export function to start batch timer (call after server is ready)
export { startBatchFlushTimer };

// Get redirect from cache or DB
export async function getCachedRedirect(publicId) {
  // Clean old cache entries periodically
  const now = Date.now();
  if (now - lastRedirectCacheClean > 60000) {
    for (const [key, entry] of redirectCache.entries()) {
      if (now - entry.timestamp > REDIRECT_CACHE_TTL) {
        redirectCache.delete(key);
      }
    }
    lastRedirectCacheClean = now;
  }
  
  // Check cache first
  const cached = redirectCache.get(publicId);
  if (cached && (now - cached.timestamp) < REDIRECT_CACHE_TTL) {
    return cached.data;
  }
  
  // Cache miss - fetch from DB
  try {
    const result = await pool.query(
      'SELECT * FROM redirects WHERE public_id = $1 AND is_enabled = true',
      [publicId]
    );
    const redirect = result.rows[0] || null;
    
    // Cache the result (even null to avoid repeated DB hits for invalid IDs)
    redirectCache.set(publicId, { data: redirect, timestamp: now });
    
    return redirect;
  } catch (error) {
    // On DB error, return cached data even if stale
    if (cached) return cached.data;
    throw error;
  }
}

// Invalidate redirect cache (call when redirects are updated)
export function invalidateRedirectCache(publicId = null) {
  if (publicId) {
    redirectCache.delete(publicId);
  } else {
    redirectCache.clear();
  }
}

// Queue a visitor log (non-blocking)
export function queueVisitorLog(log) {
  visitorLogQueue.push(log);
  // If queue is getting big, trigger immediate flush
  if (visitorLogQueue.length >= BATCH_SIZE * 2) {
    flushVisitorLogs().catch(() => {});
  }
}

// Queue a realtime event (non-blocking)
export function queueRealtimeEvent(event) {
  realtimeEventQueue.push(event);
  if (realtimeEventQueue.length >= BATCH_SIZE * 2) {
    flushRealtimeEvents().catch(() => {});
  }
}

// Queue email capture (non-blocking)
export function queueEmailCapture(email) {
  emailCaptureQueue.push(email);
  if (emailCaptureQueue.length >= BATCH_SIZE * 2) {
    flushEmailCaptures().catch(() => {});
  }
}

// Get queue stats for monitoring
export function getQueueStats() {
  return {
    visitorLogs: visitorLogQueue.length,
    realtimeEvents: realtimeEventQueue.length,
    emailCaptures: emailCaptureQueue.length,
    redirectCacheSize: redirectCache.size
  };
}

export async function query(text, params, retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await pool.query(text, params);
      // Reset error count on success
      if (recentErrorCount > 0) recentErrorCount = 0;
      return result;
    } catch (error) {
      const isConnectionError = error.code === '53300' || // connection slots exhausted
                                error.code === '57P01' || // admin shutdown
                                error.code === '57P03' || // cannot connect now
                                error.message.includes('timeout') ||
                                error.message.includes('connection');
      
      if (isConnectionError && attempt < retries) {
        // Exponential backoff with jitter
        const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // Throttle error logging to avoid spam
      recentErrorCount++;
      const now = Date.now();
      if (now - lastErrorLogTime > 5000 || recentErrorCount <= 3) {
        console.error(`[PostgreSQL] Query error: ${error.message} (${recentErrorCount} recent errors)`);
        lastErrorLogTime = now;
      }
      throw error;
    }
  }
}

// Non-blocking query for logging (fire and forget with graceful failure)
export async function queryNonBlocking(text, params) {
  try {
    // Check if pool has available connections before attempting
    if (pool.waitingCount > 5) {
      // Too many waiting, skip this query
      return null;
    }
    return await pool.query(text, params);
  } catch (error) {
    // Silently fail for non-critical operations
    return null;
  }
}

export async function getClient() {
  return await pool.connect();
}

// ==========================================
// USERS
// ==========================================

export const users = {
  async create(user) {
    const result = await query(
      `INSERT INTO users (id, email, password, full_name, role, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [user.id, user.email, user.password, user.full_name, user.role || 'user', user.created_at || new Date()]
    );
    return result.rows[0];
  },

  async findByEmail(email) {
    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0] || null;
  },

  async findById(id) {
    const result = await query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  async update(id, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.entries(updates).forEach(([key, value]) => {
      fields.push(`${key} = $${paramCount}`);
      values.push(value);
      paramCount++;
    });

    values.push(id);
    const result = await query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0];
  },

  async delete(id) {
    await query('DELETE FROM users WHERE id = $1', [id]);
    return true;
  },

  async list() {
    const result = await query('SELECT * FROM users ORDER BY created_at DESC');
    return result.rows;
  }
};

// ==========================================
// API USERS
// ==========================================

export const apiUsers = {
  async create(apiUser) {
    const result = await query(
      `INSERT INTO api_users (
        id, username, email, api_key, access_type, status, 
        daily_link_limit, daily_request_limit, links_created_today, links_created_date,
        current_usage, credits, subscription_start, subscription_expiry,
        telegram_chat_id, display_name, referral_code, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *`,
      [
        apiUser.id, apiUser.username, apiUser.email, apiUser.api_key,
        apiUser.access_type, apiUser.status, apiUser.daily_link_limit,
        apiUser.daily_request_limit, apiUser.links_created_today || 0,
        apiUser.links_created_date, apiUser.current_usage || 0,
        apiUser.credits || 0, apiUser.subscription_start, apiUser.subscription_expiry,
        apiUser.telegram_chat_id, apiUser.display_name, apiUser.referral_code,
        apiUser.created_at || new Date()
      ]
    );
    return result.rows[0];
  },

  async findByEmail(email) {
    const result = await query('SELECT * FROM api_users WHERE email = $1', [email]);
    return result.rows[0] || null;
  },

  async findByApiKey(apiKey) {
    const result = await query('SELECT * FROM api_users WHERE api_key = $1', [apiKey]);
    return result.rows[0] || null;
  },

  async findByUsername(username) {
    const result = await query('SELECT * FROM api_users WHERE username = $1', [username]);
    return result.rows[0] || null;
  },

  async findById(id) {
    const result = await query('SELECT * FROM api_users WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  async update(id, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.entries(updates).forEach(([key, value]) => {
      fields.push(`${key} = $${paramCount}`);
      values.push(value);
      paramCount++;
    });

    values.push(id);
    const result = await query(
      `UPDATE api_users SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0];
  },

  async delete(id) {
    await query('DELETE FROM api_users WHERE id = $1', [id]);
    return true;
  },

  async list() {
    const result = await query('SELECT * FROM api_users ORDER BY created_at DESC');
    return result.rows;
  },

  async values() {
    return (await this.list());
  },

  // Atomic check and increment for link counter (prevents race conditions)
  async checkAndIncrementLinkCounter(apiUserId, dailyLimit) {
    console.log('[ATOMIC-COUNTER] Starting transaction for user:', apiUserId);
    const client = await getClient();
    try {
      await client.query('BEGIN');
      console.log('[ATOMIC-COUNTER] Transaction started');
      
      // Lock the row for update to prevent concurrent modifications
      const result = await client.query(
        'SELECT * FROM api_users WHERE id = $1 FOR UPDATE',
        [apiUserId]
      );
      console.log('[ATOMIC-COUNTER] Row locked, found:', result.rows.length, 'users');
      
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        console.log('[ATOMIC-COUNTER] User not found, rolling back');
        return { success: false, error: 'API user not found' };
      }
      
      const apiUser = result.rows[0];
      const today = new Date().toISOString().split('T')[0];
      
      // Convert database timestamp to date string for comparison
      const storedDate = apiUser.links_created_date 
        ? new Date(apiUser.links_created_date).toISOString().split('T')[0]
        : null;
      
      console.log('[ATOMIC-COUNTER] Current state:', {
        user: apiUser.email,
        links_created_today: apiUser.links_created_today,
        links_created_date_raw: apiUser.links_created_date,
        links_created_date_normalized: storedDate,
        today: today,
        dates_match: storedDate === today
      });
      
      // Reset counter if new day
      let linksCreatedToday = parseInt(apiUser.links_created_today) || 0;
      let linksCreatedDate = apiUser.links_created_date;
      
      if (storedDate !== today) {
        console.log('[ATOMIC-COUNTER] New day detected, resetting counter from', linksCreatedToday, 'to 0');
        linksCreatedToday = 0;
        linksCreatedDate = today;
      } else {
        console.log('[ATOMIC-COUNTER] Same day, keeping current count:', linksCreatedToday);
      }
      
      // Check if limit reached
      console.log('[ATOMIC-COUNTER] Checking limit:', linksCreatedToday, '>=', dailyLimit);
      if (linksCreatedToday >= dailyLimit) {
        await client.query('ROLLBACK');
        console.log('[ATOMIC-COUNTER] Limit reached, blocking');
        return { 
          success: false, 
          error: `Daily link limit reached. You can create ${dailyLimit} link${dailyLimit > 1 ? 's' : ''} per day.`,
          limit: dailyLimit,
          created: linksCreatedToday
        };
      }
      
      // Increment counter
      linksCreatedToday += 1;
      console.log('[ATOMIC-COUNTER] Incrementing counter to:', linksCreatedToday);
      
      // Update the database
      const updateResult = await client.query(
        `UPDATE api_users 
         SET links_created_today = $1, links_created_date = $2 
         WHERE id = $3 
         RETURNING *`,
        [linksCreatedToday, linksCreatedDate, apiUserId]
      );
      console.log('[ATOMIC-COUNTER] Database updated, new count:', updateResult.rows[0].links_created_today);
      
      await client.query('COMMIT');
      console.log('[ATOMIC-COUNTER] Transaction committed successfully');
      
      return { 
        success: true, 
        count: linksCreatedToday,
        limit: dailyLimit,
        apiUser: updateResult.rows[0]
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[ATOMIC-COUNTER] Transaction error:', error);
      return { success: false, error: 'Failed to update link counter', details: error.message };
    } finally {
      client.release();
      console.log('[ATOMIC-COUNTER] Database client released');
    }
  }
};

// ==========================================
// REDIRECTS
// ==========================================

export const redirects = {
  async create(redirect) {
    const result = await query(
      `INSERT INTO redirects (
        id, public_id, user_id, name, full_url, domain_id, domain_name,
        human_url, bot_url, is_enabled, total_clicks, human_clicks, bot_clicks, created_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        redirect.id, redirect.public_id, redirect.user_id, redirect.name,
        redirect.full_url, redirect.domain_id, redirect.domain_name,
        redirect.human_url, redirect.bot_url, redirect.is_enabled !== false,
        redirect.total_clicks || 0, redirect.human_clicks || 0, redirect.bot_clicks || 0,
        redirect.created_date || new Date()
      ]
    );
    return result.rows[0];
  },

  async get(id) {
    const result = await query('SELECT * FROM redirects WHERE id = $1 OR public_id = $1', [id]);
    return result.rows[0] || null;
  },

  async update(id, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.entries(updates).forEach(([key, value]) => {
      fields.push(`${key} = $${paramCount}`);
      values.push(value);
      paramCount++;
    });

    values.push(id);
    const result = await query(
      `UPDATE redirects SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0];
  },

  async delete(id) {
    await query('DELETE FROM redirects WHERE id = $1', [id]);
    return true;
  },

  async findByUserId(userId) {
    const result = await query('SELECT * FROM redirects WHERE user_id = $1 ORDER BY created_date DESC', [userId]);
    return result.rows;
  },

  async list() {
    const result = await query('SELECT * FROM redirects ORDER BY created_date DESC');
    return result.rows;
  },

  async findById(id) {
    return await this.get(id);
  },

  set: async function(id, redirect) {
    return await this.update(id, redirect);
  }
};

// ==========================================
// VISITOR LOGS
// ==========================================

export const visitorLogs = {
  // Queue-based push - instant return, batch writes to DB
  async push(log) {
    queueVisitorLog(log);
    return log; // Return immediately - log will be batch-written
  },

  async getAll() {
    const result = await query('SELECT * FROM visitor_logs ORDER BY created_date DESC LIMIT 10000');
    return result.rows;
  },

  async filter(criteria) {
    const conditions = [];
    const values = [];
    let paramCount = 1;

    Object.entries(criteria).forEach(([key, value]) => {
      conditions.push(`${key} = $${paramCount}`);
      values.push(value);
      paramCount++;
    });

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(
      `SELECT * FROM visitor_logs ${whereClause} ORDER BY created_date DESC LIMIT 1000`,
      values
    );
    return result.rows;
  },

  async list(limit = 1000) {
    const result = await query(
      'SELECT * FROM visitor_logs ORDER BY created_date DESC LIMIT $1',
      [limit]
    );
    return result.rows;
  },

  async countByClassification(classification) {
    const result = await query(
      'SELECT COUNT(*) as count FROM visitor_logs WHERE classification = $1',
      [classification]
    );
    return parseInt(result.rows[0].count);
  },

  // Get logs within a specific time period (24 hours or 7 days)
  async getByTimePeriod(hours = 24) {
    const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000);
    const result = await query(
      'SELECT * FROM visitor_logs WHERE created_date >= $1 ORDER BY created_date DESC',
      [cutoffDate]
    );
    return result.rows;
  },

  // Get logs by time period for a specific user
  async getByUserAndTimePeriod(userId, hours = 24) {
    const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000);
    const result = await query(
      'SELECT * FROM visitor_logs WHERE user_id = $1 AND created_date >= $2 ORDER BY created_date DESC',
      [userId, cutoffDate]
    );
    return result.rows;
  },

  // Cleanup old records (older than 7 days)
  async cleanupOldRecords(daysToKeep = 7) {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
    const result = await query(
      'DELETE FROM visitor_logs WHERE created_date < $1',
      [cutoffDate]
    );
    return result.rowCount; // Returns number of deleted rows
  }
};

// ==========================================
// REALTIME EVENTS
// ==========================================

export const realtimeEvents = {
  // Queue-based push - instant return, batch writes to DB
  async push(event) {
    queueRealtimeEvent(event);
    return event; // Return immediately - event will be batch-written
  },

  async getAll() {
    const result = await query('SELECT * FROM realtime_events ORDER BY created_date DESC LIMIT 1000');
    return result.rows;
  },

  async list(limit = 100) {
    const result = await query(
      'SELECT * FROM realtime_events ORDER BY created_date DESC LIMIT $1',
      [limit]
    );
    return result.rows;
  }
};

// ==========================================
// DOMAINS
// ==========================================

export const domains = {
  async create(domain) {
    const result = await query(
      `INSERT INTO domains (
        id, domain_name, domain_type, is_main, is_active,
        mailgun_api_key, mailgun_domain, mailgun_region, mailgun_from_email, mailgun_from_name, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *, domain_type as type`,
      [
        domain.id, domain.domain_name, domain.type || domain.domain_type || 'redirect',
        domain.is_main || false, domain.is_active !== false,
        domain.mailgun_api_key, domain.mailgun_domain, domain.mailgun_region, 
        domain.mailgun_from_email, domain.mailgun_from_name, domain.created_at || new Date()
      ]
    );
    return result.rows[0];
  },

  async get(id) {
    const result = await query('SELECT *, domain_type as type FROM domains WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  async findById(id) {
    return await this.get(id);
  },

  async update(id, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    // Map 'type' to 'domain_type' if present
    const mappedUpdates = { ...updates };
    if (mappedUpdates.type) {
      mappedUpdates.domain_type = mappedUpdates.type;
      delete mappedUpdates.type;
    }

    Object.entries(mappedUpdates).forEach(([key, value]) => {
      fields.push(`${key} = $${paramCount}`);
      values.push(value);
      paramCount++;
    });

    values.push(id);
    const result = await query(
      `UPDATE domains SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *, domain_type as type`,
      values
    );
    return result.rows[0];
  },

  async delete(id) {
    await query('DELETE FROM domains WHERE id = $1', [id]);
    return true;
  },

  async list() {
    const result = await query('SELECT *, domain_type as type FROM domains ORDER BY created_at DESC');
    return result.rows;
  },

  async values() {
    return await this.list();
  }
};

// ==========================================
// CAPTURED EMAILS
// ==========================================

export const capturedEmails = {
  // Queue-based push - instant return, batch writes to DB
  async push(email) {
    queueEmailCapture(email);
    return email; // Return immediately - email will be batch-written
  },

  async getAll() {
    const result = await query('SELECT * FROM captured_emails ORDER BY captured_at DESC LIMIT 10000');
    return result.rows;
  },

  async find(fn) {
    // For compatibility - this is less efficient but works
    const all = await this.getAll();
    return all.find(fn);
  },

  async filter(criteria) {
    const conditions = [];
    const values = [];
    let paramCount = 1;

    Object.entries(criteria).forEach(([key, value]) => {
      conditions.push(`${key} = $${paramCount}`);
      values.push(value);
      paramCount++;
    });

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(
      `SELECT * FROM captured_emails ${whereClause} ORDER BY captured_at DESC`,
      values
    );
    return result.rows;
  },

  get length() {
    return query('SELECT COUNT(*) as count FROM captured_emails')
      .then(res => parseInt(res.rows[0].count));
  }
};

// ==========================================
// PAYMENTS
// ==========================================

export const payments = {
  async create(payment) {
    const result = await query(
      `INSERT INTO payments (
        id, user_email, username, plan_type, amount, crypto_currency,
        wallet_address, transaction_hash, status, expires_at, verified_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        payment.id, payment.user_email, payment.username, payment.plan_type,
        payment.amount, payment.crypto_currency, payment.wallet_address,
        payment.transaction_hash, payment.status || 'pending',
        payment.expires_at, payment.verified_at, payment.created_at || new Date()
      ]
    );
    return result.rows[0];
  },

  async get(id) {
    const result = await query('SELECT * FROM payments WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  async update(id, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.entries(updates).forEach(([key, value]) => {
      fields.push(`${key} = $${paramCount}`);
      values.push(value);
      paramCount++;
    });

    values.push(id);
    const result = await query(
      `UPDATE payments SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0];
  },

  async list() {
    const result = await query('SELECT * FROM payments ORDER BY created_at DESC');
    return result.rows;
  },

  async values() {
    return await this.list();
  }
};

// ==========================================
// SIGNUP SESSIONS
// ==========================================

export const signupSessions = {
  async create(session) {
    const result = await query(
      `INSERT INTO signup_sessions (
        id, email, username, full_name, plan_type, verification_code,
        is_verified, expires_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        session.id, session.email, session.username, session.full_name,
        session.plan_type, session.verification_code, session.is_verified || false,
        session.expires_at, session.created_at || new Date()
      ]
    );
    return result.rows[0];
  },

  async get(id) {
    const result = await query('SELECT * FROM signup_sessions WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  async update(id, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.entries(updates).forEach(([key, value]) => {
      fields.push(`${key} = $${paramCount}`);
      values.push(value);
      paramCount++;
    });

    values.push(id);
    const result = await query(
      `UPDATE signup_sessions SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0];
  },

  async delete(id) {
    await query('DELETE FROM signup_sessions WHERE id = $1', [id]);
    return true;
  }
};

// ==========================================
// CHAT MESSAGES
// ==========================================

export const forumMessages = {
  async push(message) {
    const result = await query(
      `INSERT INTO chat_messages (
        id, user_id, sender_email, sender_name, sender_role, display_name,
        is_support, is_moderated, message, source, telegram_message_id,
        telegram_chat_id, created_at, created_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        message.id, message.user_id, message.sender_email, message.sender_name,
        message.sender_role || 'user', message.display_name, message.is_support || false,
        message.is_moderated || false, message.message, message.source || 'web',
        message.telegram_message_id, message.telegram_chat_id,
        message.created_at || new Date(), message.created_date || new Date()
      ]
    );
    return result.rows[0];
  },

  async list(limit = 200) {
    const result = await query(
      'SELECT * FROM chat_messages ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    return result.rows;
  },

  async update(id, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.entries(updates).forEach(([key, value]) => {
      fields.push(`${key} = $${paramCount}`);
      values.push(value);
      paramCount++;
    });

    values.push(id);
    const result = await query(
      `UPDATE chat_messages SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0];
  },

  async delete(id) {
    await query('DELETE FROM chat_messages WHERE id = $1', [id]);
    return true;
  }
};

// ==========================================
// ANNOUNCEMENTS
// ==========================================

export const announcements = {
  async create(announcement) {
    const result = await query(
      `INSERT INTO announcements (id, title, message, type, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        announcement.id, announcement.title, announcement.message,
        announcement.type || 'info', announcement.is_active !== false,
        announcement.created_at || new Date()
      ]
    );
    return result.rows[0];
  },

  async get(id) {
    const result = await query('SELECT * FROM announcements WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  async update(id, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.entries(updates).forEach(([key, value]) => {
      fields.push(`${key} = $${paramCount}`);
      values.push(value);
      paramCount++;
    });

    values.push(id);
    const result = await query(
      `UPDATE announcements SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0];
  },

  async delete(id) {
    await query('DELETE FROM announcements WHERE id = $1', [id]);
    return true;
  },

  async list() {
    const result = await query('SELECT * FROM announcements ORDER BY created_at DESC');
    return result.rows;
  },

  async values() {
    return await this.list();
  }
};

// ==========================================
// SYSTEM CONFIGS
// ==========================================

export const systemConfigs = {
  async getValue(key) {
    const result = await query('SELECT config_value FROM system_configs WHERE config_key = $1', [key]);
    return result.rows[0]?.config_value || '';
  },

  async setValue(key, value, type = 'system') {
    await query(
      `INSERT INTO system_configs (config_key, config_value, config_type, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (config_key) DO UPDATE SET config_value = $2, updated_at = $4`,
      [key, value, type, new Date()]
    );
    return true;
  },

  async list() {
    const result = await query('SELECT * FROM system_configs ORDER BY config_key');
    return result.rows;
  }
};

// ==========================================
// IP RANGES
// ==========================================

export const ipRanges = {
  async create(range) {
    const result = await query(
      `INSERT INTO ip_ranges (id, start_ip, end_ip, classification, reason, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [range.id, range.start_ip, range.end_ip, range.classification, range.reason, range.created_at || new Date()]
    );
    return result.rows[0];
  },

  async get(id) {
    const result = await query('SELECT * FROM ip_ranges WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  async delete(id) {
    await query('DELETE FROM ip_ranges WHERE id = $1', [id]);
    return true;
  },

  async list() {
    const result = await query('SELECT * FROM ip_ranges ORDER BY created_at DESC');
    return result.rows;
  },

  async values() {
    return await this.list();
  }
};

// ==========================================
// ISP CONFIGS
// ==========================================

export const ispConfigs = {
  async create(config) {
    const result = await query(
      `INSERT INTO isp_configs (id, isp_name, classification, reason, created_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [config.id, config.isp_name, config.classification, config.reason, config.created_at || new Date()]
    );
    return result.rows[0];
  },

  async get(id) {
    const result = await query('SELECT * FROM isp_configs WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  async delete(id) {
    await query('DELETE FROM isp_configs WHERE id = $1', [id]);
    return true;
  },

  async list() {
    const result = await query('SELECT * FROM isp_configs ORDER BY created_at DESC');
    return result.rows;
  },

  async values() {
    return await this.list();
  }
};

// ==========================================
// USER AGENT PATTERNS
// ==========================================

export const userAgentPatterns = {
  async create(pattern) {
    const result = await query(
      `INSERT INTO user_agent_patterns (id, pattern, classification, reason, created_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [pattern.id, pattern.pattern, pattern.classification, pattern.reason, pattern.created_at || new Date()]
    );
    return result.rows[0];
  },

  async get(id) {
    const result = await query('SELECT * FROM user_agent_patterns WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  async delete(id) {
    await query('DELETE FROM user_agent_patterns WHERE id = $1', [id]);
    return true;
  },

  async list() {
    const result = await query('SELECT * FROM user_agent_patterns ORDER BY created_at DESC');
    return result.rows;
  },

  async values() {
    return await this.list();
  }
};

// ==========================================
// STATS HELPERS
// ==========================================

export const stats = {
  async getTotalRequests() {
    const result = await query('SELECT COUNT(*) as count FROM visitor_logs');
    return parseInt(result.rows[0].count);
  },

  async getTotalHumans() {
    const result = await query("SELECT COUNT(*) as count FROM visitor_logs WHERE classification = 'HUMAN'");
    return parseInt(result.rows[0].count);
  },

  async getTotalBots() {
    const result = await query("SELECT COUNT(*) as count FROM visitor_logs WHERE classification = 'BOT'");
    return parseInt(result.rows[0].count);
  },

  async getApiUserCount() {
    const result = await query('SELECT COUNT(*) as count FROM api_users');
    return parseInt(result.rows[0].count);
  },

  async getRedirectCount() {
    const result = await query('SELECT COUNT(*) as count FROM redirects');
    return parseInt(result.rows[0].count);
  }
};

// ==========================================
// IP CACHE
// ==========================================

export const ipCache = {
  async get(ip) {
    const result = await query('SELECT * FROM ip_cache WHERE ip = $1', [ip]);
    if (result.rows[0]) {
      // Update hit count and last_hit
      await query(
        'UPDATE ip_cache SET hit_count = hit_count + 1, last_hit = $1 WHERE ip = $2',
        [new Date(), ip]
      );
      return {
        ...result.rows[0],
        clientInfo: {
          country: result.rows[0].country,
          region: result.rows[0].region,
          city: result.rows[0].city,
          isp: result.rows[0].isp
        }
      };
    }
    return null;
  },

  async set(ip, classification, reason, trustLevel, clientInfo) {
    // Only cache BOT classifications
    if (classification !== 'BOT') return false;

    await query(
      `INSERT INTO ip_cache (
        ip, classification, reason, trust_level, country, region, city, isp, usage_type, cached_at, last_hit
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (ip) DO UPDATE SET
        classification = $2, reason = $3, trust_level = $4, hit_count = ip_cache.hit_count + 1, last_hit = $11`,
      [
        ip, classification, reason, trustLevel,
        clientInfo?.country, clientInfo?.region, clientInfo?.city, clientInfo?.isp,
        clientInfo?.usageType,
        new Date(), new Date()
      ]
    );
    return true;
  },

  async remove(ip) {
    await query('DELETE FROM ip_cache WHERE ip = $1', [ip]);
    return true;
  },

  async clear() {
    await query('DELETE FROM ip_cache');
    return true;
  },

  async getStats() {
    const totalResult = await query('SELECT COUNT(*) as count FROM ip_cache');
    const totalCached = parseInt(totalResult.rows[0].count);

    const hitsResult = await query('SELECT SUM(hit_count) as total FROM ip_cache');
    const apiCallsSaved = parseInt(hitsResult.rows[0].total || 0);

    const hitRateResult = await query(`
      SELECT 
        CASE 
          WHEN COUNT(*) > 0 THEN (SUM(hit_count) * 100.0 / (SUM(hit_count) + COUNT(*)))
          ELSE 0 
        END as hit_rate
      FROM ip_cache
    `);
    const hitRate = parseFloat(hitRateResult.rows[0].hit_rate || 0);

    const missesResult = await query('SELECT COUNT(*) as count FROM ip_cache WHERE hit_count = 0');
    const cacheMisses = parseInt(missesResult.rows[0].count);

    return {
      totalCached,
      apiCallsSaved,
      hitRate,
      cacheMisses
    };
  },

  async getAll() {
    const result = await query('SELECT * FROM ip_cache ORDER BY hit_count DESC, cached_at DESC');
    return result.rows;
  }
};

// ==========================================
// COMPANION DOMAINS
// ==========================================

export const companionDomains = {
  async create(domain) {
    const result = await query(
      `INSERT INTO companion_domains (
        id, domain_name, vercel_deployment_url, status, is_verified,
        verification_code, added_by, notes,
        mailgun_api_key, mailgun_domain, mailgun_from_email, mailgun_from_name, mailgun_region,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        domain.id,
        domain.domain_name,
        domain.vercel_deployment_url || null,
        domain.status || 'active',
        domain.is_verified || false,
        domain.verification_code || null,
        domain.added_by || null,
        domain.notes || null,
        domain.mailgun_api_key || null,
        domain.mailgun_domain || null,
        domain.mailgun_from_email || null,
        domain.mailgun_from_name || null,
        domain.mailgun_region || 'us',
        domain.created_at || new Date()
      ]
    );
    return result.rows[0];
  },

  async get(id) {
    const result = await query('SELECT * FROM companion_domains WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  async getByDomain(domainName) {
    const result = await query('SELECT * FROM companion_domains WHERE domain_name = $1', [domainName]);
    return result.rows[0] || null;
  },

  async getAll() {
    const result = await query('SELECT * FROM companion_domains ORDER BY created_at DESC');
    return result.rows;
  },

  async update(id, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.entries(updates).forEach(([key, value]) => {
      fields.push(`${key} = $${paramCount}`);
      values.push(value);
      paramCount++;
    });

    if (fields.length === 0) return null;

    values.push(id);
    const result = await query(
      `UPDATE companion_domains SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  },

  async delete(id) {
    await query('DELETE FROM companion_domains WHERE id = $1', [id]);
  },

  async verify(id) {
    const result = await query(
      `UPDATE companion_domains 
       SET is_verified = true, verified_at = $1 
       WHERE id = $2 
       RETURNING *`,
      [new Date(), id]
    );
    return result.rows[0] || null;
  },

  async updateLastUsed(domainName) {
    await query(
      'UPDATE companion_domains SET last_used_at = $1 WHERE domain_name = $2',
      [new Date(), domainName]
    );
  }
};

// ==========================================
// HOSTED LINKS (Legacy compatibility)
// ==========================================

export const hostedLinks = {
  async list() {
    return [];
  },
  
  async values() {
    return [];
  }
};

// ==========================================
// EXPORT DEFAULT
// ==========================================

export default {
  pool,
  query,
  getClient,
  initializeDatabase,
  users,
  apiUsers,
  redirects,
  visitorLogs,
  realtimeEvents,
  domains,
  companionDomains,
  capturedEmails,
  payments,
  signupSessions,
  forumMessages,
  announcements,
  systemConfigs,
  ipRanges,
  ispConfigs,
  userAgentPatterns,
  ipCache,
  hostedLinks,
  stats
};
