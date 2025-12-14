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

export default {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  authMiddleware,
  optionalAuthMiddleware
};

