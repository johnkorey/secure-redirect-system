/**
 * Authentication Module
 * Handles JWT token generation, verification, and password hashing
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// Get JWT secret from env or use a default (CHANGE IN PRODUCTION!)
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Hash a password
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
export async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * Compare password with hash
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {Promise<boolean>} True if match
 */
export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Generate JWT token
 * @param {Object} payload - Data to encode in token
 * @returns {string} JWT token
 */
export function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify JWT token
 * @param {string} token - JWT token
 * @returns {Object|null} Decoded payload or null if invalid
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

/**
 * Express middleware to protect routes
 * Extracts user from JWT token in Authorization header
 */
export function authMiddleware(req, res, next) {
  // Get token from header
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided', code: 'NO_TOKEN' });
  }

  const token = authHeader.split(' ')[1];
  
  // Verify token
  const decoded = verifyToken(token);
  
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token', code: 'INVALID_TOKEN' });
  }

  // Attach user to request
  req.user = decoded;
  next();
}

/**
 * Optional auth middleware - doesn't fail if no token
 * Useful for routes that work differently for authenticated users
 */
export function optionalAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (decoded) {
      req.user = decoded;
    }
  }
  
  next();
}

/**
 * Subscription validation middleware
 * Checks if user's subscription is active (not expired)
 * Must be used after authMiddleware
 * Admins bypass this check
 */
export async function subscriptionMiddleware(req, res, next, db) {
  try {
    // Admin users bypass subscription checks
    if (req.user.role === 'admin') {
      return next();
    }

    // Get user's subscription details from API user
    const apiUser = await db.apiUsers.findByEmail(req.user.email);
    
    if (!apiUser) {
      return res.status(403).json({ 
        error: 'Subscription not found',
        code: 'NO_SUBSCRIPTION',
        requiresRenewal: true
      });
    }

    // Check if subscription has expired
    if (apiUser.subscription_expiry) {
      const expiryDate = new Date(apiUser.subscription_expiry);
      const now = new Date();

      if (expiryDate < now) {
        return res.status(403).json({ 
          error: 'Your subscription has expired. Please renew to continue using the service.',
          code: 'SUBSCRIPTION_EXPIRED',
          expiredAt: apiUser.subscription_expiry,
          requiresRenewal: true
        });
      }
    }

    // Check if user is banned
    if (apiUser.status === 'banned') {
      return res.status(403).json({ 
        error: 'Your account has been suspended. Please contact support for assistance.',
        code: 'ACCOUNT_BANNED',
        status: apiUser.status,
        requiresRenewal: false
      });
    }

    // Check if subscription is active
    if (apiUser.status !== 'active') {
      return res.status(403).json({ 
        error: 'Your subscription is not active. Please contact support or renew your subscription.',
        code: 'SUBSCRIPTION_INACTIVE',
        status: apiUser.status,
        requiresRenewal: true
      });
    }

    // Attach apiUser to request for later use
    req.apiUser = apiUser;
    next();
  } catch (error) {
    console.error('[SUBSCRIPTION-CHECK] Error:', error);
    return res.status(500).json({ error: 'Failed to validate subscription' });
  }
}

export default {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  authMiddleware,
  optionalAuthMiddleware,
  subscriptionMiddleware
};

