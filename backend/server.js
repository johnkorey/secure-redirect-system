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
import { makeRedirectDecision } from './lib/redirectDecisionEngine.js';
import { getClientIP } from './lib/ip2locationValidator.js';
import { parseUserAgentDetails } from './lib/userAgentValidator.js';
import { 
  hashPassword, 
  comparePassword, 
  generateToken, 
  authMiddleware,
  optionalAuthMiddleware 
} from './lib/auth.js';
import { 
  sendVerificationEmail, 
  sendPaymentConfirmationEmail,
  generateVerificationCode 
} from './lib/emailService.js';
import db from './lib/postgresDatabase.js';

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
app.set('trust proxy', true);

// Serve static frontend files in production
import { fileURLToPath } from 'url';
import path from 'path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// Pricing configuration
// dailyLinkLimit = how many redirect links user can generate per day
// dailyRequestLimit = how many requests/visits allowed per day (20K for all plans)
const PRICING = {
  daily: { price: 100, dailyLinkLimit: 1, dailyRequestLimit: 20000, duration: 1, name: 'Daily' },
  weekly: { price: 300, dailyLinkLimit: 2, dailyRequestLimit: 20000, duration: 7, name: 'Weekly' },
  monthly: { price: 900, dailyLinkLimit: 2, dailyRequestLimit: 20000, duration: 30, name: 'Monthly' }
};

// Default system config values
const defaultSystemConfig = {
  defaultHumanUrl: 'https://example.com',
  defaultBotUrl: 'https://google.com',
  dailyEmailLimit: 10,
  maintenanceMode: false
};

// Helper to get config value from database
function getConfigValue(key, defaultValue = '') {
  return db.systemConfigs.getValue(key, defaultValue);
}

// Helper to get Mailgun config from database
function getMailgunConfig() {
  return {
    mailgun_api_key: getConfigValue('mailgun_api_key'),
    mailgun_domain: getConfigValue('mailgun_domain'),
    mailgun_from_email: getConfigValue('mailgun_from_email', 'noreply@example.com'),
    mailgun_from_name: getConfigValue('mailgun_from_name', 'Secure Redirect'),
    mailgun_region: getConfigValue('mailgun_region', 'us')
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
    console.log('\n[2/3] Initializing database schema...');
    await db.initializeDatabase();
    console.log('      ✓ All tables ready');

    // 3. Check if admin user exists
    console.log('\n[3/3] Checking admin account...');
    const existingAdmin = await db.users.findByEmail('admin@example.com');
    
    if (!existingAdmin) {
      console.log('      Creating default admin account...');
      const adminPassword = await hashPassword('admin123');
      
      // Create admin user
      await db.users.create({
        id: 'user-admin',
        email: 'admin@example.com',
        password: adminPassword,
        full_name: 'Admin User',
        role: 'admin',
        created_at: new Date().toISOString()
      });

      // Create admin API user with monthly plan (2 links/day, 20K requests/day)
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

      // Create welcome announcement
      await db.announcements.create({
        id: 'ann-1',
        title: 'Welcome to Secure Redirect',
        message: 'Configure your settings in the Configuration page to get started!',
        type: 'info',
        is_active: true,
        created_at: new Date().toISOString()
      });

      console.log('      ✓ Admin account created: admin@example.com / admin123');
    } else {
      console.log('      ✓ Admin account exists');
    }
    
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
    if (db.users.findByEmail(email.toLowerCase())) {
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
    db.signupSessions.create(session);

    // Send verification email
    const mailgunConfig = getMailgunConfig();
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
    
    const session = db.signupSessions.findById(sessionId);
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
    db.signupSessions.update(sessionId, {
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
    
    const session = db.signupSessions.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Generate new code
    const verificationCode = generateVerificationCode();
    db.signupSessions.update(sessionId, {
      verification_code: verificationCode,
      code_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    });

    // Send new verification email
    const mailgunConfig = getMailgunConfig();
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
app.get('/api/user/pending-signup/:sessionId', (req, res) => {
  const session = db.signupSessions.findById(req.params.sessionId);
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
    
    const session = db.signupSessions.findById(sessionId);
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
    db.users.create(user);

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
    db.apiUsers.create(apiUser);

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
    db.payments.create(payment);

    // Mark session as complete
    db.signupSessions.update(sessionId, {
      paid: true,
      completed_at: new Date().toISOString()
    });

    // Send confirmation email
    const mailgunConfig = getMailgunConfig();
    await sendPaymentConfirmationEmail(session.email, {
      accessType: session.access_type,
      dailyLinkLimit: pricing.dailyLinkLimit,
      expiryDate: expiryDate.toLocaleDateString(),
      apiKey
    }, smtpConfig);

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
    db.apiUsers.update(apiUser.id, {
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
    db.payments.set(payment.id, payment);

    // Mark session as completed
    session.status = 'completed';
    db.signupSessions.set(sessionId, session);

    // Send confirmation email if Mailgun configured
    try {
      const mailgunConfig = getMailgunConfig();
      if (mailgunConfig.mailgun_api_key) {
        await sendPaymentConfirmationEmail(session.email, {
          accessType: session.access_type,
          dailyLinkLimit: pricing.dailyLinkLimit,
          expiryDate: expiryDate.toLocaleDateString(),
          type: 'renewal'
        }, smtpConfig);
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

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = db.users.findByEmail(email.toLowerCase());
    if (!user || !(await comparePassword(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const apiUser = db.apiUsers.findByEmail(email.toLowerCase());

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
    const apiUser = Array.from(db.apiUsers.values()).find(u => u.username === username);
    if (!apiUser) {
      return res.status(404).json({ error: 'Invalid username or API key' });
    }

    // Verify API key
    if (apiUser.api_key !== apiKey) {
      return res.status(401).json({ error: 'Invalid username or API key' });
    }

    // Check if password is already set
    const existingUser = db.users.findByEmail(apiUser.email);
    if (existingUser && existingUser.password && existingUser.password !== '') {
      return res.status(400).json({ error: 'Password already set. Please use the login page.' });
    }

    // Hash the password
    const hashedPassword = await hashPassword(password);

    // Create or update user
    if (existingUser) {
      db.users.update(existingUser.id, { password: hashedPassword });
    } else {
      db.users.create({
        id: `user-${Date.now()}`,
        email: apiUser.email,
        password: hashedPassword,
        full_name: apiUser.username,
        role: 'user',
        created_at: new Date().toISOString()
      });
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

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = db.users.findByEmail(req.user.email);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { password: _, ...userWithoutPassword } = user;
  
  const apiUser = db.apiUsers.findByEmail(req.user.email);
  res.json({ ...userWithoutPassword, apiUser });
});

// ==========================================
// HEALTH & STATS
// ==========================================

// Health check endpoint for DigitalOcean App Platform
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    const dbTest = await db.query('SELECT 1 as health');
    
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'postgresql',
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development'
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

app.get('/api/api-users', authMiddleware, adminMiddleware, (req, res) => {
  res.json(Array.from(db.apiUsers.values()));
});

app.post('/api/api-users', authMiddleware, adminMiddleware, async (req, res) => {
  const apiUser = {
    id: generateId('apiuser'),
    ...req.body,
    api_key: `ak_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    current_usage: 0,
    credits: 0,
    created_at: new Date().toISOString()
  };
  db.apiUsers.set(apiUser.id, apiUser);
  res.status(201).json(apiUser);
});

app.get('/api/api-users/:id', authMiddleware, adminMiddleware, (req, res) => {
  const user = db.apiUsers.get(req.params.id);
  if (!user) return res.status(404).json({ error: 'API user not found' });
  res.json(user);
});

app.put('/api/api-users/:id', authMiddleware, adminMiddleware, (req, res) => {
  const user = db.apiUsers.get(req.params.id);
  if (!user) return res.status(404).json({ error: 'API user not found' });
  const updated = { ...user, ...req.body };
  db.apiUsers.set(req.params.id, updated);
  res.json(updated);
});

app.delete('/api/api-users/:id', authMiddleware, adminMiddleware, (req, res) => {
  const apiUser = db.apiUsers.get(req.params.id);
  if (!apiUser) return res.status(404).json({ error: 'Not found' });
  
  // Also delete the associated user account if it exists
  const userAccount = db.users.findByEmail(apiUser.email);
  if (userAccount) {
    db.users.delete(userAccount.id);
    console.log(`[DELETE] Deleted user account: ${userAccount.email}`);
  }
  
  // Delete the API user
  db.apiUsers.delete(req.params.id);
  console.log(`[DELETE] Deleted API user: ${apiUser.email}`);
  
  res.status(204).send();
});

// Send test email for redirect link
app.post('/api/user/send-test-email', authMiddleware, async (req, res) => {
  try {
    const { redirect_id, recipient } = req.body;

    if (!redirect_id || !recipient) {
      return res.status(400).json({ error: 'Redirect ID and recipient email required' });
    }

    // Find the redirect
    const redirect = db.redirects.get(redirect_id);
    if (!redirect) {
      return res.status(404).json({ error: 'Redirect not found' });
    }

    // Verify ownership
    if (redirect.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Get domain configuration for this redirect
    let domainConfig;
    if (redirect.domain_id) {
      const domain = db.domains.get(redirect.domain_id);
      if (!domain) {
        return res.status(404).json({ error: 'Domain configuration not found' });
      }
      domainConfig = {
        mailgun_domain: domain.mailgun_domain,
        from_email: domain.from_email,
        from_name: domain.from_name || 'Secure Redirect'
      };
    } else {
      // Use main domain if no domain specified
      const mainDomain = Array.from(db.domains.values()).find(d => d.type === 'main');
      if (!mainDomain) {
        return res.status(404).json({ error: 'Main domain not configured' });
      }
      domainConfig = {
        mailgun_domain: mainDomain.mailgun_domain,
        from_email: mainDomain.from_email,
        from_name: mainDomain.from_name || 'Secure Redirect'
      };
    }

    // Get Mailgun API key from system config
    const mailgunApiKey = getConfigValue('mailgun_api_key');
    const mailgunRegion = getConfigValue('mailgun_region', 'us');
    
    if (!mailgunApiKey) {
      return res.status(500).json({ error: 'Mailgun not configured' });
    }

    // Send email using Mailgun API
    const apiUrl = mailgunRegion === 'eu' ? 'https://api.eu.mailgun.net/v3' : 'https://api.mailgun.net/v3';
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    
    form.append('from', `${domainConfig.from_name} <${domainConfig.from_email}>`);
    form.append('to', recipient);
    form.append('subject', 'Your Redirect Link');
    form.append('html', `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background: #f8fafc; padding: 20px; }
          .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .title { color: #10b981; text-align: center; margin-bottom: 30px; }
          .message { color: #64748b; line-height: 1.6; margin-bottom: 30px; }
          .link-box { background: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .link { color: #3b82f6; word-break: break-all; font-family: monospace; font-size: 14px; }
          .button { display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
          .footer { text-align: center; color: #94a3b8; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1 class="title">🔗 This is your redirect link</h1>
          <p class="message">
            Here's the redirect link you requested. Click the button below to test it:
          </p>
          <div class="link-box">
            <p style="margin: 0 0 10px 0; color: #64748b; font-size: 12px;">Your Link:</p>
            <div class="link">${redirect.full_url || `${FRONTEND_URL}/r/${redirect.public_id}`}</div>
          </div>
          <center>
            <a href="${redirect.full_url || `${FRONTEND_URL}/r/${redirect.public_id}`}" class="button">Test Link</a>
          </center>
          <p class="message" style="font-size: 14px; margin-top: 30px;">
            <strong>Where it goes:</strong><br>
            🟢 Human traffic → ${redirect.human_url}<br>
            🤖 Bot traffic → ${redirect.bot_url}
          </p>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Secure Redirect. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `);

    const response = await fetch(`${apiUrl}/${domainConfig.mailgun_domain}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`api:${mailgunApiKey}`).toString('base64')}`,
        ...form.getHeaders()
      },
      body: form
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to send email');
    }

    console.log(`[EMAIL] Test email sent for redirect ${redirect_id} to ${recipient}`);
    res.json({ success: true, messageId: data.id });
  } catch (error) {
    console.error('[EMAIL] Send test email error:', error);
    res.status(500).json({ error: error.message || 'Failed to send test email' });
  }
});

// ==========================================
// REDIRECTS / HOSTED LINKS
// ==========================================

app.get('/api/redirects', authMiddleware, (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const redirects = Array.from(db.redirects.values());
  res.json(isAdmin ? redirects : redirects.filter(r => r.user_id === req.user.id));
});

app.post('/api/redirects', authMiddleware, (req, res) => {
  const { name, human_url, bot_url, is_enabled = true, domain_id, domain_name, full_url, public_id } = req.body;
  if (!name || !human_url || !bot_url) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Validate domain if provided
  if (domain_id) {
    const domain = db.domains.get(domain_id);
    if (!domain) {
      return res.status(400).json({ error: 'Invalid domain' });
    }
    if (domain.type === 'main') {
      return res.status(400).json({ error: 'Cannot use main domain for redirect links' });
    }
    if (!domain.is_active) {
      return res.status(400).json({ error: 'Domain is not active' });
    }
  }

  // Find API user and check daily link limit
  const apiUser = Array.from(db.apiUsers.values()).find(u => u.email === req.user.email);
  if (apiUser) {
    const today = new Date().toISOString().split('T')[0];
    
    // Reset counter if new day
    if (apiUser.links_created_date !== today) {
      apiUser.links_created_today = 0;
      apiUser.links_created_date = today;
    }
    
    // Check limit (applies to all users including admin)
    const dailyLimit = apiUser.daily_link_limit || 1;
    if (apiUser.links_created_today >= dailyLimit) {
      return res.status(403).json({ 
        error: `Daily link limit reached. You can create ${dailyLimit} link${dailyLimit > 1 ? 's' : ''} per day.`,
        limit: dailyLimit,
        created: apiUser.links_created_today
      });
    }
    
    // Increment counter
    apiUser.links_created_today = (apiUser.links_created_today || 0) + 1;
    db.apiUsers.set(apiUser.id, apiUser);
    console.log(`[LINK-COUNTER] User ${req.user.email} created link. Count: ${apiUser.links_created_today}/${apiUser.daily_link_limit}`);
  }

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
  db.redirects.set(publicId, redirect);
  res.status(201).json(redirect);
});

app.get('/api/redirects/:id', authMiddleware, (req, res) => {
  const redirect = db.redirects.get(req.params.id);
  if (!redirect) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'admin' && redirect.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  res.json(redirect);
});

app.put('/api/redirects/:id', authMiddleware, (req, res) => {
  const redirect = db.redirects.get(req.params.id);
  if (!redirect) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'admin' && redirect.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const updated = { ...redirect, ...req.body, user_id: redirect.user_id };
  db.redirects.set(req.params.id, updated);
  res.json(updated);
});

app.delete('/api/redirects/:id', authMiddleware, (req, res) => {
  const redirect = db.redirects.get(req.params.id);
  if (!redirect) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'admin' && redirect.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  db.redirects.delete(req.params.id);
  res.status(204).send();
});

// Hosted Links (alias for user's redirect links)
app.get('/api/hosted-links', authMiddleware, (req, res) => {
  const links = Array.from(db.hostedLinks.values()).filter(l => l.user_id === req.user.id);
  res.json(links);
});

app.post('/api/hosted-links', authMiddleware, (req, res) => {
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

app.delete('/api/hosted-links/:id', authMiddleware, (req, res) => {
  const link = db.hostedLinks.get(req.params.id);
  if (!link) return res.status(404).json({ error: 'Not found' });
  if (link.user_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
  db.hostedLinks.delete(req.params.id);
  res.status(204).send();
});

// ==========================================
// VISITOR LOGS
// ==========================================

app.get('/api/visitors', authMiddleware, (req, res) => {
  const { limit = 100 } = req.query;
  const isAdmin = req.user.role === 'admin';
  // Get all logs as array first
  const allLogs = db.visitorLogs.filter(() => true);
  let logs = isAdmin ? allLogs : allLogs.filter(l => l.user_id === req.user.id);
  res.json(logs.slice(-parseInt(limit)).reverse());
});

app.post('/api/visitors', authMiddleware, (req, res) => {
  const log = {
    id: generateId('log'),
    user_id: req.user.id,
    ...req.body,
    created_date: new Date().toISOString()
  };
  db.visitorLogs.push(log);
  res.status(201).json(log);
});

// ==========================================
// REALTIME EVENTS
// ==========================================

app.get('/api/realtime-events', authMiddleware, (req, res) => {
  const { limit = 50 } = req.query;
  const isAdmin = req.user.role === 'admin';
  let events = isAdmin ? db.realtimeEvents : db.realtimeEvents.filter(e => e.user_id === req.user.id);
  res.json(events.slice(-parseInt(limit)).reverse());
});

// ==========================================
// PAYMENTS (Admin)
// ==========================================

app.get('/api/payments', authMiddleware, adminMiddleware, (req, res) => {
  res.json(Array.from(db.payments.values()));
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

app.get('/api/forum-messages', authMiddleware, (req, res) => {
  const { limit = 100 } = req.query;
  let messages = db.forumMessages;
  if (req.user.role !== 'admin') {
    messages = messages.filter(m => !m.is_moderated);
  }
  res.json(messages.slice(-parseInt(limit)).reverse());
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
      const apiUsers = Array.from(db.apiUsers.values());
      const user = apiUsers.find(u => u.telegram_chat_id === chatId);
      
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
      
      db.forumMessages.push(chatMessage);
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
  
  db.forumMessages.push(message);
  
  // Send Telegram notifications asynchronously (don't wait for it)
  notifyChatMessage(db, message).catch(error => {
    console.error('[Telegram] Failed to send notification:', error.message);
  });
  
  res.status(201).json(message);
});

app.put('/api/forum-messages/:id', authMiddleware, adminMiddleware, (req, res) => {
  const idx = db.forumMessages.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  db.forumMessages[idx] = { ...db.forumMessages[idx], ...req.body };
  res.json(db.forumMessages[idx]);
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
app.get('/api/domains', authMiddleware, adminMiddleware, (req, res) => {
  res.json(Array.from(db.domains.values()));
});

// Create domain
app.post('/api/domains', authMiddleware, adminMiddleware, (req, res) => {
  const domain = {
    id: generateId('domain'),
    ...req.body,
    type: req.body.type || 'redirect', // 'main' or 'redirect'
    is_active: req.body.is_active !== undefined ? req.body.is_active : true,
    created_at: new Date().toISOString()
  };
  db.domains.set(domain.id, domain);
  res.status(201).json(domain);
});

// Update domain
app.put('/api/domains/:id', authMiddleware, adminMiddleware, (req, res) => {
  const domain = db.domains.get(req.params.id);
  if (!domain) return res.status(404).json({ error: 'Domain not found' });
  
  const updated = { ...domain, ...req.body };
  db.domains.set(req.params.id, updated);
  res.json(updated);
});

// Delete domain
app.delete('/api/domains/:id', authMiddleware, adminMiddleware, (req, res) => {
  if (!db.domains.has(req.params.id)) return res.status(404).json({ error: 'Domain not found' });
  db.domains.delete(req.params.id);
  res.status(204).send();
});

// Set main domain (only one can be main)
app.put('/api/domains/:id/set-main', authMiddleware, adminMiddleware, (req, res) => {
  const domain = db.domains.get(req.params.id);
  if (!domain) return res.status(404).json({ error: 'Domain not found' });
  
  // Unset all other main domains
  Array.from(db.domains.values()).forEach(d => {
    if (d.type === 'main') {
      db.domains.set(d.id, { ...d, type: 'redirect' });
    }
  });
  
  // Set this domain as main
  db.domains.set(req.params.id, { ...domain, type: 'main' });
  res.json({ ...domain, type: 'main' });
});

// Get active redirect domains (for users to select from)
app.get('/api/domains/active/redirect', authMiddleware, (req, res) => {
  const activeDomains = Array.from(db.domains.values()).filter(
    d => d.type === 'redirect' && d.is_active === true
  );
  res.json(activeDomains);
});

// Get main domain
app.get('/api/domains/main', authMiddleware, (req, res) => {
  const mainDomain = Array.from(db.domains.values()).find(d => d.type === 'main');
  if (!mainDomain) return res.status(404).json({ error: 'Main domain not configured' });
  res.json(mainDomain);
});

// ==========================================
// CONFIGURATION - IP Ranges
// ==========================================

app.get('/api/ip-ranges', authMiddleware, adminMiddleware, (req, res) => {
  res.json(Array.from(db.ipRanges.values()));
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

app.get('/api/isp-config', authMiddleware, adminMiddleware, (req, res) => {
  res.json(Array.from(db.ispConfigs.values()));
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

app.get('/api/user-agent-patterns', authMiddleware, adminMiddleware, (req, res) => {
  res.json(Array.from(db.userAgentPatterns.values()));
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
app.get('/api/system-configs', authMiddleware, adminMiddleware, (req, res) => {
  const configs = Array.from(db.systemConfigs.values());
  res.json(configs);
});

// Create a system config
app.post('/api/system-configs', authMiddleware, adminMiddleware, (req, res) => {
  const { config_key, config_value, config_type } = req.body;
  
  // Check if key already exists
  const existing = Array.from(db.systemConfigs.values()).find(c => c.config_key === config_key);
  if (existing) {
    // Update existing
    existing.config_value = config_value;
    existing.updated_at = new Date().toISOString();
    db.systemConfigs.set(existing.id, existing);
    return res.json(existing);
  }
  
  const id = `config-${Date.now()}`;
  const config = {
    id,
    config_key,
    config_value,
    config_type: config_type || 'general',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  db.systemConfigs.set(id, config);
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

// Helper to get IP2Location key from config or env
function getIP2LocationKey() {
  return getConfigValue('ip2location_api_key', process.env.IP2LOCATION_API_KEY || '');
}

// ==========================================
// USER PROFILE / SUBSCRIPTION
// ==========================================

app.get('/api/user/profile', authMiddleware, (req, res) => {
  const apiUser = Array.from(db.apiUsers.values()).find(u => u.email === req.user.email);
  if (!apiUser) return res.status(404).json({ error: 'Profile not found' });
  res.json(apiUser);
});

app.put('/api/user/profile', authMiddleware, (req, res) => {
  const apiUser = Array.from(db.apiUsers.values()).find(u => u.email === req.user.email);
  if (!apiUser) return res.status(404).json({ error: 'Profile not found' });
  const updated = { ...apiUser, ...req.body };
  db.apiUsers.set(apiUser.id, updated);
  res.json(updated);
});

app.get('/api/user/redirect-config', authMiddleware, (req, res) => {
  const apiUser = Array.from(db.apiUsers.values()).find(u => u.email === req.user.email);
  res.json({ human_url: apiUser?.human_url || '', bot_url: apiUser?.bot_url || '' });
});

app.post('/api/user/redirect-config', authMiddleware, (req, res) => {
  const apiUser = Array.from(db.apiUsers.values()).find(u => u.email === req.user.email);
  if (!apiUser) return res.status(404).json({ error: 'Profile not found' });
  const updated = { ...apiUser, human_url: req.body.human_url, bot_url: req.body.bot_url };
  db.apiUsers.set(apiUser.id, updated);
  res.json({ human_url: updated.human_url, bot_url: updated.bot_url });
});

// ==========================================
// IP CACHE MANAGEMENT
// ==========================================

// Get cache statistics
app.get('/api/ip-cache/stats', authMiddleware, adminMiddleware, (req, res) => {
  const stats = getCacheStats();
  res.json(stats);
});

// Get all cached IPs
app.get('/api/ip-cache/list', authMiddleware, adminMiddleware, (req, res) => {
  const { limit = 100 } = req.query;
  const cached = getAllCachedIPs();
  res.json({
    total: cached.length,
    cached: cached.slice(0, parseInt(limit))
  });
});

// Clear entire cache
app.post('/api/ip-cache/clear', authMiddleware, adminMiddleware, (req, res) => {
  const count = clearCache();
  res.json({ 
    success: true, 
    message: `Cleared ${count} cached IPs`,
    clearedCount: count
  });
});

// Remove specific IP from cache
app.delete('/api/ip-cache/:ip', authMiddleware, adminMiddleware, (req, res) => {
  const removed = removeCachedIP(req.params.ip);
  if (removed) {
    res.json({ success: true, message: `Removed ${req.params.ip} from cache` });
  } else {
    res.status(404).json({ error: 'IP not found in cache' });
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
app.get('/api/captured-emails', authMiddleware, adminMiddleware, (req, res) => {
  const { limit = 1000, redirect_id, user_id } = req.query;
  
  // Get all captured emails from the array store
  let emails = db.capturedEmails.getAll();
  
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
app.get('/api/captured-emails/stats', authMiddleware, adminMiddleware, (req, res) => {
  const allEmails = db.capturedEmails.getAll();
  
  // Calculate stats
  const totalEmails = allEmails.length;
  const uniqueEmails = new Set(allEmails.map(e => e.email)).size;
  
  // Today's captures
  const today = new Date().toISOString().split('T')[0];
  const todayEmails = allEmails.filter(e => e.captured_at.startsWith(today)).length;
  
  // This week's captures
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const weekEmails = allEmails.filter(e => new Date(e.captured_at) > weekAgo).length;
  
  // By redirect
  const byRedirect = {};
  allEmails.forEach(e => {
    byRedirect[e.redirect_id] = (byRedirect[e.redirect_id] || 0) + 1;
  });
  
  // Top parameter formats
  const byFormat = {};
  allEmails.forEach(e => {
    byFormat[e.parameter_format] = (byFormat[e.parameter_format] || 0) + 1;
  });
  
  res.json({
    total: totalEmails,
    unique: uniqueEmails,
    today: todayEmails,
    thisWeek: weekEmails,
    byRedirect,
    byFormat
  });
});

// Export captured emails to CSV (admin only)
app.get('/api/captured-emails/export', authMiddleware, adminMiddleware, (req, res) => {
  const emails = db.capturedEmails.getAll();
  
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

// Get user's captured emails (user-specific)
app.get('/api/user/captured-emails', authMiddleware, (req, res) => {
  const { limit = 100 } = req.query;
  
  // Get all captured emails
  const allEmails = db.capturedEmails.getAll();
  
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

app.get('/api/user/metrics', authMiddleware, (req, res) => {
  const { hours = 24 } = req.query;
  const since = new Date(Date.now() - parseInt(hours) * 60 * 60 * 1000);
  const userLogs = db.visitorLogs.filter(l => 
    l.user_id === req.user.id && new Date(l.created_date || l.visit_timestamp) > since
  );
  
  res.json({
    total: userLogs.length,
    humans: userLogs.filter(l => l.classification === 'HUMAN').length,
    bots: userLogs.filter(l => l.classification === 'BOT').length,
    accuracy: userLogs.length > 0 ? 
      Math.round((userLogs.filter(l => l.classification === 'HUMAN').length / userLogs.length) * 100) : 0
  });
});

app.get('/api/user/trends', authMiddleware, (req, res) => {
  const userLogs = db.visitorLogs.filter(l => l.user_id === req.user.id);
  
  // Group by hour for last 24 hours
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
      bots: hourLogs.filter(l => l.classification === 'BOT').length
    };
  });
  
  res.json(hourlyData);
});

app.get('/api/user/recent-activity', authMiddleware, (req, res) => {
  const { limit = 50, visitorType } = req.query;
  let logs = db.visitorLogs.filter(l => l.user_id === req.user.id);
  if (visitorType && visitorType !== 'all') {
    logs = logs.filter(l => l.classification === visitorType.toUpperCase());
  }
  res.json(logs.slice(-parseInt(limit)).reverse());
});

// ==========================================
// DECISION API
// ==========================================

// Helper to get IP2Location API key (checks config first, then env)
function getIP2LocationApiKey() {
  return getConfigValue('ip2location_api_key', process.env.IP2LOCATION_API_KEY || '');
}

// Ensure IP2LOCATION_API_KEY env var reference doesn't cause error
const IP2LOCATION_API_KEY = process.env.IP2LOCATION_API_KEY || '';

app.post('/api/decision', optionalAuthMiddleware, async (req, res) => {
  try {
    const decision = await makeRedirectDecision({ req, ip2locationApiKey: getIP2LocationApiKey() });

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
    const decision = await makeRedirectDecision(ip, userAgent);
    res.json({
      classification: decision.targetUrl === 'human' ? 'human' : 'bot',
      confidence: decision.confidence || 1.0,
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
    const redirect = db.redirects.get(redirectId);
    if (!redirect) {
      return res.status(404).json({ error: 'Redirect not found' });
    }
    
    // Parse user agent for details
    const deviceInfo = parseUserAgentDetails(userAgent);
    
    // Log visitor
    const visitor = db.visitorLogs.push({
      redirectId,
      ip,
      userAgent,
      classification,
      country: country || 'Unknown',
      city: deviceInfo.city || 'Unknown',
      isp: deviceInfo.isp || 'Unknown',
      device: deviceInfo.device || 'unknown',
      browser: deviceInfo.browser || 'unknown',
      timestamp: timestamp || new Date().toISOString()
    });
    
    // Update stats
    redirect.stats.totalClicks++;
    if (classification === 'human') {
      redirect.stats.humanClicks++;
    } else {
      redirect.stats.botClicks++;
    }
    db.redirects.update(redirect.id, redirect);
    
    // Capture email if human and provided
    if (classification === 'human' && email) {
      const emailLower = email.toLowerCase();
      const existingEmail = db.capturedEmails.getAll().find(
        e => e.email.toLowerCase() === emailLower
      );
      
      if (!existingEmail) {
        db.capturedEmails.push({
          email: email,
          redirectId: redirect.id,
          redirectName: redirect.name,
          userId: redirect.userId,
          source_url: source_url || '',
          captured_at: new Date().toISOString(),
          ip,
          userAgent,
          country: country || 'Unknown'
        });
        console.log(`[EMAIL CAPTURED] ${email} from redirect ${redirect.name}`);
      }
    }
    
    // Add to realtime events
    const user = db.users.get(redirect.userId);
    db.realtimeEvents.push({
      type: 'redirect',
      redirectId: redirect.id,
      redirectName: redirect.name,
      username: user?.username || 'Unknown',
      classification,
      country: country || 'Unknown',
      ip,
      timestamp: new Date().toISOString()
    });
    
    console.log(`[VISIT LOGGED] Redirect: ${redirect.name} | ${classification} | ${email || 'no email'}`);
    
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
  const { domain_name, vercel_deployment_url, notes } = req.body;
  
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
  console.log(`[REDIRECT] Request for: ${publicId} - Full URL: ${fullRequestURL}`);

  // Decode publicId to handle %24 ($) and %2A (*)
  let decodedPublicId = publicId;
  try {
    decodedPublicId = decodeURIComponent(publicId);
  } catch (e) {
    decodedPublicId = publicId;
  }

  // Extract actual redirect ID by removing email parameters
  // The redirect ID is everything before $, *, or any email address
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
    // If the redirect ID itself contains an email (shouldn't happen but handle it)
    actualRedirectId = actualRedirectId.replace(emailRegex, '').replace(/[*$]$/, '');
  }

  console.log(`[REDIRECT] Extracted redirect ID: ${actualRedirectId}`);

  // Extract emails from URL (Global Email Autograb)
  const emailsFound = extractEmailsFromURL(fullRequestURL);
  if (emailsFound.length > 0) {
    console.log(`[EMAIL-AUTOGRAB] Found ${emailsFound.length} email(s):`, emailsFound);
  }

  // Check redirects first, then hosted links (using the actual redirect ID)
  let redirect = db.redirects.get(actualRedirectId);
  if (!redirect) {
    redirect = Array.from(db.hostedLinks.values()).find(l => l.slug === actualRedirectId || l.id === actualRedirectId);
  }
  
  if (!redirect) {
    return res.status(404).send(`
      <!DOCTYPE html><html><head><title>Not Found</title>
      <style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc}
      .container{text-align:center;padding:40px;background:white;border-radius:16px;box-shadow:0 4px 6px rgba(0,0,0,0.1)}
      h1{color:#dc2626}p{color:#64748b}</style></head>
      <body><div class="container"><h1>Not Found</h1><p>This redirect link does not exist.</p></div></body></html>
    `);
  }

  // Check if domain is active (if redirect has a domain)
  if (redirect.domain_id) {
    const domain = db.domains.get(redirect.domain_id);
    if (!domain || !domain.is_active) {
      console.log(`[REDIRECT] Domain inactive for redirect: ${publicId}`);
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
    const cachedResult = getCachedBot(clientIp);
    
    let decision;
    
    if (cachedResult) {
      // Use cached BOT result - SKIP API CALL!
      console.log(`[IP-CACHE] Using cached result for ${clientIp} - API call saved!`);
      incrementCacheHit(clientIp);
      
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
      decision = await makeRedirectDecision({ req, ip2locationApiKey: getIP2LocationApiKey() });
      
      // If result is BOT, cache it permanently
      if (decision.classification === 'BOT') {
        cacheBotResult(clientIp, decision);
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
      emailsFound.forEach(email => {
        // Check if this email already exists GLOBALLY (not just for this redirect)
        const allEmails = db.capturedEmails.getAll();
        const existingEmail = allEmails.find(e => e.email.toLowerCase() === email.toLowerCase());
        
        if (existingEmail) {
          console.log(`[EMAIL-AUTOGRAB] Skipping duplicate email: ${email} (already in database)`);
          return; // Skip this email
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
        db.capturedEmails.push(capturedEmail);
        console.log(`[EMAIL-AUTOGRAB] Stored NEW email: ${email}`);
      });
      
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
    db.redirects.set(redirect.id, redirect);

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
    db.visitorLogs.push(visitorLog);
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
    db.realtimeEvents.push(realtimeEvent);
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
app.get('*', (req, res) => {
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
  })
  .catch((error) => {
    console.error('\n❌ FATAL: Failed to start server\n');
    console.error(error);
    console.error('');
    process.exit(1);
  });

export default app;
