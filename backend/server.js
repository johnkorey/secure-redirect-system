/**
 * Secure Redirect Backend Server
 * Full SaaS backend with user/admin authentication, classification, and management
 */

// Load dotenv only in development (not needed in production - DigitalOcean provides env vars)
if (process.env.NODE_ENV !== 'production') {
  try {
    await import('dotenv/config');
  } catch (e) {
    console.log('dotenv not available (production mode)');
  }
}

import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs';
import { makeRedirectDecision } from './lib/redirectDecisionEngine.js';
import { getClientIP } from './lib/ip2locationValidator.js';
import { parseUserAgentDetails } from './lib/userAgentValidator.js';
import { 
  hashPassword, 
  comparePassword, 
  generateToken, 
  authMiddleware,
  optionalAuthMiddleware,
  subscriptionMiddleware 
} from './lib/auth.js';
import { 
  sendVerificationEmail, 
  sendPaymentConfirmationEmail,
  generateVerificationCode 
} from './lib/emailService.js';
import db, { getCachedRedirect, invalidateRedirectCache, getQueueStats, startBatchFlushTimer, getPoolStats } from './lib/postgresDatabase.js';

// Configuration
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const app = express();

// Middleware
app.use(express.json());
app.use(cors({
  origin: true, // Allow all origins for external access
  credentials: true
}));

// Anti-Crawler Middleware - Block known crawlers from all endpoints
app.use((req, res, next) => {
  const userAgent = req.headers['user-agent'] || '';
  
  const crawlerPatterns = [
    /googlebot/i, /bingbot/i, /slurp/i, /duckduckbot/i, /baiduspider/i,
    /yandexbot/i, /sogou/i, /exabot/i, /facebot/i, /ia_archiver/i,
    /msnbot/i, /teoma/i, /semrushbot/i, /ahrefsbot/i, /mj12bot/i,
    /dotbot/i, /rogerbot/i, /serpstatbot/i, /screaming frog/i,
    /archive\.org_bot/i, /petalbot/i, /crawler/i, /spider/i, /scraper/i,
    /bot\.htm/i, /bot\.php/i, /netcraftsurvey/i, /censys/i, /shodan/i,
    /masscan/i, /nmap/i
  ];
  
  const isCrawler = crawlerPatterns.some(pattern => pattern.test(userAgent));
  
  if (isCrawler) {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    console.log(`[BLOCK-CRAWLER] Blocked crawler from ${req.path} - IP: ${ip}, UA: ${userAgent.substring(0, 100)}`);
    res.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
    return res.status(403).json({ 
      error: 'Access denied',
      message: 'Crawlers and indexing bots are not allowed'
    });
  }
  
  next();
});
app.set('trust proxy', true);

// Serve static frontend files in production
import { fileURLToPath } from 'url';
import path from 'path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, '..', 'dist');

// ==========================================
// DOMAIN SEPARATION MIDDLEWARE (with caching)
// ==========================================
// Enforces strict domain separation:
// - Main domain: Can access admin/login pages, CANNOT be used for redirects
// - Redirect domains: Can ONLY handle /r/ redirect routes, NO access to login/admin

// Domain cache to avoid DB queries on every request
let domainCache = null;
let domainCacheTime = 0;
const DOMAIN_CACHE_TTL = 60000; // 1 minute cache

async function getCachedDomains() {
  const now = Date.now();
  if (domainCache && (now - domainCacheTime) < DOMAIN_CACHE_TTL) {
    return domainCache;
  }
  try {
    domainCache = await db.domains.list();
    domainCacheTime = now;
    return domainCache;
  } catch (error) {
    console.error('[DOMAIN] Error fetching domains:', error.message);
    return domainCache || []; // Return stale cache or empty array
  }
}

// Function to invalidate domain cache (call when domains are updated)
export function invalidateDomainCache() {
  domainCache = null;
  domainCacheTime = 0;
}

app.use(async (req, res, next) => {
  const hostname = req.hostname || req.headers.host?.split(':')[0] || 'localhost';
  const requestPath = req.path;
  
  // Skip domain check for localhost/development
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('192.168.')) {
    return next();
  }
  
  // Skip domain check for DigitalOcean app URLs (they should have full access)
  if (hostname.includes('.ondigitalocean.app')) {
    return next();
  }
  
  // ALWAYS ALLOW: Integration script API endpoints (needed for PHP/JS/Python scripts)
  // These must be accessible from ALL domains including redirect domains
  const integrationApiPaths = [
    '/api/classify',
    '/api/capture-email',
    '/api/decision',
    '/api/public/classify',
    '/api/public/log-visit'
  ];
  if (integrationApiPaths.includes(requestPath)) {
    return next();
  }

  // Skip for health checks, static assets, and common paths
  if (requestPath === '/health' || 
      requestPath === '/api/health' ||
      requestPath.startsWith('/assets/') ||
      requestPath.endsWith('.js') ||
      requestPath.endsWith('.css') ||
      requestPath.endsWith('.ico') ||
      requestPath.endsWith('.png') ||
      requestPath.endsWith('.jpg') ||
      requestPath.endsWith('.svg')) {
    return next();
  }
  
  try {
    // Get cached domains (avoids DB query on every request)
    const allDomains = await getCachedDomains();
    
    // Find the domain configuration for this hostname
    const domainConfig = allDomains.find(d => 
      d.domain_name === hostname || 
      d.domain_name === `www.${hostname}` ||
      `www.${d.domain_name}` === hostname
    );
    
    // If no domain config found, allow (might be first setup or unconfigured)
    if (!domainConfig) {
      return next();
    }
    
    const isMainDomain = domainConfig.type === 'main';
    const isRedirectDomain = domainConfig.type === 'redirect';
    
    // REDIRECT DOMAIN RESTRICTIONS
    if (isRedirectDomain) {
      const allowedPaths = [
        /^\/r\//,                    // Redirect routes
        /^\/api\/public\//,          // Public API for redirects
        /^\/api\/classify$/,         // Classification API
        /^\/api\/decision$/,         // Decision API
        /^\/api\/capture-email$/,    // Email capture API
      ];
      
      const isAllowed = allowedPaths.some(pattern => pattern.test(requestPath));
      
      if (!isAllowed) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'This domain is configured for redirects only.'
        });
      }
    }
    
    // MAIN DOMAIN RESTRICTIONS - Block redirect routes (/r/) on main domain
    if (isMainDomain && requestPath.startsWith('/r/')) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Redirect links cannot be used on the main domain.'
      });
    }
    
  } catch (error) {
    // On error, allow access (fail open for availability)
  }
  
  next();
});

app.use(express.static(distPath));

// Pricing configuration
// dailyLinkLimit = how many redirect links user can generate per day
// dailyRequestLimit = how many requests/visits allowed per day (20K for standard, -1 for unlimited)
const PRICING = {
  daily: { price: 100, dailyLinkLimit: 1, dailyRequestLimit: 20000, duration: 1, name: 'Daily' },
  weekly: { price: 300, dailyLinkLimit: 2, dailyRequestLimit: 20000, duration: 7, name: 'Weekly' },
  monthly: { price: 900, dailyLinkLimit: 2, dailyRequestLimit: 20000, duration: 30, name: 'Monthly' },
  unlimited_weekly: { price: 600, dailyLinkLimit: 4, dailyRequestLimit: -1, duration: 7, name: 'Unlimited Weekly' },
  unlimited_monthly: { price: 2000, dailyLinkLimit: 4, dailyRequestLimit: -1, duration: 30, name: 'Unlimited Monthly' }
};

// Default system config values
const defaultSystemConfig = {
  defaultHumanUrl: 'https://example.com',
  defaultBotUrl: 'https://google.com',
  dailyEmailLimit: 10,
  maintenanceMode: false
};

// Helper to get config value from database
async function getConfigValue(key, defaultValue = '') {
  const value = await db.systemConfigs.getValue(key);
  return value || defaultValue;
}

// Helper to get Mailgun config from database
async function getMailgunConfig() {
  return {
    mailgun_api_key: await getConfigValue('mailgun_api_key'),
    mailgun_domain: await getConfigValue('mailgun_domain'),
    mailgun_from_email: await getConfigValue('mailgun_from_email', 'noreply@example.com'),
    mailgun_from_name: await getConfigValue('mailgun_from_name', 'Secure Redirect'),
    mailgun_region: await getConfigValue('mailgun_region', 'us')
  };
}

// ==========================================
// Initialize Database and Admin User
// ==========================================
async function initializeServer() {
  const startTime = Date.now();
  
  try {
    console.log('\n' + '='.repeat(70));
    console.log('🚀 Secure Redirect Server - Starting Initialization');
    console.log('='.repeat(70));
    
    // 1. Test database connection
    console.log('\n[1/3] Testing PostgreSQL connection...');
    const { testConnection } = await import('./lib/postgresDatabase.js');
    await testConnection();
    
    // 2. Initialize PostgreSQL database schema
    console.log('\n[2/4] Initializing database schema...');
    await db.initializeDatabase();
    console.log('      ✓ All tables ready');

    // 3. Run database migrations
    console.log('\n[3/4] Running database migrations...');
    try {
      const migrationPath = path.join(__dirname, 'db', 'migrations', 'add_mailgun_domain_column.sql');
      if (fs.existsSync(migrationPath)) {
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        await db.query(migrationSQL);
        console.log('      ✓ Migration completed: mailgun_domain column added');
      } else {
        console.log('      ⚠ Migration file not found (skipping)');
      }
    } catch (migError) {
      console.error('      ⚠ Migration failed (non-fatal):', migError.message);
      console.log('      → Column may already exist, continuing...');
    }

    // 4. Check if admin user exists
    console.log('\n[4/4] Checking admin account...');
    const existingAdmin = await db.users.findByEmail('admin@example.com');
    const adminPassword = await hashPassword('admin123');
    
    if (!existingAdmin) {
      console.log('      Creating default admin account...');
      
      // Create admin user
      await db.users.create({
        id: 'user-admin',
        email: 'admin@example.com',
        password: adminPassword,
        full_name: 'Admin User',
        role: 'admin',
        created_at: new Date().toISOString()
      });
    } else {
      // Update existing admin to ensure password is set correctly
      console.log('      Updating existing admin account password...');
      await db.users.update(existingAdmin.id, {
        password: adminPassword,
        role: 'admin',
        full_name: 'Admin User'
      });
    }

    // Ensure admin API user exists (create or update)
    const existingApiUser = await db.apiUsers.findByEmail('admin@example.com');
    if (!existingApiUser) {
      console.log('      Creating admin API user...');
      await db.apiUsers.create({
        id: 'apiuser-admin',
        username: 'admin',
        email: 'admin@example.com',
        api_key: 'ak_admin_123456789',
        access_type: 'monthly',
        status: 'active',
        daily_link_limit: 2,
        daily_request_limit: 20000,
        links_created_today: 0,
        links_created_date: new Date().toISOString().split('T')[0],
        current_usage: 0,
        credits: 0,
        subscription_start: new Date().toISOString(),
        subscription_expiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        telegram_chat_id: '',
        display_name: 'Admin User',
        human_url: 'https://example.com',
        bot_url: 'https://google.com',
        referral_code: 'ADMIN2024',
        created_at: new Date().toISOString()
      });
    }

    // Create welcome announcement (skip if already exists)
    try {
      await db.announcements.create({
        id: 'ann-1',
        title: 'Welcome to Secure Redirect',
        message: 'Configure your settings in the Configuration page to get started!',
        type: 'info',
        is_active: true,
        created_at: new Date().toISOString()
      });
    } catch (error) {
      // Announcement already exists, ignore error
    }

    console.log('      ✓ Admin account ready: admin@example.com / admin123');
    
    const initTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n' + '='.repeat(70));
    console.log(`✅ Initialization complete in ${initTime}s`);
    console.log('='.repeat(70) + '\n');
    
    return true;
  } catch (error) {
    console.error('\n' + '='.repeat(70));
    console.error('❌ INITIALIZATION FAILED');
    console.error('='.repeat(70));
    console.error('Error:', error.message);
    console.error('\nPlease check:');
    console.error('  1. Database is running');
    console.error('  2. Connection credentials are correct');
    console.error('  3. Network connectivity');
    console.error('\n');
    throw error;
  }
}

// ==========================================
// Helper: Admin check middleware
// ==========================================
function adminMiddleware(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ==========================================
// Helper: Subscription check wrapper
// ==========================================
// Combines authentication and subscription validation
// Use this for routes that require an active subscription
function requireActiveSubscription(req, res, next) {
  return subscriptionMiddleware(req, res, next, db);
}

// Helper: Generate unique ID
function generateId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ==========================================
// AUTH ROUTES
// ==========================================

// Step 1: Start Signup - Send verification code
app.post('/api/user/signup', async (req, res) => {
  try {
    const { username, email, password, accessType, referralCode, disclaimerAccepted } = req.body;
    
    if (!email || !password || !accessType) {
      return res.status(400).json({ error: 'Email, password, and access type required' });
    }
    if (!disclaimerAccepted) {
      return res.status(400).json({ error: 'You must accept the terms and conditions' });
    }
    if (!PRICING[accessType]) {
      return res.status(400).json({ error: 'Invalid access type' });
    }
    
    // Check if email already registered
    if (await db.users.findByEmail(email.toLowerCase())) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Generate verification code
    const verificationCode = generateVerificationCode();
    const sessionId = generateId('session');

    // Create signup session in database
    const session = {
      id: sessionId,
      username: username || email.split('@')[0],
      email: email.toLowerCase(),
      password: await hashPassword(password),
      access_type: accessType,
      referral_code: referralCode || null,
      verification_code: verificationCode,
      code_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      verified: false,
      paid: false,
      created_at: new Date().toISOString()
    };
    await db.signupSessions.create(session);

    // Send verification email
    const mailgunConfig = await getMailgunConfig();
    const emailResult = await sendVerificationEmail(email, verificationCode, mailgunConfig);

    console.log(`[SIGNUP] Session created: ${sessionId}, Code: ${verificationCode}`);

    res.json({
      sessionId,
      requiresVerification: true,
      message: 'Verification code sent to your email',
      ...(emailResult.simulated && { testCode: verificationCode })
    });
  } catch (error) {
    console.error('[SIGNUP] Error:', error);
    res.status(500).json({ error: 'Signup failed' });
  }
});

// Step 2: Verify email code
app.post('/api/user/verify-email', async (req, res) => {
  try {
    const { sessionId, verificationCode } = req.body;
    
    const session = await db.signupSessions.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }
    
    if (new Date(session.code_expires_at) < new Date()) {
      return res.status(400).json({ error: 'Verification code expired' });
    }
    
    if (session.verification_code !== verificationCode) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Mark session as verified
    await db.signupSessions.update(sessionId, {
      verified: true,
      verified_at: new Date().toISOString()
    });

    console.log(`[SIGNUP] Session verified: ${sessionId}`);

    res.json({
      success: true,
      message: 'Email verified successfully',
      nextStep: 'payment'
    });
  } catch (error) {
    console.error('[VERIFY] Error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Resend verification code
app.post('/api/user/resend-code', async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    const session = await db.signupSessions.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Generate new code
    const verificationCode = generateVerificationCode();
    await db.signupSessions.update(sessionId, {
      verification_code: verificationCode,
      code_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    });

    // Send new verification email
    const mailgunConfig = await getMailgunConfig();
    const emailResult = await sendVerificationEmail(session.email, verificationCode, mailgunConfig);

    res.json({
      success: true,
      message: 'New verification code sent',
      ...(emailResult.simulated && { testCode: verificationCode })
    });
  } catch (error) {
    console.error('[RESEND] Error:', error);
    res.status(500).json({ error: 'Failed to resend code' });
  }
});

// Get pending signup details (for payment page)
app.get('/api/user/pending-signup/:sessionId', async (req, res) => {
  const session = await db.signupSessions.findById(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  if (!session.verified) {
    return res.status(400).json({ error: 'Email not verified yet' });
  }

  const pricing = PRICING[session.access_type];
  
  res.json({
    email: session.email,
    username: session.username,
    accessType: session.access_type,
    pricing: {
      amount: pricing.price,
      currency: 'USD',
      dailyLinkLimit: pricing.dailyLinkLimit,
      durationDays: pricing.duration
    },
    wallets: {
      BTC: getConfigValue('btc_wallet'),
      ETH: getConfigValue('eth_wallet'),
      USDT_TRC20: getConfigValue('usdt_wallet'),
      TRX: getConfigValue('trx_wallet')
    }
  });
});

// Step 3: Complete signup after payment
app.post('/api/user/complete-signup', async (req, res) => {
  try {
    const { sessionId, transactionHash, cryptoType } = req.body;
    
    const session = await db.signupSessions.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (!session.verified) {
      return res.status(400).json({ error: 'Email not verified' });
    }
    if (session.paid) {
      return res.status(400).json({ error: 'Payment already processed' });
    }

    console.log(`[PAYMENT] Processing: ${cryptoType} tx: ${transactionHash}`);

    const pricing = PRICING[session.access_type];
    const expiryDate = new Date(Date.now() + pricing.duration * 24 * 60 * 60 * 1000);

    // Create user account in database
    const user = {
      id: generateId('user'),
      email: session.email,
      password: session.password,
      full_name: session.username,
      role: 'user',
      created_at: new Date().toISOString()
    };
    await db.users.create(user);

    // Create API user in database
    const apiKey = `ak_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const referralCode = Math.random().toString(36).substr(2, 8).toUpperCase();
    
    const apiUser = {
      id: generateId('apiuser'),
      username: session.username,
      email: session.email,
      api_key: apiKey,
      access_type: session.access_type,
      status: 'active',
      daily_link_limit: pricing.dailyLinkLimit,
      daily_request_limit: pricing.dailyRequestLimit, // 20K requests/day
      links_created_today: 0,
      links_created_date: new Date().toISOString().split('T')[0],
      current_usage: 0,
      credits: 0,
      human_url: '',
      bot_url: '',
      referral_code: referralCode,
      subscription_start: new Date().toISOString(),
      subscription_expiry: expiryDate.toISOString(),
      created_at: new Date().toISOString()
    };
    await db.apiUsers.create(apiUser);

    // Record payment in database
    const payment = {
      id: generateId('payment'),
      user_id: user.id,
      email: session.email,
      amount: pricing.price,
      crypto_type: cryptoType,
      transaction_hash: transactionHash,
      access_type: session.access_type,
      status: 'verified',
      created_at: new Date().toISOString()
    };
    await db.payments.create(payment);

    // Mark session as complete
    await db.signupSessions.update(sessionId, {
      paid: true,
      completed_at: new Date().toISOString()
    });

    // Send confirmation email
    const mailgunConfig = await getMailgunConfig();
    await sendPaymentConfirmationEmail(session.email, {
      accessType: session.access_type,
      dailyLinkLimit: pricing.dailyLinkLimit,
      expiryDate: expiryDate.toLocaleDateString(),
      apiKey
    }, mailgunConfig);

    // Generate login token
    const token = generateToken({ id: user.id, email: user.email, role: user.role, apiUserId: apiUser.id });

    console.log(`[SIGNUP] Complete: ${session.email}, Plan: ${session.access_type}`);

    res.json({
      success: true,
      apiKey,
      referralCode,
      token,
      user: { id: user.id, email: user.email, role: user.role },
      subscription: {
        accessType: session.access_type,
        dailyLinkLimit: pricing.dailyLinkLimit,
        expiresAt: expiryDate.toISOString()
      }
    });
  } catch (error) {
    console.error('[COMPLETE-SIGNUP] Error:', error);
    res.status(500).json({ error: 'Failed to complete signup' });
  }
});

// Get pricing plans
app.get('/api/pricing', (req, res) => {
  res.json(PRICING);
});

// Get crypto wallet addresses
app.get('/api/crypto-wallets', (req, res) => {
  res.json({
    BTC: getConfigValue('btc_wallet'),
    ETH: getConfigValue('eth_wallet'),
    USDT_TRC20: getConfigValue('usdt_wallet'),
    USDT_ERC20: getConfigValue('eth_wallet'),
    TRX: getConfigValue('trx_wallet'),
    LTC: getConfigValue('ltc_wallet')
  });
});

// ==========================================
// SUBSCRIPTION RENEWAL
// ==========================================

// Start renewal - creates a renewal session
app.post('/api/user/start-renewal', authMiddleware, async (req, res) => {
  try {
    const { accessType } = req.body;
    
    if (!PRICING[accessType]) {
      return res.status(400).json({ error: 'Invalid access type' });
    }

    const apiUser = db.apiUsers.findByEmail(req.user.email);
    if (!apiUser) {
      return res.status(404).json({ error: 'API User not found' });
    }

    const sessionId = generateId('renew');
    const session = {
      id: sessionId,
      user_id: req.user.id,
      email: req.user.email,
      access_type: accessType,
      current_plan: apiUser.access_type,
      status: 'pending_payment',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 min expiry
    };
    
    db.signupSessions.set(sessionId, session);
    console.log(`[RENEWAL] Session created for ${req.user.email}: ${sessionId}`);

    res.json({
      success: true,
      sessionId,
      accessType,
      pricing: PRICING[accessType]
    });
  } catch (error) {
    console.error('[START-RENEWAL] Error:', error);
    res.status(500).json({ error: 'Failed to start renewal' });
  }
});

// Get renewal session details
app.get('/api/user/renewal-session/:sessionId', authMiddleware, (req, res) => {
  const { sessionId } = req.params;
  const session = db.signupSessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found or expired' });
  }

  if (session.email !== req.user.email) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const pricing = PRICING[session.access_type];
  
  res.json({
    sessionId,
    email: session.email,
    accessType: session.access_type,
    currentPlan: session.current_plan,
    pricing: {
      amount: pricing.price,
      currency: 'USD',
      dailyLinkLimit: pricing.dailyLinkLimit,
      durationDays: pricing.duration
    },
    wallets: {
      BTC: getConfigValue('btc_wallet'),
      ETH: getConfigValue('eth_wallet'),
      USDT_TRC20: getConfigValue('usdt_wallet'),
      TRX: getConfigValue('trx_wallet'),
      LTC: getConfigValue('ltc_wallet')
    }
  });
});

// Complete renewal after payment
app.post('/api/user/complete-renewal', authMiddleware, async (req, res) => {
  try {
    const { sessionId, transactionHash, cryptoType } = req.body;

    if (!sessionId || !transactionHash || !cryptoType) {
      return res.status(400).json({ error: 'Session ID, transaction hash, and crypto type required' });
    }

    const session = db.signupSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }

    if (session.email !== req.user.email) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (session.status === 'completed') {
      return res.status(400).json({ error: 'This session has already been used' });
    }

    console.log(`[RENEWAL] Processing: ${cryptoType} tx: ${transactionHash}`);

    const pricing = PRICING[session.access_type];
    
    // Calculate new expiry date (extend from current expiry or from now if expired)
    const apiUser = db.apiUsers.findByEmail(req.user.email);
    const currentExpiry = new Date(apiUser.subscription_expiry);
    const now = new Date();
    const startDate = currentExpiry > now ? currentExpiry : now;
    const expiryDate = new Date(startDate.getTime() + pricing.duration * 24 * 60 * 60 * 1000);

    // Update API user
    await db.apiUsers.update(apiUser.id, {
      access_type: session.access_type,
      status: 'active',
      daily_link_limit: pricing.dailyLinkLimit,
      daily_request_limit: pricing.dailyRequestLimit,
      subscription_expiry: expiryDate.toISOString()
    });

    // Record payment
    const payment = {
      id: generateId('payment'),
      user_id: req.user.id,
      email: session.email,
      amount: pricing.price,
      crypto_type: cryptoType,
      transaction_hash: transactionHash,
      access_type: session.access_type,
      type: 'renewal',
      status: 'verified',
      created_at: new Date().toISOString()
    };
    await db.payments.create(payment);

    // Mark session as completed
    await db.signupSessions.update(sessionId, {
      status: 'completed',
      completed_at: new Date().toISOString()
    });

    // Send confirmation email if Mailgun configured
    try {
      const mailgunConfig = await getMailgunConfig();
      if (mailgunConfig.mailgun_api_key) {
        await sendPaymentConfirmationEmail(session.email, {
          accessType: session.access_type,
          dailyLinkLimit: pricing.dailyLinkLimit,
          expiryDate: expiryDate.toLocaleDateString(),
          type: 'renewal'
        }, mailgunConfig);
      }
    } catch (emailError) {
      console.warn('[RENEWAL] Email notification failed:', emailError.message);
    }

    console.log(`[RENEWAL] Completed for ${session.email} - ${session.access_type} plan, expires ${expiryDate.toISOString()}`);

    res.json({
      success: true,
      message: 'Subscription renewed successfully!',
      subscription: {
        accessType: session.access_type,
        dailyLinkLimit: pricing.dailyLinkLimit,
        expiresAt: expiryDate.toISOString()
      }
    });
  } catch (error) {
    console.error('[COMPLETE-RENEWAL] Error:', error);
    res.status(500).json({ error: 'Failed to complete renewal' });
  }
});

// Legacy register endpoint - disabled
app.post('/api/auth/register', async (req, res) => {
  res.status(400).json({ 
    error: 'Direct registration is disabled. Please use the signup flow.',
    redirect: '/user/signup'
  });
});

// ONE-TIME ADMIN SETUP (Delete this endpoint after first admin is created!)
app.post('/api/setup-admin-once', async (req, res) => {
  try {
    const { email, password, fullName } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    // Check if any admin already exists
    const existingAdmin = await db.users.findByEmail(email);
    if (existingAdmin) {
      // Update existing admin with new password
      console.log('[ONE-TIME-SETUP] Updating existing admin account...');
      const hashedPassword = await hashPassword(password);
      await db.users.update(existingAdmin.id, {
        password: hashedPassword,
        full_name: fullName || 'Admin User',
        role: 'admin'
      });
      console.log('[ONE-TIME-SETUP] ✓ Admin account updated');
      return res.json({ 
        success: true, 
        message: 'Admin account updated successfully',
        email: email
      });
    }
    
    // Create new admin
    console.log('[ONE-TIME-SETUP] Creating new admin account...');
    const hashedPassword = await hashPassword(password);
    
    // Create admin user
    await db.users.create({
      id: 'user-admin-' + Date.now(),
      email: email,
      password: hashedPassword,
      full_name: fullName || 'Admin User',
      role: 'admin',
      created_at: new Date().toISOString()
    });
    
    // Create admin API user
    await db.apiUsers.create({
      id: 'apiuser-admin-' + Date.now(),
      username: 'admin',
      email: email,
      api_key: 'ak_admin_' + crypto.randomBytes(16).toString('hex'),
      access_type: 'unlimited',
      status: 'active',
      daily_link_limit: 999999,
      daily_request_limit: 999999,
      links_created_today: 0,
      links_created_date: new Date().toISOString().split('T')[0],
      current_usage: 0,
      credits: 999999,
      subscription_start: new Date().toISOString(),
      subscription_expiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      telegram_chat_id: '',
      display_name: fullName || 'Admin User',
      human_url: 'https://example.com',
      bot_url: 'https://google.com',
      referral_code: 'ADMIN2024',
      created_at: new Date().toISOString()
    });
    
    console.log('[ONE-TIME-SETUP] ✓ Admin account created successfully');
    
    res.json({ 
      success: true, 
      message: 'Admin account created successfully! You can now login.',
      email: email
    });
  } catch (error) {
    console.error('[ONE-TIME-SETUP] Error:', error);
    res.status(500).json({ error: 'Failed to create admin: ' + error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await db.users.findByEmail(email.toLowerCase());
    if (!user || !(await comparePassword(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const apiUser = await db.apiUsers.findByEmail(email.toLowerCase());

    const token = generateToken({ id: user.id, email: user.email, role: user.role, apiUserId: apiUser?.id });
    const { password: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword, token, apiUser });
  } catch (error) {
    console.error('[AUTH] Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// First-time password setup using username and API key
app.post('/api/user/setup-password', async (req, res) => {
  try {
    const { username, apiKey, password } = req.body;
    
    if (!username || !apiKey || !password) {
      return res.status(400).json({ error: 'Username, API key, and password required' });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Find API user by username
    const apiUser = await db.apiUsers.findByUsername(username);
    if (!apiUser) {
      console.log(`[SETUP-PASSWORD] Username not found: ${username}`);
      return res.status(404).json({ error: 'Invalid username or API key' });
    }

    // Verify API key
    if (apiUser.api_key !== apiKey) {
      console.log(`[SETUP-PASSWORD] Invalid API key for username: ${username}`);
      return res.status(401).json({ error: 'Invalid username or API key' });
    }

    // Check if password is already set
    const existingUser = await db.users.findByEmail(apiUser.email);
    if (existingUser && existingUser.password && existingUser.password !== '') {
      // Allow password reset even if already set
      console.log(`[SETUP-PASSWORD] Updating existing password for: ${apiUser.email}`);
    }

    // Hash the password
    const hashedPassword = await hashPassword(password);

    // Create or update user
    if (existingUser) {
      await db.users.update(existingUser.id, { password: hashedPassword });
      console.log(`[SETUP-PASSWORD] Password updated for: ${apiUser.email}`);
    } else {
      await db.users.create({
        id: `user-${Date.now()}`,
        email: apiUser.email,
        password: hashedPassword,
        full_name: apiUser.username,
        role: 'user',
        created_at: new Date().toISOString()
      });
      console.log(`[SETUP-PASSWORD] User created with password: ${apiUser.email}`);
    }

    res.json({ 
      success: true, 
      message: 'Password created successfully. You can now login with your email and password.' 
    });
  } catch (error) {
    console.error('[AUTH] Setup password error:', error);
    res.status(500).json({ error: 'Failed to setup password' });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await db.users.findByEmail(req.user.email);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { password: _, ...userWithoutPassword } = user;
    
    const apiUser = await db.apiUsers.findByEmail(req.user.email);
    
    // Calculate current counter status with date validation
    const today = new Date().toISOString().split('T')[0];
    
    // Convert database timestamp to date string for proper comparison
    const storedDate = apiUser.links_created_date 
      ? new Date(apiUser.links_created_date).toISOString().split('T')[0]
      : null;
    
    const linksCreatedToday = storedDate === today ? (apiUser.links_created_today || 0) : 0;
    const dailyLimit = parseInt(apiUser.daily_link_limit) || 1;
    
    res.json({ 
      ...userWithoutPassword, 
      apiUser: {
        ...apiUser,
        linkCounter: {
          linksCreatedToday,
          dailyLinkLimit: dailyLimit,
          remainingLinks: dailyLimit - linksCreatedToday,
          date: today
        }
      }
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ error: 'Failed to retrieve user information' });
  }
});

// ==========================================
// HEALTH & STATS
// ==========================================

// Health check endpoint for DigitalOcean App Platform
// Robots.txt - Block all crawlers
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(`# Block all crawlers
User-agent: *
Disallow: /

# No crawling allowed
Crawl-delay: 0
`);
});

app.get('/health', async (req, res) => {
  try {
    // Test database connection
    const dbTest = await db.query('SELECT 1 as health');
    
    // Get queue stats for monitoring high-traffic scenarios
    const queueStats = getQueueStats();
    
    const poolStats = getPoolStats();
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'postgresql',
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      performance: {
        redirectCacheSize: queueStats.redirectCacheSize,
        pendingVisitorLogs: queueStats.visitorLogs,
        pendingRealtimeEvents: queueStats.realtimeEvents,
        pendingEmailCaptures: queueStats.emailCaptures
      },
      pool: poolStats,
      version: 'v1.3.0-no-limits', // Version marker to verify deployment
      features: {
        atomicCounter: true,
        subscriptionValidation: true,
        linkCounterAPI: true
      }
    });
  } catch (error) {
    console.error('[Health Check] Database error:', error.message);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Database connection failed',
      database: 'postgresql'
    });
  }
});

// Legacy health endpoint (for backwards compatibility)
app.get('/api/health', async (req, res) => {
  try {
    const dbTest = await db.query('SELECT 1 as health');
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'postgresql'
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: 'Database connection failed'
    });
  }
});

app.get('/api/stats', authMiddleware, (req, res) => {
  if (req.user.role === 'admin') {
    res.json({
      totalRequests: db.stats.getTotalRequests(),
      totalHumans: db.stats.getTotalHumans(),
      totalBots: db.stats.getTotalBots(),
      apiUserCount: db.stats.getApiUserCount(),
      redirectCount: db.stats.getRedirectCount(),
      visitorLogCount: db.stats.getTotalRequests()
    });
  } else {
    // User-specific stats from database
    const apiUser = db.apiUsers.findByEmail(req.user.email);
    const redirects = apiUser ? db.redirects.findByUserId(req.user.id) : [];
    res.json({
      totalRequests: redirects.reduce((sum, r) => sum + (r.total_clicks || 0), 0),
      totalHumans: redirects.reduce((sum, r) => sum + (r.human_clicks || 0), 0),
      totalBots: redirects.reduce((sum, r) => sum + (r.bot_clicks || 0), 0)
    });
  }
});

// ==========================================
// API USERS (Admin)
// ==========================================

app.get('/api/api-users', authMiddleware, adminMiddleware, async (req, res) => {
  const apiUsers = await db.apiUsers.list();
  res.json(apiUsers);
});

app.post('/api/api-users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { username, email } = req.body;
    
    if (!username || !email) {
      return res.status(400).json({ error: 'Username and email are required' });
    }
    
    // Check if user account already exists
    let userAccount = await db.users.findByEmail(email.toLowerCase());
    
    // If not, create a basic user account first (required by foreign key constraint)
    if (!userAccount) {
      userAccount = await db.users.create({
        id: generateId('user'),
        email: email.toLowerCase(),
        password: await hashPassword(`temp_${Date.now()}`), // Temporary password
        full_name: username,
        role: 'user',
        created_at: new Date().toISOString()
      });
      console.log(`[CREATE] Created user account for: ${email}`);
    }
    
    // Check if API user already exists
    const existingApiUser = await db.apiUsers.findByEmail(email.toLowerCase());
    if (existingApiUser) {
      return res.status(400).json({ error: 'API user with this email already exists' });
    }
    
    // Create API user
    const apiUser = {
      id: generateId('apiuser'),
      username: username,
      email: email.toLowerCase(),
      api_key: req.body.api_key || `ak_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      access_type: req.body.access_type || 'free',
      status: req.body.status || 'active',
      daily_link_limit: req.body.daily_link_limit || 1,
      daily_request_limit: req.body.daily_request_limit || 20000,
      links_created_today: 0,
      links_created_date: null,
      current_usage: 0,
      credits: req.body.credits || 0,
      subscription_start: req.body.subscription_start ? new Date(req.body.subscription_start) : null,
      subscription_expiry: req.body.subscription_expiry ? new Date(req.body.subscription_expiry) : null,
      telegram_chat_id: req.body.telegram_chat_id || null,
      display_name: req.body.display_name || username,
      referral_code: req.body.referral_code || `REF${Date.now().toString(36).toUpperCase()}`,
      created_at: new Date().toISOString()
    };
    
    const created = await db.apiUsers.create(apiUser);
    console.log(`[CREATE] Created API user: ${email}`);
    res.status(201).json(created);
  } catch (error) {
    console.error('Create API user error:', error);
    res.status(500).json({ error: error.message || 'Failed to create user' });
  }
});

app.get('/api/api-users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const user = await db.apiUsers.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'API user not found' });
    res.json(user);
  } catch (error) {
    console.error('Get API user error:', error);
    res.status(500).json({ error: 'Failed to retrieve user' });
  }
});

app.put('/api/api-users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const user = await db.apiUsers.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'API user not found' });
    const updated = await db.apiUsers.update(req.params.id, req.body);
    res.json(updated);
  } catch (error) {
    console.error('Update API user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.delete('/api/api-users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const apiUser = await db.apiUsers.findById(req.params.id);
  if (!apiUser) return res.status(404).json({ error: 'Not found' });
  
  // Also delete the associated user account if it exists
  const userAccount = await db.users.findByEmail(apiUser.email);
  if (userAccount) {
    await db.users.delete(userAccount.id);
    console.log(`[DELETE] Deleted user account: ${userAccount.email}`);
  }
  
  // Delete the API user
  await db.apiUsers.delete(req.params.id);
  console.log(`[DELETE] Deleted API user: ${apiUser.email}`);
  
  res.status(204).send();
});

// ==========================================
// REDIRECTS / HOSTED LINKS
// ==========================================

app.get('/api/redirects', authMiddleware, requireActiveSubscription, async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const redirects = await db.redirects.list();
  res.json(isAdmin ? redirects : redirects.filter(r => r.user_id === req.user.id));
});

app.post('/api/redirects', authMiddleware, requireActiveSubscription, async (req, res) => {
  const { name, human_url, bot_url, is_enabled = true, domain_id, domain_name, full_url, public_id } = req.body;
  if (!name || !human_url || !bot_url) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Validate domain if provided
  if (domain_id) {
    const domain = await db.domains.findById(domain_id);
    if (!domain) {
      return res.status(400).json({ error: 'Invalid domain' });
    }
    // SECURITY: Prevent using main domain for redirects
    if (domain.type === 'main') {
      return res.status(400).json({ 
        error: 'Cannot use main domain for redirect links. Please select a redirect domain.' 
      });
    }
    if (!domain.is_active) {
      return res.status(400).json({ error: 'Domain is not active' });
    }
  }

  // Find API user and check daily link limit using atomic transaction
  const apiUser = await db.apiUsers.findByEmail(req.user.email);
  if (!apiUser) {
    return res.status(404).json({ error: 'API user not found' });
  }

  // Get daily limit
  const dailyLimit = parseInt(apiUser.daily_link_limit) || 1;
  
  console.log(`[LINK-COUNTER] ======== START ========`);
  console.log(`[LINK-COUNTER] User: ${req.user.email}`);
  console.log(`[LINK-COUNTER] API User ID: ${apiUser.id}`);
  console.log(`[LINK-COUNTER] Current counter: ${apiUser.links_created_today}`);
  console.log(`[LINK-COUNTER] Current date: ${apiUser.links_created_date}`);
  console.log(`[LINK-COUNTER] Daily Limit: ${dailyLimit}`);
  
  // Use atomic check-and-increment to prevent race conditions
  const counterResult = await db.apiUsers.checkAndIncrementLinkCounter(apiUser.id, dailyLimit);
  
  console.log(`[LINK-COUNTER] Counter result:`, JSON.stringify(counterResult, null, 2));
  
  if (!counterResult.success) {
    console.log(`[LINK-COUNTER] ❌ BLOCKED - ${counterResult.error}`);
    return res.status(403).json({ 
      error: counterResult.error,
      limit: counterResult.limit,
      created: counterResult.created
    });
  }
  
  console.log(`[LINK-COUNTER] ✅ SUCCESS - Count: ${counterResult.count}/${dailyLimit}`);
  console.log(`[LINK-COUNTER] ======== END ========`);


  const redirectId = public_id || generateId('r');
  const redirect = {
    id: redirectId,
    public_id: redirectId,
    user_id: req.user.id,
    domain_id: domain_id || null,
    domain_name: domain_name || null,
    full_url: full_url || null,
    name,
    human_url,
    bot_url,
    is_enabled,
    total_clicks: 0,
    human_clicks: 0,
    bot_clicks: 0,
    created_date: new Date().toISOString()
  };
  const created = await db.redirects.create(redirect);
  
  // Include updated counter information in response so frontend can update display
  res.status(201).json({
    ...created,
    linkCounter: {
      linksCreatedToday: counterResult.count,
      dailyLinkLimit: dailyLimit,
      remainingLinks: dailyLimit - counterResult.count
    }
  });
});

app.get('/api/redirects/:id', authMiddleware, requireActiveSubscription, async (req, res) => {
  try {
    const redirect = await db.redirects.get(req.params.id);
    if (!redirect) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'admin' && redirect.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json(redirect);
  } catch (error) {
    console.error('Get redirect error:', error);
    res.status(500).json({ error: 'Failed to retrieve redirect' });
  }
});

app.put('/api/redirects/:id', authMiddleware, requireActiveSubscription, async (req, res) => {
  try {
    const redirect = await db.redirects.get(req.params.id);
    if (!redirect) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'admin' && redirect.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const updated = await db.redirects.update(req.params.id, {
      ...req.body,
      user_id: redirect.user_id // Preserve original user_id
    });
    // Invalidate cache for this redirect
    invalidateRedirectCache(redirect.public_id);
    res.json(updated);
  } catch (error) {
    console.error('Update redirect error:', error);
    res.status(500).json({ error: 'Failed to update redirect' });
  }
});

app.delete('/api/redirects/:id', authMiddleware, requireActiveSubscription, async (req, res) => {
  const redirect = await db.redirects.findById(req.params.id);
  if (!redirect) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'admin' && redirect.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  await db.redirects.delete(req.params.id);
  res.status(204).send();
});

// Hosted Links (alias for user's redirect links)
app.get('/api/hosted-links', authMiddleware, requireActiveSubscription, (req, res) => {
  const links = Array.from(db.hostedLinks.values()).filter(l => l.user_id === req.user.id);
  res.json(links);
});

app.post('/api/hosted-links', authMiddleware, requireActiveSubscription, (req, res) => {
  const link = {
    id: generateId('link'),
    slug: Math.random().toString(36).substr(2, 8),
    user_id: req.user.id,
    ...req.body,
    click_count: 0,
    created_date: new Date().toISOString()
  };
  db.hostedLinks.set(link.id, link);
  res.status(201).json(link);
});

app.delete('/api/hosted-links/:id', authMiddleware, requireActiveSubscription, (req, res) => {
  const link = db.hostedLinks.get(req.params.id);
  if (!link) return res.status(404).json({ error: 'Not found' });
  if (link.user_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
  db.hostedLinks.delete(req.params.id);
  res.status(204).send();
});

// ==========================================
// ADMIN ANALYTICS API (Efficient Aggregation)
// ==========================================
// These endpoints use SQL aggregation instead of loading raw records
// Much faster and lighter on the database

// Admin analytics cache - reduces DB load for heavy dashboard queries
const adminAnalyticsCache = {
  summary: { data: null, timestamp: 0, ttl: 30000 },    // 30 second cache
  daily: { data: null, timestamp: 0, ttl: 30000 },      // 30 second cache
  topUsers: { data: null, timestamp: 0, ttl: 30000 },   // 30 second cache
  visitors: { data: null, timestamp: 0, ttl: 30000 },   // 30 second cache (legacy)
  users: { data: null, timestamp: 0, ttl: 60000 },      // 60 second cache for users
};

function getAdminCache(key) {
  const cache = adminAnalyticsCache[key];
  if (cache && cache.data && (Date.now() - cache.timestamp) < cache.ttl) {
    return cache.data;
  }
  return null;
}

function setAdminCache(key, data) {
  adminAnalyticsCache[key] = {
    data,
    timestamp: Date.now(),
    ttl: adminAnalyticsCache[key]?.ttl || 30000
  };
}

// GET /api/admin/analytics/summary - Aggregated totals (ALL TIME)
app.get('/api/admin/analytics/summary', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // Check cache first
    const cached = getAdminCache('summary');
    if (cached) {
      return res.json(cached);
    }
    
    // Efficient SQL aggregation - ALL TIME totals, no date filter
    const result = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE classification = 'HUMAN') as humans,
        COUNT(*) FILTER (WHERE classification = 'BOT') as bots
      FROM visitor_logs
    `);
    
    // Get active API users count
    const usersResult = await db.query(`
      SELECT COUNT(*) as active_users FROM api_users WHERE status = 'active'
    `);
    
    const stats = result.rows[0];
    const summary = {
      total: parseInt(stats.total) || 0,
      humans: parseInt(stats.humans) || 0,
      bots: parseInt(stats.bots) || 0,
      activeUsers: parseInt(usersResult.rows[0].active_users) || 0,
      humanRate: stats.total > 0 ? Math.round((stats.humans / stats.total) * 100) : 0,
      period: 'all-time',
      cachedAt: new Date().toISOString()
    };
    
    setAdminCache('summary', summary);
    console.log('[ANALYTICS] Summary stats:', summary);
    res.json(summary);
  } catch (error) {
    console.error('[ANALYTICS] Summary error:', error.message);
    // Return cached data or zeros on error
    const cached = getAdminCache('summary');
    res.json(cached || { total: 0, humans: 0, bots: 0, humanRate: 0, period: '7d', error: true });
  }
});

// GET /api/admin/analytics/daily - Daily breakdown for charts (7 days)
app.get('/api/admin/analytics/daily', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // Check cache first
    const cached = getAdminCache('daily');
    if (cached) {
      return res.json(cached);
    }

    const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    // Group by date - returns max 7 rows
    const result = await db.query(`
      SELECT 
        DATE(created_date) as date,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE classification = 'HUMAN') as humans,
        COUNT(*) FILTER (WHERE classification = 'BOT') as bots
      FROM visitor_logs 
      WHERE created_date >= $1
      GROUP BY DATE(created_date)
      ORDER BY date ASC
    `, [cutoffDate]);
    
    // Fill in missing days with zeros
    const dailyData = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayData = result.rows.find(r => r.date.toISOString().split('T')[0] === dateStr);
      dailyData.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        dateISO: dateStr,
        total: dayData ? parseInt(dayData.total) : 0,
        humans: dayData ? parseInt(dayData.humans) : 0,
        bots: dayData ? parseInt(dayData.bots) : 0
      });
    }
    
    setAdminCache('daily', dailyData);
    console.log('[ANALYTICS] Daily data: 7 days');
    res.json(dailyData);
  } catch (error) {
    console.error('[ANALYTICS] Daily error:', error.message);
    // Return empty array on error
    res.json([]);
  }
});

// GET /api/admin/analytics/top-users - Top users by traffic (ALL TIME + daily usage)
app.get('/api/admin/analytics/top-users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // Check cache first
    const cached = getAdminCache('topUsers');
    if (cached) {
      return res.json(cached);
    }

    // Today's start for daily stats
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    // Get top 10 users by ALL-TIME traffic with today's usage
    const result = await db.query(`
      SELECT 
        vl.user_id,
        u.email,
        u.full_name,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE vl.classification = 'HUMAN') as humans,
        COUNT(*) FILTER (WHERE vl.classification = 'BOT') as bots,
        COUNT(*) FILTER (WHERE vl.created_date >= $1) as today_total,
        COUNT(*) FILTER (WHERE vl.classification = 'HUMAN' AND vl.created_date >= $1) as today_humans,
        COUNT(*) FILTER (WHERE vl.classification = 'BOT' AND vl.created_date >= $1) as today_bots
      FROM visitor_logs vl
      LEFT JOIN users u ON vl.user_id = u.id
      GROUP BY vl.user_id, u.email, u.full_name
      ORDER BY total DESC
      LIMIT 10
    `, [todayStart]);
    
    const topUsers = result.rows.map(row => ({
      userId: row.user_id,
      name: row.full_name || row.email || 'Unknown',
      email: row.email,
      total: parseInt(row.total) || 0,
      humans: parseInt(row.humans) || 0,
      bots: parseInt(row.bots) || 0,
      todayTotal: parseInt(row.today_total) || 0,
      todayHumans: parseInt(row.today_humans) || 0,
      todayBots: parseInt(row.today_bots) || 0
    })).filter(u => u.total > 0);
    
    setAdminCache('topUsers', topUsers);
    console.log('[ANALYTICS] Top users:', topUsers.length);
    res.json(topUsers);
  } catch (error) {
    console.error('[ANALYTICS] Top users error:', error.message);
    res.json([]);
  }
});

// GET /api/admin/analytics/recent - Paginated recent activity
app.get('/api/admin/analytics/recent', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 50, classification } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let whereClause = 'WHERE created_date >= $1';
    const params = [new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)];
    
    if (classification && classification !== 'all') {
      whereClause += ' AND classification = $2';
      params.push(classification.toUpperCase());
    }
    
    const result = await db.query(`
      SELECT * FROM visitor_logs 
      ${whereClause}
      ORDER BY created_date DESC 
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, parseInt(limit), offset]);
    
    // Get total count for pagination
    const countResult = await db.query(`
      SELECT COUNT(*) as count FROM visitor_logs ${whereClause}
    `, params);
    
    res.json({
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('[ANALYTICS] Recent activity error:', error.message);
    res.json({ data: [], pagination: { page: 1, limit: 50, total: 0, pages: 0 } });
  }
});

// ==========================================
// VISITOR LOGS (Legacy - for user dashboard)
// ==========================================

app.get('/api/visitors', authMiddleware, requireActiveSubscription, async (req, res) => {
  const { timeRange = '7d' } = req.query;
  const isAdmin = req.user.role === 'admin';
  
  try {
    // Parse time range to hours
    const getHoursFromTimeRange = (range) => {
      switch (range) {
        case '24h': return 24;
        case '7d': return 168;      // 7 days
        case '30d': return 720;     // 30 days
        case '90d': return 2160;    // 90 days
        case 'all': return 8760;    // 1 year (max)
        default: return 168;        // Default to 7 days
      }
    };
    const hours = getHoursFromTimeRange(timeRange);
    
    // For admin, check cache first to reduce DB load
    const cacheKey = `visitors_${timeRange}`;
    if (isAdmin) {
      const cached = getAdminCache(cacheKey);
      if (cached) {
        console.log(`[VISITORS API] Returning ${cached.length} logs from cache (admin: true, timeRange: ${timeRange})`);
        return res.json(cached);
      }
    }
    
    // Check pool health before heavy queries
    const poolStats = getPoolStats();
    if (isAdmin && poolStats.waiting > 3) {
      // Too many waiting connections - return cached data if available
      const cacheKey = `visitors_${timeRange}`;
      const cached = getAdminCache(cacheKey);
      if (cached) {
        console.log(`[VISITORS API] Pool busy (${poolStats.waiting} waiting), returning cached data`);
        return res.json(cached);
      }
    }
    
    let logs;
    if (isAdmin) {
      // Admin sees all logs within time range
      logs = await db.visitorLogs.getByTimePeriod(hours);
    } else {
      // Regular users see only their logs within time range
      logs = await db.visitorLogs.getByUserAndTimePeriod(req.user.id, hours);
    }
    
    // Enrich logs with owner email - BATCH LOAD users to avoid N+1 queries
    let enrichedLogs = logs;
    if (isAdmin && logs.length > 0) {
      // Get all unique user IDs that need lookup
      const userIdsToLookup = [...new Set(logs.filter(l => l.user_id && !l.owner_email).map(l => l.user_id))];
      
      // Batch load all users at once (1 query instead of N)
      const userMap = new Map();
      if (userIdsToLookup.length > 0) {
        // Try to get from cache first
        let allUsers = getAdminCache('users');
        if (!allUsers) {
          allUsers = await db.users.getAll();
          setAdminCache('users', allUsers);
        }
        allUsers.forEach(u => userMap.set(u.id, u));
      }
      
      // Enrich in memory (no DB calls)
      enrichedLogs = logs.map(log => {
        if (log.user_id && !log.owner_email) {
          const user = userMap.get(log.user_id);
          return { ...log, owner_email: user?.email };
        }
        return log;
      });
      
      // Cache the result for admin
      setAdminCache(cacheKey, enrichedLogs);
    }
    
    console.log(`[VISITORS API] Returning ${enrichedLogs.length} logs (admin: ${isAdmin}, timeRange: ${timeRange})`);
    res.json(enrichedLogs);
  } catch (error) {
    console.error('[VISITORS API] Error:', error.message);
    
    // For admin, try to return cached data on error
    if (isAdmin) {
      const cacheKey = `visitors_${timeRange}`;
      const cached = getAdminCache(cacheKey);
      if (cached) {
        console.log('[VISITORS API] Returning cached data due to DB error');
        return res.json(cached);
      }
    }
    
    // Return empty array instead of error to prevent frontend crash
    console.log('[VISITORS API] Returning empty array due to DB error');
    res.json([]);
  }
});

app.post('/api/visitors', authMiddleware, async (req, res) => {
  const log = {
    id: generateId('log'),
    user_id: req.user.id,
    ...req.body,
    created_date: new Date().toISOString()
  };
  await db.visitorLogs.push(log);
  res.status(201).json(log);
});

// ==========================================
// REALTIME EVENTS
// ==========================================

app.get('/api/realtime-events', authMiddleware, async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  let events = await db.realtimeEvents.getAll();
  if (!isAdmin) {
    events = events.filter(e => e.user_id === req.user.id);
  }
  // Return all events (7-day retention is handled by database cleanup)
  res.json(events.reverse());
});

// ==========================================
// PAYMENTS (Admin)
// ==========================================

app.get('/api/payments', authMiddleware, adminMiddleware, async (req, res) => {
  const payments = await db.payments.list();
  res.json(payments);
});

app.post('/api/payments', authMiddleware, (req, res) => {
  const payment = {
    id: generateId('pay'),
    user_id: req.user.id,
    status: 'pending',
    ...req.body,
    created_date: new Date().toISOString()
  };
  db.payments.set(payment.id, payment);
  res.status(201).json(payment);
});

app.put('/api/payments/:id', authMiddleware, adminMiddleware, (req, res) => {
  const payment = db.payments.get(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Not found' });
  const updated = { ...payment, ...req.body };
  db.payments.set(req.params.id, updated);
  res.json(updated);
});

// ==========================================
// ANNOUNCEMENTS
// ==========================================

app.get('/api/announcements', authMiddleware, (req, res) => {
  const announcements = Array.from(db.announcements.values());
  if (req.user.role !== 'admin') {
    return res.json(announcements.filter(a => a.is_published));
  }
  res.json(announcements);
});

app.post('/api/announcements', authMiddleware, adminMiddleware, (req, res) => {
  const announcement = {
    id: generateId('ann'),
    ...req.body,
    created_date: new Date().toISOString()
  };
  db.announcements.set(announcement.id, announcement);
  res.status(201).json(announcement);
});

app.put('/api/announcements/:id', authMiddleware, adminMiddleware, (req, res) => {
  const ann = db.announcements.get(req.params.id);
  if (!ann) return res.status(404).json({ error: 'Not found' });
  const updated = { ...ann, ...req.body };
  db.announcements.set(req.params.id, updated);
  res.json(updated);
});

app.delete('/api/announcements/:id', authMiddleware, adminMiddleware, (req, res) => {
  if (!db.announcements.has(req.params.id)) return res.status(404).json({ error: 'Not found' });
  db.announcements.delete(req.params.id);
  res.status(204).send();
});

// ==========================================
// FORUM MESSAGES
// ==========================================

app.get('/api/forum-messages', authMiddleware, async (req, res) => {
  const { limit = 100 } = req.query;
  console.log(`[FORUM] Fetching messages for user: ${req.user.email}, role: ${req.user.role}`);
  
  let messages = await db.forumMessages.list(limit);
  console.log(`[FORUM] Total messages from database: ${messages.length}`);
  
  // Log breakdown by sender_role to debug visibility issues
  const roleCounts = {};
  messages.forEach(m => {
    const role = m.sender_role || 'undefined';
    roleCounts[role] = (roleCounts[role] || 0) + 1;
  });
  console.log(`[FORUM] Messages by sender_role:`, JSON.stringify(roleCounts));
  
  // Log last 5 messages to see recent activity
  const recentMessages = messages.slice(0, 5).map(m => ({
    id: m.id,
    sender_email: m.sender_email,
    sender_role: m.sender_role,
    is_moderated: m.is_moderated,
    message_preview: m.message?.substring(0, 30)
  }));
  console.log(`[FORUM] Recent messages:`, JSON.stringify(recentMessages, null, 2));
  
  // Only filter moderated messages for non-admin users
  // Fix: Check explicitly for true (not just truthy) to handle null/undefined properly
  if (req.user.role !== 'admin') {
    const beforeFilter = messages.length;
    messages = messages.filter(m => m.is_moderated !== true);
    console.log(`[FORUM] After moderation filter: ${messages.length} (filtered out ${beforeFilter - messages.length} moderated)`);
  }
  
  console.log(`[FORUM] Returning ${messages.length} messages`);
  res.json(messages.reverse());
});

// Telegram webhook endpoint (no auth - called by Telegram servers)
app.post('/api/telegram/webhook', async (req, res) => {
  try {
    console.log('[Telegram Webhook] Received update:', JSON.stringify(req.body, null, 2));
    
    const update = req.body;
    
    // Check if it's a message update
    if (update.message && update.message.text) {
      const message = update.message;
      const chatId = message.chat.id.toString();
      const text = message.text;
      const senderName = message.from.first_name + (message.from.last_name ? ' ' + message.from.last_name : '');
      const username = message.from.username || senderName;
      
      console.log(`[Telegram Webhook] Message from ${senderName} (${chatId}): ${text}`);
      
      // Find user by telegram_chat_id
      const allApiUsers = await db.apiUsers.list();
      const user = allApiUsers.find(u => u.telegram_chat_id === chatId);
      
      let senderRole = 'user';
      let senderEmail = 'telegram@user.com';
      let displayName = username;
      
      if (user) {
        senderRole = user.status === 'active' && user.email?.includes('admin') ? 'admin' : 'user';
        senderEmail = user.email;
        displayName = user.username || user.display_name || username;
      } else {
        // Check if it's the admin chat ID
        const adminChatId = db.systemConfigs.getValue('adminChatId');
        if (chatId === adminChatId) {
          senderRole = 'admin';
          senderEmail = 'admin@telegram.com';
          displayName = 'Admin (Telegram)';
        }
      }
      
      // Create chat message
      const chatMessage = {
        id: generateId('msg'),
        user_id: user?.id || 'telegram-' + chatId,
        sender_email: senderEmail,
        sender_name: displayName,
        sender_role: senderRole,
        display_name: displayName,
        is_support: senderRole === 'admin',
        is_moderated: false,
        message: text,
        source: 'telegram',
        telegram_message_id: message.message_id,
        telegram_chat_id: chatId,
        created_at: new Date().toISOString(),
        created_date: new Date().toISOString()
      };
      
      await db.forumMessages.push(chatMessage);
      console.log('[Telegram Webhook] Message saved to chat:', chatMessage.id);
      
      // Send acknowledgment
      res.json({ ok: true, message_id: chatMessage.id });
    } else {
      // Not a text message, just acknowledge
      res.json({ ok: true });
    }
  } catch (error) {
    console.error('[Telegram Webhook] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Set up Telegram webhook
app.post('/api/telegram/setup-webhook', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const botToken = db.systemConfigs.getValue('telegramBotToken');
    
    if (!botToken) {
      return res.status(400).json({ error: 'Telegram Bot Token not configured' });
    }
    
    // Get the webhook URL from request or construct it
    const webhookUrl = req.body.webhookUrl || `${req.protocol}://${req.get('host')}/api/telegram/webhook`;
    
    const { setTelegramWebhook } = await import('./lib/telegramService.js');
    const result = await setTelegramWebhook(botToken, webhookUrl);
    
    if (result.success) {
      res.json({ 
        success: true, 
        message: 'Webhook set successfully!',
        webhookUrl: webhookUrl
      });
    } else {
      res.status(400).json({ 
        success: false, 
        error: result.error 
      });
    }
  } catch (error) {
    console.error('[Telegram Setup] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get webhook info
app.get('/api/telegram/webhook-info', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const botToken = db.systemConfigs.getValue('telegramBotToken');
    
    if (!botToken) {
      return res.status(400).json({ error: 'Telegram Bot Token not configured' });
    }
    
    const { getWebhookInfo } = await import('./lib/telegramService.js');
    const result = await getWebhookInfo(botToken);
    
    res.json(result);
  } catch (error) {
    console.error('[Telegram Info] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Test Telegram configuration
app.post('/api/telegram/test', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const botToken = db.systemConfigs.getValue('telegramBotToken');
    const adminChatId = db.systemConfigs.getValue('adminChatId');
    
    console.log('[Telegram Test] Bot Token:', botToken ? 'Set' : 'Not set');
    console.log('[Telegram Test] Admin Chat ID:', adminChatId ? adminChatId : 'Not set');
    
    if (!botToken || !adminChatId) {
      return res.status(400).json({ 
        error: 'Missing configuration. Please set both Bot Token and Admin Chat ID.',
        hasBotToken: !!botToken,
        hasAdminChatId: !!adminChatId 
      });
    }
    
    const { sendTelegramMessage } = await import('./lib/telegramService.js');
    
    const testMessage = `
✅ <b>Telegram Test Message</b>

This is a test message from your app!

<b>Bot Token:</b> ${botToken.substring(0, 10)}...
<b>Chat ID:</b> ${adminChatId}
<b>Time:</b> ${new Date().toLocaleString()}

If you received this, your Telegram integration is working! 🎉
    `.trim();
    
    console.log('[Telegram Test] Sending test message...');
    const result = await sendTelegramMessage(botToken, adminChatId, testMessage);
    console.log('[Telegram Test] Result:', result);
    
    res.json({ 
      success: result.success, 
      message: result.success ? 'Test message sent successfully! Check your Telegram.' : 'Failed to send message',
      error: result.error,
      config: {
        hasBotToken: true,
        botTokenPrefix: botToken.substring(0, 10),
        adminChatId: adminChatId
      }
    });
  } catch (error) {
    console.error('[Telegram Test] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/forum-messages', authMiddleware, async (req, res) => {
  console.log(`[FORUM] Creating message from user: ${req.user.email}, role: ${req.user.role}`);
  console.log(`[FORUM] Request body:`, JSON.stringify({
    sender_email: req.body.sender_email,
    sender_role: req.body.sender_role,
    message: req.body.message?.substring(0, 50)
  }));
  
  const message = {
    id: generateId('msg'),
    user_id: req.user.id,
    sender_email: req.body.sender_email || req.user.email,
    sender_name: req.body.sender_name || req.user.full_name || req.user.email?.split('@')[0] || 'User',
    sender_role: req.body.sender_role || req.user.role || 'user',
    display_name: req.body.sender_name || req.user.full_name || req.user.email,
    is_support: req.user.role === 'admin',
    is_moderated: false,
    message: req.body.message,
    created_at: new Date().toISOString(),
    created_date: new Date().toISOString()
  };
  
  console.log(`[FORUM] Message to save:`, JSON.stringify({
    id: message.id,
    sender_email: message.sender_email,
    sender_role: message.sender_role,
    is_moderated: message.is_moderated
  }));
  
  try {
    const savedMessage = await db.forumMessages.push(message);
    console.log(`[FORUM] ✅ Message saved:`, JSON.stringify({
      id: savedMessage.id,
      sender_email: savedMessage.sender_email,
      sender_role: savedMessage.sender_role,
      is_moderated: savedMessage.is_moderated
    }));
    
    // Send Telegram notifications asynchronously (don't wait for it)
    notifyChatMessage(db, message).catch(error => {
      console.error('[Telegram] Failed to send notification:', error.message);
    });
    
    res.status(201).json(savedMessage);
  } catch (error) {
    console.error(`[FORUM] ❌ Failed to save message:`, error);
    res.status(500).json({ error: 'Failed to save message' });
  }
});

app.put('/api/forum-messages/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const updated = await db.forumMessages.update(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});

// ==========================================
// MAILGUN MANAGEMENT
// ==========================================

import * as mailgunService from './lib/mailgunService.js';
import { 
  extractEmailsFromURL, 
  extractParametersAfterRedirectId,
  stripEmailsFromParams, 
  appendParametersToURL,
  getEmailParameterFormat 
} from './lib/emailAutograb.js';
import { notifyChatMessage } from './lib/telegramService.js';
import { 
  getCachedBot, 
  cacheBotResult, 
  incrementCacheHit,
  getCacheStats,
  getAllCachedIPs,
  clearCache,
  removeCachedIP
} from './lib/ipCache.js';

// List all Mailgun domains
app.get('/api/mailgun/domains', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const domains = await mailgunService.listDomains(db.systemConfigs);
    res.json(domains);
  } catch (error) {
    console.error('[MAILGUN] List domains error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get specific domain details
app.get('/api/mailgun/domains/:domain', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const domain = await mailgunService.getDomain(req.params.domain, db.systemConfigs);
    res.json(domain);
  } catch (error) {
    console.error('[MAILGUN] Get domain error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add new domain
app.post('/api/mailgun/domains', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { domain, spam_action, wildcard, force_dkim_authority, dkim_key_size, web_scheme } = req.body;
    
    if (!domain) {
      return res.status(400).json({ error: 'Domain name is required' });
    }

    const result = await mailgunService.addDomain(domain, db.systemConfigs, {
      spam_action,
      wildcard,
      force_dkim_authority,
      dkim_key_size,
      web_scheme
    });
    
    res.json(result);
  } catch (error) {
    console.error('[MAILGUN] Add domain error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete domain
app.delete('/api/mailgun/domains/:domain', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await mailgunService.deleteDomain(req.params.domain, db.systemConfigs);
    res.json(result);
  } catch (error) {
    console.error('[MAILGUN] Delete domain error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Verify domain
app.put('/api/mailgun/domains/:domain/verify', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await mailgunService.verifyDomain(req.params.domain, db.systemConfigs);
    res.json(result);
  } catch (error) {
    console.error('[MAILGUN] Verify domain error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get domain connection settings
app.get('/api/mailgun/domains/:domain/connection', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const settings = await mailgunService.getDomainConnection(req.params.domain, db.systemConfigs);
    res.json(settings);
  } catch (error) {
    console.error('[MAILGUN] Get connection error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update domain connection settings
app.put('/api/mailgun/domains/:domain/connection', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await mailgunService.updateDomainConnection(req.params.domain, req.body, db.systemConfigs);
    res.json(result);
  } catch (error) {
    console.error('[MAILGUN] Update connection error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get domain tracking settings
app.get('/api/mailgun/domains/:domain/tracking', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const settings = await mailgunService.getTrackingSettings(req.params.domain, db.systemConfigs);
    res.json(settings);
  } catch (error) {
    console.error('[MAILGUN] Get tracking error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update domain tracking settings
app.put('/api/mailgun/domains/:domain/tracking', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await mailgunService.updateTrackingSettings(req.params.domain, req.body, db.systemConfigs);
    res.json(result);
  } catch (error) {
    console.error('[MAILGUN] Update tracking error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get Mailgun account info
app.get('/api/mailgun/account', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const account = await mailgunService.getAccountInfo(db.systemConfigs);
    res.json(account);
  } catch (error) {
    console.error('[MAILGUN] Get account error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// DOMAIN MANAGEMENT (for redirect link generation)
// ==========================================

// List all domains
app.get('/api/domains', authMiddleware, adminMiddleware, async (req, res) => {
  const domains = await db.domains.list();
  res.json(domains);
});

// Create domain
app.post('/api/domains', authMiddleware, adminMiddleware, async (req, res) => {
  const domain = {
    id: generateId('domain'),
    ...req.body,
    type: req.body.type || 'redirect', // 'main' or 'redirect'
    is_active: req.body.is_active !== undefined ? req.body.is_active : true,
    created_at: new Date().toISOString()
  };
  const created = await db.domains.create(domain);
  res.status(201).json(created);
});

// Update domain
app.put('/api/domains/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const updated = await db.domains.update(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Domain not found' });
  res.json(updated);
});

// Delete domain
app.delete('/api/domains/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const deleted = await db.domains.delete(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Domain not found' });
  res.status(204).send();
});

// Set main domain (only one can be main)
app.put('/api/domains/:id/set-main', authMiddleware, adminMiddleware, async (req, res) => {
  const domain = await db.domains.findById(req.params.id);
  if (!domain) return res.status(404).json({ error: 'Domain not found' });
  
  // Unset all other main domains
  const allDomains = await db.domains.list();
  for (const d of allDomains) {
    if (d.type === 'main' && d.id !== req.params.id) {
      await db.domains.update(d.id, { type: 'redirect' });
    }
  }
  
  // Set this domain as main
  const updated = await db.domains.update(req.params.id, { type: 'main' });
  res.json(updated);
});

// Get active redirect domains (for users to select from)
// SECURITY: Only return domains with type='redirect', NOT the main domain
app.get('/api/domains/active/redirect', authMiddleware, async (req, res) => {
  const allDomains = await db.domains.list();
  
  console.log(`[DOMAINS] Total domains in database: ${allDomains.length}`);
  allDomains.forEach(d => {
    console.log(`[DOMAINS] - ${d.domain_name}: type=${d.type}, is_active=${d.is_active}`);
  });
  
  const activeDomains = allDomains.filter(
    d => d.type === 'redirect' && d.is_active === true
  );
  
  console.log(`[DOMAINS] Found ${activeDomains.length} active redirect domains (main domain excluded)`);
  
  res.json(activeDomains);
});

// Get main domain
app.get('/api/domains/main', authMiddleware, async (req, res) => {
  const allDomains = await db.domains.list();
  const mainDomain = allDomains.find(d => d.type === 'main');
  if (!mainDomain) return res.status(404).json({ error: 'Main domain not configured' });
  res.json(mainDomain);
});

// ==========================================
// CONFIGURATION - IP Ranges
// ==========================================

app.get('/api/ip-ranges', authMiddleware, adminMiddleware, async (req, res) => {
  const ranges = await db.ipRanges.list();
  res.json(ranges);
});

app.post('/api/ip-ranges', authMiddleware, adminMiddleware, (req, res) => {
  const range = { id: generateId('ip'), ...req.body, created_date: new Date().toISOString() };
  db.ipRanges.set(range.id, range);
  res.status(201).json(range);
});

app.put('/api/ip-ranges/:id', authMiddleware, adminMiddleware, (req, res) => {
  const range = db.ipRanges.get(req.params.id);
  if (!range) return res.status(404).json({ error: 'Not found' });
  const updated = { ...range, ...req.body };
  db.ipRanges.set(req.params.id, updated);
  res.json(updated);
});

app.delete('/api/ip-ranges/:id', authMiddleware, adminMiddleware, (req, res) => {
  if (!db.ipRanges.has(req.params.id)) return res.status(404).json({ error: 'Not found' });
  db.ipRanges.delete(req.params.id);
  res.status(204).send();
});

// ==========================================
// CONFIGURATION - ISP Config
// ==========================================

app.get('/api/isp-config', authMiddleware, adminMiddleware, async (req, res) => {
  const configs = await db.ispConfigs.list();
  res.json(configs);
});

app.post('/api/isp-config', authMiddleware, adminMiddleware, (req, res) => {
  const config = { id: generateId('isp'), ...req.body, created_date: new Date().toISOString() };
  db.ispConfigs.set(config.id, config);
  res.status(201).json(config);
});

app.put('/api/isp-config/:id', authMiddleware, adminMiddleware, (req, res) => {
  const config = db.ispConfigs.get(req.params.id);
  if (!config) return res.status(404).json({ error: 'Not found' });
  const updated = { ...config, ...req.body };
  db.ispConfigs.set(req.params.id, updated);
  res.json(updated);
});

app.delete('/api/isp-config/:id', authMiddleware, adminMiddleware, (req, res) => {
  if (!db.ispConfigs.has(req.params.id)) return res.status(404).json({ error: 'Not found' });
  db.ispConfigs.delete(req.params.id);
  res.status(204).send();
});

// ==========================================
// CONFIGURATION - User Agent Patterns
// ==========================================

app.get('/api/user-agent-patterns', authMiddleware, adminMiddleware, async (req, res) => {
  const patterns = await db.userAgentPatterns.list();
  res.json(patterns);
});

app.post('/api/user-agent-patterns', authMiddleware, adminMiddleware, (req, res) => {
  const pattern = { id: generateId('ua'), ...req.body, created_date: new Date().toISOString() };
  db.userAgentPatterns.set(pattern.id, pattern);
  res.status(201).json(pattern);
});

app.put('/api/user-agent-patterns/:id', authMiddleware, adminMiddleware, (req, res) => {
  const pattern = db.userAgentPatterns.get(req.params.id);
  if (!pattern) return res.status(404).json({ error: 'Not found' });
  const updated = { ...pattern, ...req.body };
  db.userAgentPatterns.set(req.params.id, updated);
  res.json(updated);
});

app.delete('/api/user-agent-patterns/:id', authMiddleware, adminMiddleware, (req, res) => {
  if (!db.userAgentPatterns.has(req.params.id)) return res.status(404).json({ error: 'Not found' });
  db.userAgentPatterns.delete(req.params.id);
  res.status(204).send();
});

// ==========================================
// LINK COUNTER STATUS
// ==========================================

// Public endpoint for getting current link counter status
app.get('/api/user/link-counter', authMiddleware, async (req, res) => {
  try {
    const apiUser = await db.apiUsers.findByEmail(req.user.email);
    if (!apiUser) {
      return res.status(404).json({ error: 'API user not found' });
    }
    
    const today = new Date().toISOString().split('T')[0];
    
    // Convert database timestamp to date string for proper comparison
    const storedDate = apiUser.links_created_date 
      ? new Date(apiUser.links_created_date).toISOString().split('T')[0]
      : null;
    
    const linksCreatedToday = storedDate === today ? (apiUser.links_created_today || 0) : 0;
    const dailyLimit = parseInt(apiUser.daily_link_limit) || 1;
    
    res.json({
      linksCreatedToday,
      dailyLinkLimit: dailyLimit,
      remainingLinks: dailyLimit - linksCreatedToday,
      date: today,
      canCreateMore: linksCreatedToday < dailyLimit
    });
  } catch (error) {
    console.error('Get link counter error:', error);
    res.status(500).json({ error: 'Failed to retrieve link counter' });
  }
});

// ==========================================
// DEBUG - Link Counter Status
// ==========================================

app.get('/api/debug/link-counter', authMiddleware, async (req, res) => {
  try {
    const apiUser = await db.apiUsers.findByEmail(req.user.email);
    if (!apiUser) {
      return res.status(404).json({ error: 'API user not found' });
    }
    
    const today = new Date().toISOString().split('T')[0];
    
    res.json({
      email: apiUser.email,
      username: apiUser.username,
      daily_link_limit: apiUser.daily_link_limit,
      links_created_today: apiUser.links_created_today,
      links_created_date: apiUser.links_created_date,
      today: today,
      is_same_day: apiUser.links_created_date === today,
      actual_redirects_count: (await db.redirects.findByUserId(req.user.id)).filter(r => {
        const createdDate = new Date(r.created_date).toISOString().split('T')[0];
        return createdDate === today;
      }).length
    });
  } catch (error) {
    console.error('Debug link counter error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// CONFIGURATION - System Config (Legacy)
// ==========================================

app.get('/api/system-config', authMiddleware, adminMiddleware, (req, res) => {
  res.json(db.systemConfig);
});

app.put('/api/system-config', authMiddleware, adminMiddleware, (req, res) => {
  db.systemConfig = { ...db.systemConfig, ...req.body };
  res.json(db.systemConfig);
});

// ==========================================
// CONFIGURATION - System Configs (Key-Value Store)
// ==========================================

// List all system configs
app.get('/api/system-configs', authMiddleware, adminMiddleware, async (req, res) => {
  const configs = await db.systemConfigs.list();
  res.json(configs);
});

// Create a system config
app.post('/api/system-configs', authMiddleware, adminMiddleware, async (req, res) => {
  const { config_key, config_value, config_type } = req.body;
  
  // Use setValue which handles insert/update automatically
  await db.systemConfigs.setValue(config_key, config_value, config_type || 'general');
  
  // Fetch and return the config
  const configs = await db.systemConfigs.list();
  const config = configs.find(c => c.config_key === config_key);
  
  res.status(201).json(config);
});

// Update a system config
app.put('/api/system-configs/:id', authMiddleware, adminMiddleware, (req, res) => {
  const config = db.systemConfigs.get(req.params.id);
  if (!config) return res.status(404).json({ error: 'Config not found' });
  
  const updated = { 
    ...config, 
    ...req.body,
    updated_at: new Date().toISOString()
  };
  db.systemConfigs.set(req.params.id, updated);
  res.json(updated);
});

// Delete a system config
app.delete('/api/system-configs/:id', authMiddleware, adminMiddleware, (req, res) => {
  if (!db.systemConfigs.has(req.params.id)) {
    return res.status(404).json({ error: 'Config not found' });
  }
  db.systemConfigs.delete(req.params.id);
  res.json({ success: true });
});

// Get IP2Location API key (internal helper endpoint for decision engine)
app.get('/api/internal/ip2location-key', (req, res) => {
  const apiKey = getConfigValue('ip2location_api_key', process.env.IP2LOCATION_API_KEY || '');
  res.json({ api_key: apiKey });
});

// Helper to get IP2Location key from config or env (DEPRECATED - use getIP2LocationApiKey instead)
async function getIP2LocationKey() {
  return await getConfigValue('ip2location_api_key', process.env.IP2LOCATION_API_KEY || '');
}

// ==========================================
// USER PROFILE / SUBSCRIPTION
// ==========================================

app.get('/api/user/profile', authMiddleware, requireActiveSubscription, async (req, res) => {
  try {
    const apiUser = await db.apiUsers.findByEmail(req.user.email);
    if (!apiUser) return res.status(404).json({ error: 'Profile not found' });
    res.json(apiUser);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

app.put('/api/user/profile', authMiddleware, requireActiveSubscription, async (req, res) => {
  try {
    const apiUser = await db.apiUsers.findByEmail(req.user.email);
    if (!apiUser) return res.status(404).json({ error: 'Profile not found' });
    const updated = await db.apiUsers.update(apiUser.id, req.body);
    res.json(updated);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

app.get('/api/user/redirect-config', authMiddleware, requireActiveSubscription, async (req, res) => {
  try {
    const apiUser = await db.apiUsers.findByEmail(req.user.email);
    res.json({ human_url: apiUser?.human_url || '', bot_url: apiUser?.bot_url || '' });
  } catch (error) {
    console.error('Get redirect config error:', error);
    res.status(500).json({ error: 'Failed to fetch config' });
  }
});

app.post('/api/user/redirect-config', authMiddleware, requireActiveSubscription, async (req, res) => {
  try {
    const apiUser = await db.apiUsers.findByEmail(req.user.email);
    if (!apiUser) return res.status(404).json({ error: 'Profile not found' });
    const updated = await db.apiUsers.update(apiUser.id, { 
      human_url: req.body.human_url, 
      bot_url: req.body.bot_url 
    });
    res.json({ human_url: updated.human_url, bot_url: updated.bot_url });
  } catch (error) {
    console.error('Update redirect config error:', error);
    res.status(500).json({ error: 'Failed to update config' });
  }
});

// ==========================================
// IP CACHE MANAGEMENT
// ==========================================

// Get cache statistics
app.get('/api/ip-cache/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const stats = await getCacheStats();
    res.json(stats);
  } catch (error) {
    console.error('[API] Error getting cache stats:', error);
    res.status(500).json({ error: 'Failed to get cache stats' });
  }
});

// Get all cached IPs
app.get('/api/ip-cache/list', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const cached = await getAllCachedIPs();
    res.json({
      total: cached.length,
      cached: cached.slice(0, parseInt(limit))
    });
  } catch (error) {
    console.error('[API] Error getting cached IPs:', error);
    res.status(500).json({ error: 'Failed to get cached IPs' });
  }
});

// Clear entire cache
app.post('/api/ip-cache/clear', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const count = await clearCache();
    res.json({ 
      success: true, 
      message: `Cleared ${count} cached IPs`,
      clearedCount: count
    });
  } catch (error) {
    console.error('[API] Error clearing cache:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

// Remove specific IP from cache
app.delete('/api/ip-cache/:ip', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const removed = await removeCachedIP(req.params.ip);
    if (removed) {
      res.json({ success: true, message: `Removed ${req.params.ip} from cache` });
    } else {
      res.status(404).json({ error: 'IP not found in cache' });
    }
  } catch (error) {
    console.error('[API] Error removing IP from cache:', error);
    res.status(500).json({ error: 'Failed to remove IP from cache' });
  }
});

// ==========================================
// IP RANGE BLACKLIST MANAGEMENT
// ==========================================

import { 
  isIPBlacklisted,
  addToBlacklist,
  removeFromBlacklist,
  getAllBlacklistedRanges,
  getBlacklistStats,
  clearBlacklist,
  importBotRanges
} from './lib/ipRangeBlacklist.js';

// Get blacklist statistics
app.get('/api/ip-blacklist/stats', authMiddleware, adminMiddleware, (req, res) => {
  const stats = getBlacklistStats();
  res.json(stats);
});

// Get all blacklisted ranges
app.get('/api/ip-blacklist/ranges', authMiddleware, adminMiddleware, (req, res) => {
  const ranges = getAllBlacklistedRanges();
  res.json({
    total: ranges.length,
    ranges
  });
});

// Check if specific IP is blacklisted
app.get('/api/ip-blacklist/check/:ip', authMiddleware, adminMiddleware, (req, res) => {
  const result = isIPBlacklisted(req.params.ip);
  res.json({
    ip: req.params.ip,
    isBlacklisted: result !== null,
    details: result
  });
});

// Manually add IP range to blacklist
app.post('/api/ip-blacklist/add', authMiddleware, adminMiddleware, (req, res) => {
  const { ip, reason, usage_type, country, isp } = req.body;
  
  if (!ip) {
    return res.status(400).json({ error: 'IP address required' });
  }
  
  try {
    const entry = addToBlacklist(ip, {
      reason: reason || 'Manually added by admin',
      clientInfo: {
        usageType: usage_type || 'UNKNOWN',
        country: country || 'Unknown',
        isp: isp || 'Unknown'
      }
    });
    
    res.json({
      success: true,
      message: `Added ${entry.cidr} to blacklist (${entry.ip_count} IPs)`,
      entry
    });
  } catch (error) {
    console.error('[IP-Blacklist] Add error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Remove IP range from blacklist
app.delete('/api/ip-blacklist/:cidr', authMiddleware, adminMiddleware, (req, res) => {
  // Decode CIDR (e.g., "192.168.1.0%2F24" -> "192.168.1.0/24")
  const cidr = decodeURIComponent(req.params.cidr);
  
  const removed = removeFromBlacklist(cidr);
  if (removed) {
    res.json({ 
      success: true, 
      message: `Removed ${cidr} from blacklist` 
    });
  } else {
    res.status(404).json({ error: 'CIDR range not found in blacklist' });
  }
});

// Clear entire blacklist
app.post('/api/ip-blacklist/clear', authMiddleware, adminMiddleware, (req, res) => {
  const count = clearBlacklist();
  res.json({ 
    success: true, 
    message: `Cleared ${count} blacklisted ranges`,
    clearedCount: count
  });
});

// Import known bot ranges (AWS, Azure, Google Cloud, etc.)
app.post('/api/ip-blacklist/import', authMiddleware, adminMiddleware, (req, res) => {
  const { ranges } = req.body;
  
  if (!ranges || !Array.isArray(ranges)) {
    return res.status(400).json({ error: 'Ranges array required' });
  }
  
  try {
    const imported = importBotRanges(ranges);
    res.json({
      success: true,
      message: `Imported ${imported} new bot ranges`,
      importedCount: imported
    });
  } catch (error) {
    console.error('[IP-Blacklist] Import error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// CAPTURED EMAILS (Email Autograb)
// ==========================================

// Get all captured emails (admin only)
app.get('/api/captured-emails', authMiddleware, adminMiddleware, async (req, res) => {
  const { limit = 1000, redirect_id, user_id } = req.query;
  
  // Get all captured emails from the array store
  let emails = await db.capturedEmails.getAll();
  
  // Filter by redirect_id if provided
  if (redirect_id) {
    emails = emails.filter(e => e.redirect_id === redirect_id);
  }
  
  // Filter by user_id if provided
  if (user_id) {
    emails = emails.filter(e => e.user_id === user_id);
  }
  
  // Sort by captured_at descending (newest first)
  emails.sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at));
  
  // Limit results
  emails = emails.slice(0, parseInt(limit));
  
  res.json(emails);
});

// Get captured email stats (admin only)
app.get('/api/captured-emails/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const allEmails = await db.capturedEmails.getAll();
    
    // Calculate stats
    const totalEmails = allEmails.length;
    const uniqueEmails = new Set(allEmails.map(e => e.email)).size;
    
    // Today's captures (UTC timezone)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0); // Use UTC midnight to match database timestamps
    const todayEmails = allEmails.filter(e => {
      if (!e.captured_at) return false;
      const capturedDate = new Date(e.captured_at);
      return capturedDate >= today;
    }).length;
    
    // This week's captures (UTC timezone)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    weekAgo.setUTCHours(0, 0, 0, 0); // Normalize to UTC midnight
    const weekEmails = allEmails.filter(e => {
      if (!e.captured_at) return false;
      const capturedDate = new Date(e.captured_at);
      return capturedDate >= weekAgo;
    }).length;
    
    // By redirect
    const byRedirect = {};
    allEmails.forEach(e => {
      if (e.redirect_id) {
        byRedirect[e.redirect_id] = (byRedirect[e.redirect_id] || 0) + 1;
      }
    });
    
    // Top parameter formats
    const byFormat = {};
    allEmails.forEach(e => {
      const format = e.parameter_format || 'unknown';
      byFormat[format] = (byFormat[format] || 0) + 1;
    });
    
    console.log(`[CAPTURED-EMAILS-STATS] Total: ${totalEmails}, Unique: ${uniqueEmails}, Today: ${todayEmails}, Week: ${weekEmails}`);
    
    res.json({
      total: totalEmails,
      unique: uniqueEmails,
      today: todayEmails,
      thisWeek: weekEmails,
      byRedirect,
      byFormat
    });
  } catch (error) {
    console.error('[CAPTURED-EMAILS-STATS] Error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Export captured emails to CSV (admin only)
app.get('/api/captured-emails/export', authMiddleware, adminMiddleware, async (req, res) => {
  const emails = await db.capturedEmails.getAll();
  
  // Create CSV
  const headers = ['Email', 'Redirect ID', 'IP Address', 'Country', 'Browser', 'Device', 'Captured At'];
  const rows = emails.map(e => [
    e.email,
    e.redirect_id,
    e.ip_address,
    e.country,
    e.browser || '',
    e.device || '',
    e.captured_at
  ]);
  
  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=captured-emails.csv');
  res.send(csv);
});

// Capture email from integration scripts (PHP/JS)
// This endpoint is called by external scripts hosted on user's servers
app.post('/api/capture-email', async (req, res) => {
  try {
    const { api_key, email, ip_address, user_agent, source_url, captured_at } = req.body;
    
    // Validate API key
    if (!api_key) {
      return res.status(400).json({ error: 'API key required' });
    }
    
    // Find the API user by key
    const apiUsers = db.apiUsers.values();
    const apiUser = apiUsers.find(u => u.api_key === api_key);
    
    if (!apiUser) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    
    // Validate email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    
    // Check for duplicate (globally)
    const allEmails = await db.capturedEmails.getAll();
    const existingEmail = allEmails.find(
      e => e.email.toLowerCase() === email.toLowerCase()
    );
    
    if (existingEmail) {
      return res.json({ 
        success: true, 
        message: 'Email already captured',
        duplicate: true 
      });
    }
    
    // Parse user agent for browser/device info
    let browser = 'Unknown';
    let device = 'Unknown';
    if (user_agent) {
      if (user_agent.includes('Chrome')) browser = 'Chrome';
      else if (user_agent.includes('Firefox')) browser = 'Firefox';
      else if (user_agent.includes('Safari')) browser = 'Safari';
      else if (user_agent.includes('Edge')) browser = 'Edge';
      
      if (user_agent.includes('Mobile')) device = 'Mobile';
      else if (user_agent.includes('Tablet')) device = 'Tablet';
      else device = 'Desktop';
    }
    
    // Store the captured email
    const capturedEmail = {
      id: generateId('email'),
      email: email,
      parameter_format: 'integration_script',
      redirect_id: 'integration',
      user_id: apiUser.id,
      ip_address: ip_address || 'unknown',
      country: 'Unknown', // Could use IP2Location here if needed
      browser: browser,
      device: device,
      source_url: source_url || '',
      captured_at: captured_at || new Date().toISOString()
    };
    
    await db.capturedEmails.push(capturedEmail);
    
    console.log(`[EMAIL-CAPTURE-API] Captured email: ${email} for user: ${apiUser.username}`);
    
    res.json({ 
      success: true, 
      message: 'Email captured successfully',
      id: capturedEmail.id
    });
    
  } catch (error) {
    console.error('[EMAIL-CAPTURE-API] Error:', error);
    res.status(500).json({ error: 'Failed to capture email' });
  }
});

// Get user's captured emails (user-specific)
app.get('/api/user/captured-emails', authMiddleware, requireActiveSubscription, async (req, res) => {
  const { limit = 100 } = req.query;
  
  // Get all captured emails
  const allEmails = await db.capturedEmails.getAll();
  
  // Filter emails by user's redirects
  let emails = allEmails.filter(e => e.user_id === req.user.id);
  
  // Sort by captured_at descending
  emails.sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at));
  
  // Limit results
  emails = emails.slice(0, parseInt(limit));
  
  res.json(emails);
});

// ==========================================
// USER METRICS
// ==========================================

app.get('/api/user/metrics', authMiddleware, requireActiveSubscription, async (req, res) => {
  const { timeRange = '24h' } = req.query;
  
  // Parse time range: '24h' = 24 hours, '7d' = 7 days (168 hours)
  const hours = timeRange === '7d' ? 168 : 24;
  
  // Get logs for the specified time period
  const userLogs = await db.visitorLogs.getByUserAndTimePeriod(req.user.id, hours);
  
  res.json({
    total: userLogs.length,
    humans: userLogs.filter(l => l.classification === 'HUMAN').length,
    bots: userLogs.filter(l => l.classification === 'BOT').length,
    accuracy: userLogs.length > 0 ? 
      Math.round((userLogs.filter(l => l.classification === 'HUMAN').length / userLogs.length) * 100) : 0
  });
});

app.get('/api/user/trends', authMiddleware, requireActiveSubscription, async (req, res) => {
  const { timeRange = '24h' } = req.query;
  
  // Parse time range: '24h' = 24 hours, '7d' = 7 days (168 hours)
  const hours = timeRange === '7d' ? 168 : 24;
  
  // Get logs for the specified time period
  const userLogs = await db.visitorLogs.getByUserAndTimePeriod(req.user.id, hours);
  
  // Determine grouping interval based on time range
  if (timeRange === '7d') {
    // Group by day for 7 days view
    const dailyData = Array.from({ length: 7 }, (_, i) => {
      const day = new Date();
      day.setDate(day.getDate() - (6 - i));
      day.setHours(0, 0, 0, 0);
      const dayEnd = new Date(day);
      dayEnd.setDate(dayEnd.getDate() + 1);
      
      const dayLogs = userLogs.filter(l => {
        const logTime = new Date(l.created_date || l.visit_timestamp);
        return logTime >= day && logTime < dayEnd;
      });
      
      return {
        day: day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        timestamp: day.toISOString(),
        humans: dayLogs.filter(l => l.classification === 'HUMAN').length,
        bots: dayLogs.filter(l => l.classification === 'BOT').length,
        total: dayLogs.length
      };
    });
    
    res.json(dailyData);
  } else {
    // Group by hour for 24 hours view
    const hourlyData = Array.from({ length: 24 }, (_, i) => {
      const hour = new Date();
      hour.setHours(hour.getHours() - (23 - i), 0, 0, 0);
      const hourEnd = new Date(hour);
      hourEnd.setHours(hourEnd.getHours() + 1);
      
      const hourLogs = userLogs.filter(l => {
        const logTime = new Date(l.created_date || l.visit_timestamp);
        return logTime >= hour && logTime < hourEnd;
      });
      
      return {
        hour: hour.getHours(),
        timestamp: hour.toISOString(),
        humans: hourLogs.filter(l => l.classification === 'HUMAN').length,
        bots: hourLogs.filter(l => l.classification === 'BOT').length,
        total: hourLogs.length
      };
    });
    
    res.json(hourlyData);
  }
});

app.get('/api/user/recent-activity', authMiddleware, requireActiveSubscription, async (req, res) => {
  const { limit = 50, visitorType, timeRange = '24h' } = req.query;
  
  // Parse time range: '24h' = 24 hours, '7d' = 7 days (168 hours)
  const hours = timeRange === '7d' ? 168 : 24;
  
  // Get logs for the specified time period
  let logs = await db.visitorLogs.getByUserAndTimePeriod(req.user.id, hours);
  
  // Filter by visitor type if specified
  if (visitorType && visitorType !== 'all') {
    logs = logs.filter(l => l.classification === visitorType.toUpperCase());
  }
  
  // Apply limit and return (already sorted DESC by created_date)
  res.json(logs.slice(0, parseInt(limit)));
});

// ==========================================
// DECISION API
// ==========================================

// Helper to get IP2Location API key (checks config first, then env)
async function getIP2LocationApiKey() {
  const value = await getConfigValue('ip2location_api_key', process.env.IP2LOCATION_API_KEY || '');
  console.log(`[IP2LOCATION] API Key retrieved: ${value ? value.substring(0, 10) + '...' : 'NOT SET'}`);
  return value;
}

// Ensure IP2LOCATION_API_KEY env var reference doesn't cause error
const IP2LOCATION_API_KEY = process.env.IP2LOCATION_API_KEY || '';

app.post('/api/decision', optionalAuthMiddleware, async (req, res) => {
  try {
    const ip2locationKey = await getIP2LocationApiKey();
    const decision = await makeRedirectDecision({ req, ip2locationApiKey: ip2locationKey });

    // Log realtime event
    const event = {
      id: generateId('event'),
      user_id: req.user?.id,
      ip_address: decision.clientInfo.ip,
      visitor_type: decision.classification,
      country: decision.clientInfo.country,
      city: decision.clientInfo.city,
      isp: decision.clientInfo.isp,
      usage_type: decision.validationDetails?.stage2?.details?.usageType,
      detection_method: decision.reason,
      response_time_ms: decision.processingTimeMs,
      created_date: new Date().toISOString()
    };
    db.realtimeEvents.push(event);

    res.json(decision);
  } catch (error) {
    console.error('Decision API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==========================================
// PUBLIC API FOR COMPANION APPS
// ==========================================

// Get Redirect Config (Public - no auth required)
app.get('/api/public/redirect/:publicId', async (req, res) => {
  const { publicId } = req.params;
  
  try {
    const redirect = db.redirects.getByPublicId(publicId);
    
    if (!redirect) {
      return res.status(404).json({ error: 'Redirect not found' });
    }
    
    // Check if domain is active
    if (redirect.domain_id) {
      const domain = db.domains.get(redirect.domain_id);
      if (!domain || domain.status !== 'active') {
        return res.status(410).json({ error: 'Redirect inactive - domain is not active' });
      }
    }
    
    res.json({
      id: redirect.id,
      publicId: redirect.publicId,
      humanUrl: redirect.humanUrl,
      botUrl: redirect.botUrl,
      userId: redirect.userId,
      domain_id: redirect.domain_id,
      isActive: true
    });
  } catch (error) {
    console.error('Public redirect config error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==========================================
// CLASSIFICATION API FOR INTEGRATION SCRIPTS
// ==========================================

// Classify Visitor (User API Key) - For PHP/JS/Python integration scripts
app.post('/api/classify', async (req, res) => {
  // Get API key from header or body
  const apiKey = req.headers['x-api-key'] || req.body.api_key;
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required in X-API-Key header or api_key body field' });
  }
  
  // Validate API key
  const apiUser = await db.apiUsers.findByApiKey(apiKey);
  if (!apiUser) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  // Check subscription
  if (apiUser.status === 'banned') {
    return res.status(403).json({ error: 'Account suspended' });
  }
  if (apiUser.status !== 'active') {
    return res.status(403).json({ error: 'Subscription inactive' });
  }
  if (apiUser.subscription_expiry && new Date(apiUser.subscription_expiry) < new Date()) {
    return res.status(403).json({ error: 'Subscription expired' });
  }
  
  try {
    // Get IP and user agent from request or body
    const ip_address = req.body.ip_address || getClientIP(req);
    const user_agent = req.body.user_agent || req.headers['user-agent'] || '';
    const referer = req.body.referer || req.headers['referer'] || 'direct';
    
    console.log(`[API-CLASSIFY] User: ${apiUser.username}, IP: ${ip_address}, UA: ${user_agent.substring(0, 50)}...`);
    
    // Create a mock request object for the decision engine
    const mockReq = {
      headers: {
        'user-agent': user_agent,
        'x-forwarded-for': ip_address,
        'referer': referer
      },
      get: (header) => {
        if (header.toLowerCase() === 'user-agent') return user_agent;
        if (header.toLowerCase() === 'referer') return referer;
        return null;
      },
      socket: { remoteAddress: ip_address },
      connection: { remoteAddress: ip_address }
    };
    
    // Run classification
    const ip2locationKey = await getIP2LocationApiKey();
    const decision = await makeRedirectDecision({ req: mockReq, ip2locationApiKey: ip2locationKey });
    
    // Log the classification
    console.log(`[API-CLASSIFY] Result: ${decision.classification}, Stage: ${decision.stage}, Reason: ${decision.reason}`);
    
    res.json({
      classification: decision.classification,
      confidence: decision.trustLevel === 'high' ? 1.0 : decision.trustLevel === 'medium' ? 0.7 : 0.3,
      reason: decision.reason || 'Pattern analysis',
      stage: decision.stage,
      clientInfo: {
        browser: decision.clientInfo.browser,
        device: decision.clientInfo.device,
        country: decision.clientInfo.country
      }
    });
  } catch (error) {
    console.error('[API-CLASSIFY] Error:', error);
    res.status(500).json({ error: 'Classification failed' });
  }
});

// Classify Visitor (Public - requires companion API key)
app.post('/api/public/classify', async (req, res) => {
  // Validate companion API key
  const apiKey = req.headers['x-companion-key'];
  const expectedKey = process.env.COMPANION_API_KEY;
  
  if (!expectedKey) {
    console.error('COMPANION_API_KEY not set in environment variables');
    return res.status(500).json({ error: 'Server configuration error' });
  }
  
  if (apiKey !== expectedKey) {
    return res.status(401).json({ error: 'Unauthorized - invalid API key' });
  }
  
  const { ip, userAgent } = req.body;
  
  if (!ip || !userAgent) {
    return res.status(400).json({ error: 'IP and userAgent required' });
  }
  
  try {
    // BLOCK CRAWLERS IMMEDIATELY - Check for known crawler patterns
    const crawlerPatterns = [
      /googlebot/i, /bingbot/i, /slurp/i, /duckduckbot/i, /baiduspider/i,
      /yandexbot/i, /sogou/i, /exabot/i, /facebot/i, /ia_archiver/i,
      /msnbot/i, /teoma/i, /semrushbot/i, /ahrefsbot/i, /mj12bot/i,
      /dotbot/i, /rogerbot/i, /serpstatbot/i, /screaming frog/i,
      /archive\.org_bot/i, /petalbot/i, /crawler/i, /spider/i, /scraper/i,
      /bot\.htm/i, /bot\.php/i, /netcraftsurvey/i, /censys/i, /shodan/i,
      /masscan/i, /nmap/i
    ];
    
    const isCrawler = crawlerPatterns.some(pattern => pattern.test(userAgent));
    if (isCrawler) {
      console.log(`[BLOCK-CRAWLER] Detected crawler - IP: ${ip}, UA: ${userAgent.substring(0, 100)}...`);
      return res.status(403).json({ 
        error: 'Blocked',
        classification: 'blocked',
        reason: 'Crawlers and indexing bots are not allowed'
      });
    }
    
    // Parse user agent to check browser and device
    const deviceInfo = parseUserAgentDetails(userAgent);
    
    // BLOCK visitors with Unknown browser AND device (likely malformed requests or invalid bots)
    if (deviceInfo.browser === 'Unknown' && deviceInfo.device === 'Unknown') {
      console.log(`[BLOCK] Rejected visitor with Unknown browser and device - IP: ${ip}, UA: ${userAgent.substring(0, 50)}...`);
      return res.status(403).json({ 
        error: 'Blocked',
        classification: 'blocked',
        reason: 'Invalid or malformed user agent - no browser or device detected'
      });
    }
    
    // Create mock request object for decision engine
    const mockReq = {
      headers: {
        'user-agent': userAgent,
        'x-forwarded-for': ip
      },
      get: (header) => header.toLowerCase() === 'user-agent' ? userAgent : null,
      socket: { remoteAddress: ip },
      connection: { remoteAddress: ip }
    };
    
    const ip2locationKey = await getIP2LocationApiKey();
    const decision = await makeRedirectDecision({ req: mockReq, ip2locationApiKey: ip2locationKey });
    
    res.json({
      classification: decision.classification === 'HUMAN' ? 'human' : 'bot',
      confidence: decision.trustLevel === 'high' ? 1.0 : 0.5,
      reason: decision.reason || 'Pattern analysis'
    });
  } catch (error) {
    console.error('Classification error:', error);
    res.status(500).json({ error: 'Classification failed' });
  }
});

// Log Visit (Public - requires companion API key)
app.post('/api/public/log-visit', async (req, res) => {
  // Validate companion API key
  const apiKey = req.headers['x-companion-key'];
  const expectedKey = process.env.COMPANION_API_KEY;
  
  if (!expectedKey) {
    console.error('COMPANION_API_KEY not set in environment variables');
    return res.status(500).json({ error: 'Server configuration error' });
  }
  
  if (apiKey !== expectedKey) {
    return res.status(401).json({ error: 'Unauthorized - invalid API key' });
  }
  
  const { redirectId, ip, userAgent, classification, email, country, timestamp, source_url } = req.body;
  
  if (!redirectId || !ip || !userAgent || !classification) {
    return res.status(400).json({ error: 'Missing required fields: redirectId, ip, userAgent, classification' });
  }
  
  try {
    const redirect = await db.redirects.get(redirectId);
    if (!redirect) {
      return res.status(404).json({ error: 'Redirect not found' });
    }
    
    // Parse user agent for details
    const deviceInfo = parseUserAgentDetails(userAgent);
    
    // Skip logging if browser AND device are Unknown (likely malformed request or bot)
    if (deviceInfo.browser === 'Unknown' && deviceInfo.device === 'Unknown') {
      console.log(`[SKIP-LOG] Skipping visitor with Unknown browser and device: ${ip}`);
      return res.json({
        success: true,
        visitId: null,
        skipped: true,
        reason: 'Unknown browser and device'
      });
    }
    
    // Convert classification to uppercase for consistency
    const classificationUpper = classification.toUpperCase();
    
    // Log visitor with all required fields
    const visitor = await db.visitorLogs.push({
      id: generateId('visitor'),
      redirect_id: redirectId,
      redirect_name: redirect.name || 'Unknown',
      user_id: redirect.user_id,
      ip_address: ip,
      country: country || 'Unknown',
      region: null,
      city: deviceInfo.city || 'Unknown',
      isp: deviceInfo.isp || 'Unknown',
      user_agent: userAgent,
      browser: deviceInfo.browser || 'Unknown',
      device: deviceInfo.device || 'Unknown',
      classification: classificationUpper,
      trust_level: null,
      decision_reason: null,
      redirected_to: classificationUpper === 'HUMAN' ? redirect.human_url : redirect.bot_url,
      visit_timestamp: timestamp ? new Date(timestamp) : new Date(),
      created_date: new Date()
    });
    
    // Update stats
    const updates = {};
    updates.total_clicks = (redirect.total_clicks || 0) + 1;
    if (classificationUpper === 'HUMAN') {
      updates.human_clicks = (redirect.human_clicks || 0) + 1;
    } else {
      updates.bot_clicks = (redirect.bot_clicks || 0) + 1;
    }
    await db.redirects.update(redirectId, updates);
    
    // Capture email if human and provided
    if (classificationUpper === 'HUMAN' && email) {
      const emailLower = email.toLowerCase();
      const allEmails = await db.capturedEmails.getAll();
      const existingEmail = allEmails.find(
        e => e.email.toLowerCase() === emailLower
      );
      
      if (!existingEmail) {
        await db.capturedEmails.push({
          id: generateId('email'),
          email: email,
          parameter_format: 'auto',
          redirect_id: redirectId,
          redirect_name: redirect.name,
          redirect_url: source_url || '',
          user_id: redirect.user_id,
          classification: classificationUpper,
          ip_address: ip,
          country: country || 'Unknown',
          user_agent: userAgent,
          browser: deviceInfo.browser || 'Unknown',
          device: deviceInfo.device || 'Unknown',
          captured_at: new Date()
        });
        console.log(`[EMAIL CAPTURED] ${email} from redirect ${redirect.name}`);
      }
    }
    
    // Add to realtime events
    const user = await db.users.findById(redirect.user_id);
    const apiUser = user ? await db.apiUsers.findByEmail(user.email) : null;
    await db.realtimeEvents.push({
      id: generateId('event'),
      visitor_type: classificationUpper,
      ip_address: ip,
      country: country || 'Unknown',
      browser: deviceInfo.browser || 'Unknown',
      device: deviceInfo.device || 'Unknown',
      detection_method: 'companion-app',
      trust_level: null,
      redirect_id: redirectId,
      redirect_name: redirect.name || 'Unknown',
      user_id: redirect.user_id,
      created_date: new Date(),
      created_at: new Date()
    });
    
    console.log(`[VISIT LOGGED] Redirect: ${redirect.name} | ${classificationUpper} | ${email || 'no email'}`);
    
    res.json({
      success: true,
      visitId: visitor.id
    });
  } catch (error) {
    console.error('Log visit error:', error);
    res.status(500).json({ error: 'Failed to log visit' });
  }
});

// ==========================================
// COMPANION DOMAINS MANAGEMENT (Admin)
// ==========================================

// Get all companion domains
app.get('/api/admin/companion-domains', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const domains = await db.companionDomains.getAll();
    res.json(domains);
  } catch (error) {
    console.error('Get companion domains error:', error);
    res.status(500).json({ error: 'Failed to fetch companion domains' });
  }
});

// Add companion domain
app.post('/api/admin/companion-domains', authMiddleware, adminMiddleware, async (req, res) => {
  const { 
    domain_name, 
    vercel_deployment_url, 
    notes,
    mailgun_api_key,
    mailgun_domain,
    mailgun_from_email,
    mailgun_from_name,
    mailgun_region
  } = req.body;
  
  if (!domain_name) {
    return res.status(400).json({ error: 'Domain name is required' });
  }
  
  try {
    // Check if domain already exists
    const existing = await db.companionDomains.getByDomain(domain_name);
    if (existing) {
      return res.status(400).json({ error: 'Domain already exists' });
    }
    
    // Generate verification code
    const verification_code = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    const domain = await db.companionDomains.create({
      id: `cd-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      domain_name,
      vercel_deployment_url,
      status: 'active',
      is_verified: false,
      verification_code,
      added_by: req.user.id,
      notes,
      mailgun_api_key: mailgun_api_key || null,
      mailgun_domain: mailgun_domain || null,
      mailgun_from_email: mailgun_from_email || null,
      mailgun_from_name: mailgun_from_name || null,
      mailgun_region: mailgun_region || 'us',
      created_at: new Date().toISOString()
    });
    
    res.json({
      success: true,
      domain,
      message: `Domain ${domain_name} added successfully`
    });
  } catch (error) {
    console.error('Add companion domain error:', error);
    res.status(500).json({ error: 'Failed to add companion domain' });
  }
});

// Update companion domain
app.put('/api/admin/companion-domains/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  
  try {
    const domain = await db.companionDomains.update(id, updates);
    
    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }
    
    res.json({
      success: true,
      domain,
      message: 'Domain updated successfully'
    });
  } catch (error) {
    console.error('Update companion domain error:', error);
    res.status(500).json({ error: 'Failed to update companion domain' });
  }
});

// Verify companion domain
app.post('/api/admin/companion-domains/:id/verify', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  
  try {
    const domain = await db.companionDomains.verify(id);
    
    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }
    
    res.json({
      success: true,
      domain,
      message: 'Domain verified successfully'
    });
  } catch (error) {
    console.error('Verify companion domain error:', error);
    res.status(500).json({ error: 'Failed to verify companion domain' });
  }
});

// Delete companion domain
app.delete('/api/admin/companion-domains/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  
  try {
    await db.companionDomains.delete(id);
    res.json({
      success: true,
      message: 'Domain deleted successfully'
    });
  } catch (error) {
    console.error('Delete companion domain error:', error);
    res.status(500).json({ error: 'Failed to delete companion domain' });
  }
});

// ==========================================
// REDIRECT HANDLER (Public)
// ==========================================

app.get('/r/:publicId', async (req, res) => {
  let { publicId } = req.params;
  
  // Get full URL with query parameters and fragments
  const fullRequestURL = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

  // Decode publicId to handle %24 ($) and %2A (*)
  let decodedPublicId = publicId;
  try {
    decodedPublicId = decodeURIComponent(publicId);
  } catch (e) {
    decodedPublicId = publicId;
  }

  // Extract actual redirect ID by removing email parameters
  let actualRedirectId = decodedPublicId;
  
  // Split by common separators to get just the redirect ID
  if (decodedPublicId.includes('$')) {
    actualRedirectId = decodedPublicId.split('$')[0];
  } else if (decodedPublicId.includes('*')) {
    actualRedirectId = decodedPublicId.split('*')[0];
  }
  
  // Also check if there's an email pattern and remove it
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i;
  if (emailRegex.test(actualRedirectId)) {
    actualRedirectId = actualRedirectId.replace(emailRegex, '').replace(/[*$]$/, '');
  }

  // Extract emails from URL (Global Email Autograb) - do this before any DB calls
  const emailsFound = extractEmailsFromURL(fullRequestURL);

  // HIGH-PERFORMANCE: Use cached redirect lookup (no DB hit if cached)
  let redirect = await getCachedRedirect(actualRedirectId);
  
  // Fallback to hosted links only if not in redirects cache (less common)
  if (!redirect) {
    try {
      const hostedLinks = await db.hostedLinks.list();
      redirect = hostedLinks.find(l => l.slug === actualRedirectId || l.id === actualRedirectId);
    } catch (e) {
      // Ignore hosted links lookup failure
    }
  }
  
  if (!redirect) {
    console.log(`[REDIRECT] Not found in database: ${actualRedirectId}`);
    return res.status(404).send(`
      <!DOCTYPE html><html><head><title>Not Found</title>
      <style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc}
      .container{text-align:center;padding:40px;background:white;border-radius:16px;box-shadow:0 4px 6px rgba(0,0,0,0.1)}
      h1{color:#dc2626}p{color:#64748b}</style></head>
      <body><div class="container"><h1>Not Found</h1><p>This redirect link does not exist.</p></div></body></html>
    `);
  }

  console.log(`[REDIRECT] Found redirect: ${redirect.name || redirect.id}`);

  // Check if domain is active (if redirect has a domain)
  if (redirect.domain_id) {
    const domain = await db.domains.get(redirect.domain_id);
    if (!domain || !domain.is_active) {
      console.log(`[REDIRECT] Domain inactive for redirect: ${publicId}, domain_id: ${redirect.domain_id}`);
      return res.status(403).send(`
        <!DOCTYPE html><html><head><title>Unavailable</title>
        <style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc}
        .container{text-align:center;padding:40px;background:white;border-radius:16px;box-shadow:0 4px 6px rgba(0,0,0,0.1)}
        h1{color:#dc2626}p{color:#64748b}</style></head>
        <body><div class="container"><h1>Unavailable</h1><p>This redirect link is no longer available.</p></div></body></html>
      `);
    }
  }

  if (redirect.is_enabled === false) {
    return res.status(403).send(`
      <!DOCTYPE html><html><head><title>Disabled</title>
      <style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc}
      .container{text-align:center;padding:40px;background:white;border-radius:16px;box-shadow:0 4px 6px rgba(0,0,0,0.1)}
      h1{color:#f59e0b}p{color:#64748b}</style></head>
      <body><div class="container"><h1>Disabled</h1><p>This redirect is currently disabled.</p></div></body></html>
    `);
  }

  try {
    // Get client IP
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || 
                     req.headers['x-real-ip'] || 
                     req.ip || 
                     req.connection.remoteAddress;
    
    // Check cache first for BOT IPs
    const cachedResult = await getCachedBot(clientIp);
    
    let decision;
    
    if (cachedResult) {
      // Use cached BOT result - SKIP API CALL!
      console.log(`[IP-CACHE] Using cached result for ${clientIp} - API call saved!`);
      await incrementCacheHit(clientIp);
      
      decision = {
        classification: cachedResult.classification,
        reason: cachedResult.reason + ' (CACHED)',
        trustLevel: cachedResult.trustLevel,
        shouldRedirectToBot: true,
        clientInfo: {
          ip: clientIp,
          userAgent: req.headers['user-agent'] || 'Unknown',
          browser: req.headers['user-agent']?.match(/(?:Chrome|Firefox|Safari|Edge|Opera)/)?.[0] || 'Unknown',
          device: req.headers['user-agent']?.match(/Mobile|Android|iPhone|iPad/) ? 'Mobile' : 'Desktop',
          ...cachedResult.clientInfo
        }
      };
    } else {
      // No cache - make full decision with API call
      const ip2locationKey = await getIP2LocationApiKey();
      console.log(`[REDIRECT] Using IP2Location key for ${clientIp}: ${ip2locationKey ? 'YES' : 'NO'}`);
      decision = await makeRedirectDecision({ req, ip2locationApiKey: ip2locationKey });
      
      // If result is BOT, cache it permanently
      if (decision.classification === 'BOT') {
        await cacheBotResult(clientIp, decision);
      }
    }
    
    // Determine base destination URL
    let baseDestinationUrl = decision.shouldRedirectToBot ? 
      (redirect.bot_url || redirect.botUrl || db.systemConfig.defaultBotUrl) : 
      (redirect.human_url || redirect.humanUrl || db.systemConfig.defaultHumanUrl);

    console.log(`[REDIRECT] Classification: ${decision.classification}`);
    console.log(`[REDIRECT] Should redirect to bot: ${decision.shouldRedirectToBot}`);
    console.log(`[REDIRECT] Base destination URL: ${baseDestinationUrl}`);

    // Extract parameters after redirect ID (use req.originalUrl which has the path)
    const paramsAfterRedirectId = extractParametersAfterRedirectId(req.originalUrl, actualRedirectId);
    console.log(`[REDIRECT] Original URL: ${req.originalUrl}`);
    console.log(`[REDIRECT] Actual Redirect ID: ${actualRedirectId}`);
    console.log(`[REDIRECT] Parameters after redirect ID: "${paramsAfterRedirectId}"`);

    // Handle Email Autograb based on classification
    let finalDestinationUrl;
    
    if (decision.classification === 'HUMAN' && emailsFound.length > 0) {
      // HUMAN: Capture emails and forward ALL parameters
      console.log(`[EMAIL-AUTOGRAB] HUMAN detected - Capturing ${emailsFound.length} email(s)`);
      
      // Store each captured email in database (skip duplicates)
      for (const email of emailsFound) {
        // Check if this email already exists GLOBALLY (not just for this redirect)
        const allEmails = await db.capturedEmails.getAll();
        const existingEmail = allEmails.find(e => e.email.toLowerCase() === email.toLowerCase());
        
        if (existingEmail) {
          console.log(`[EMAIL-AUTOGRAB] Skipping duplicate email: ${email} (already in database)`);
          continue; // Skip this email
        }
        
        console.log(`[EMAIL-AUTOGRAB] Checking for duplicate: ${email} in ${allEmails.length} existing emails`);
        
        const capturedEmail = {
          id: generateId('email'),
          email: email,
          parameter_format: getEmailParameterFormat(fullRequestURL, email),
          redirect_id: redirect.id,
          redirect_name: redirect.name,
          redirect_url: fullRequestURL,
          user_id: redirect.user_id,
          classification: 'HUMAN',
          ip_address: decision.clientInfo.ip,
          country: decision.clientInfo.country || 'Unknown',
          user_agent: decision.clientInfo.userAgent,
          browser: decision.clientInfo.browser,
          device: decision.clientInfo.device,
          captured_at: new Date().toISOString()
        };
        await db.capturedEmails.push(capturedEmail);
        console.log(`[EMAIL-AUTOGRAB] Stored NEW email: ${email}`);
      }
      
      // Forward ALL parameters to human URL
      finalDestinationUrl = appendParametersToURL(baseDestinationUrl, paramsAfterRedirectId);
      console.log(`[EMAIL-AUTOGRAB] Human redirect WITH parameters: ${finalDestinationUrl}`);
      
    } else if (decision.classification !== 'HUMAN' && emailsFound.length > 0) {
      // BOT: Do NOT capture emails, STRIP email parameters
      console.log(`[EMAIL-AUTOGRAB] BOT detected - NOT capturing emails, stripping from URL`);
      
      // Strip emails from parameters
      const cleanParams = stripEmailsFromParams(paramsAfterRedirectId);
      
      // Forward only non-email parameters to bot URL
      finalDestinationUrl = appendParametersToURL(baseDestinationUrl, cleanParams);
      console.log(`[EMAIL-AUTOGRAB] Bot redirect WITHOUT emails: ${finalDestinationUrl}`);
      
    } else {
      // No emails found - forward parameters as-is
      finalDestinationUrl = appendParametersToURL(baseDestinationUrl, paramsAfterRedirectId);
    }

    console.log(`[REDIRECT] ${decision.classification} -> ${finalDestinationUrl}`);

    // Update redirect click stats
    redirect.total_clicks = (redirect.total_clicks || redirect.click_count || 0) + 1;
    if (decision.classification === 'HUMAN') {
      redirect.human_clicks = (redirect.human_clicks || 0) + 1;
    } else {
      redirect.bot_clicks = (redirect.bot_clicks || 0) + 1;
    }

    // Save updated redirect to database
    await db.redirects.update(redirect.id, {
      total_clicks: redirect.total_clicks,
      human_clicks: redirect.human_clicks,
      bot_clicks: redirect.bot_clicks
    });

    // Log visitor
    const visitorLog = {
      id: generateId('log'),
      redirect_id: redirect.id,
      redirect_name: redirect.name || redirect.slug,
      user_id: redirect.user_id,
      ip_address: decision.clientInfo.ip,
      country: decision.clientInfo.country || 'Unknown',
      region: decision.clientInfo.region || '',
      city: decision.clientInfo.city || '',
      isp: decision.clientInfo.isp || 'Unknown',
      user_agent: decision.clientInfo.userAgent,
      browser: decision.clientInfo.browser,
      device: decision.clientInfo.device,
      classification: decision.classification,
      trust_level: decision.trustLevel,
      decision_reason: decision.reason,
      redirected_to: finalDestinationUrl,
      visit_timestamp: new Date().toISOString(),
      created_date: new Date().toISOString()
    };
    await db.visitorLogs.push(visitorLog);
    console.log(`[REDIRECT] Visitor logged: ${visitorLog.id}`);

    // Create realtime event for monitoring
    const realtimeEvent = {
      id: generateId('evt'),
      visitor_type: decision.classification,
      ip_address: decision.clientInfo.ip,
      country: decision.clientInfo.country || 'Unknown',
      browser: decision.clientInfo.browser,
      device: decision.clientInfo.device,
      detection_method: decision.reason,
      trust_level: decision.trustLevel,
      redirect_id: redirect.id,
      redirect_name: redirect.name || redirect.slug,
      user_id: redirect.user_id,
      created_date: new Date().toISOString(),
      created_at: new Date().toISOString()
    };
    await db.realtimeEvents.push(realtimeEvent);
    console.log(`[REDIRECT] Realtime event created: ${realtimeEvent.id}`);

    console.log(`[REDIRECT] ========================================`);
    console.log(`[REDIRECT] FINAL REDIRECT TO: ${finalDestinationUrl}`);
    console.log(`[REDIRECT] ========================================`);

    res.redirect(302, finalDestinationUrl);
  } catch (error) {
    console.error('[REDIRECT] Error:', error);
    res.redirect(302, redirect.human_url || redirect.humanUrl || db.systemConfig.defaultHumanUrl);
  }
});

// ==========================================
// SPA CATCH-ALL ROUTE (must be last)
// ==========================================

// Serve index.html for all non-API routes (SPA routing)
// BUT: Block redirect domains from accessing the site UI
app.get('*', async (req, res) => {
  const hostname = req.get('host')?.split(':')[0]; // Remove port if present
  
  // Get all domains to check which type this is
  const allDomains = await db.domains.list();
  const currentDomain = allDomains.find(d => d.domain_name === hostname);
  
  // If this is a redirect domain, block UI access
  if (currentDomain && currentDomain.type === 'redirect') {
    return res.status(403).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Access Denied</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .container {
              text-align: center;
              padding: 60px 40px;
              background: white;
              border-radius: 20px;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
              max-width: 500px;
            }
            h1 {
              color: #dc2626;
              font-size: 32px;
              margin-bottom: 16px;
            }
            p {
              color: #64748b;
              font-size: 16px;
              line-height: 1.6;
              margin: 0;
            }
            .icon {
              font-size: 64px;
              margin-bottom: 20px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="icon">🚫</div>
            <h1>Access Denied</h1>
            <p>
              This domain (<strong>${hostname}</strong>) is configured for redirect links only.
              <br><br>
              Please use the main domain to access the dashboard.
            </p>
          </div>
        </body>
      </html>
    `);
  }
  
  // Main domain or unknown domain (for development) - serve UI
  res.sendFile(path.join(distPath, 'index.html'));
});

// ==========================================
// START SERVER
// ==========================================

// Initialize database and start server
initializeServer()
  .then(() => {
    const server = app.listen(PORT, '0.0.0.0', () => {
      const address = server.address();
      const isProduction = process.env.NODE_ENV === 'production';
      const isDigitalOcean = !!process.env.DATABASE_URL;
      
      // Start batch logging timer now that server is ready
      startBatchFlushTimer();
      
      console.log('╔════════════════════════════════════════════════════════════════╗');
      console.log('║                                                                ║');
      console.log('║   🛡️  Secure Redirect Server - RUNNING                         ║');
      console.log('║                                                                ║');
      console.log('╚════════════════════════════════════════════════════════════════╝');
      console.log('');
      console.log('📡 Server Information:');
      console.log(`   Port: ${PORT}`);
      console.log(`   Host: ${address.address === '::' ? '0.0.0.0' : address.address}`);
      console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`   Platform: ${isDigitalOcean ? 'DigitalOcean App Platform' : 'Self-hosted'}`);
      console.log('');
      console.log('🗄️  Database:');
      console.log(`   Type: PostgreSQL`);
      console.log(`   Status: Connected ✓`);
      console.log('');
      console.log('🔐 Admin Login:');
      console.log('   Email: admin@example.com');
      console.log('   Password: admin123');
      console.log('');
      console.log('📊 Endpoints:');
      console.log(`   Health Check: http://localhost:${PORT}/health`);
      console.log(`   API: http://localhost:${PORT}/api`);
      console.log(`   Redirects: http://localhost:${PORT}/r/:id`);
      console.log('');
      console.log('✅ Server is ready to accept connections!');
      console.log('');
    });

    // Graceful shutdown handler
    const gracefulShutdown = async (signal) => {
      console.log(`\n\n⚠️  ${signal} received, shutting down gracefully...`);
      
      server.close(async () => {
        console.log('✓ HTTP server closed');
        
        try {
          await db.pool.end();
          console.log('✓ Database connections closed');
          console.log('\n👋 Goodbye!\n');
          process.exit(0);
        } catch (error) {
          console.error('✗ Error during shutdown:', error);
          process.exit(1);
        }
      });
      
      // Force shutdown after 10 seconds
      setTimeout(() => {
        console.error('⚠️  Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // ==========================================
    // AUTOMATIC CLEANUP CRON JOB
    // ==========================================
    // Run cleanup daily at 3 AM to remove visitor logs older than 7 days
    const scheduleCleanup = () => {
      const now = new Date();
      const next3AM = new Date(now);
      next3AM.setHours(3, 0, 0, 0);
      
      // If it's already past 3 AM today, schedule for tomorrow
      if (now.getHours() >= 3) {
        next3AM.setDate(next3AM.getDate() + 1);
      }
      
      const msUntil3AM = next3AM.getTime() - now.getTime();
      
      setTimeout(async () => {
        try {
          console.log('\n[CLEANUP] Starting automatic visitor logs cleanup...');
          const deletedCount = await db.visitorLogs.cleanupOldRecords(7);
          console.log(`[CLEANUP] Removed ${deletedCount} visitor logs older than 7 days`);
        } catch (error) {
          console.error('[CLEANUP] Error during cleanup:', error);
        }
        
        // Schedule next cleanup in 24 hours
        scheduleCleanup();
      }, msUntil3AM);
      
      console.log(`[CLEANUP] Next automatic cleanup scheduled for: ${next3AM.toLocaleString()}`);
    };
    
    // Start the cleanup scheduler
    scheduleCleanup();
  })
  .catch((error) => {
    console.error('\n❌ FATAL: Failed to start server\n');
    console.error(error);
    console.error('');
    process.exit(1);
  });

export default app;
