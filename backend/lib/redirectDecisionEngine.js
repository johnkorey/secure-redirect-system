/**
 * Redirect Decision Engine
 * Combines Stage 1 (Local Validation) and Stage 2 (IP2Location Rules)
 * to determine whether traffic is human or bot
 * Now with IP Range Blacklist - checks blacklist FIRST before any API calls!
 */

import { validateUserAgent, parseUserAgentDetails } from './userAgentValidator.js';
import { validateIP, getClientIP } from './ip2locationValidator.js';
import { isIPBlacklisted, addToBlacklist } from './ipRangeBlacklist.js';

/**
 * Main decision function to classify traffic
 * @param {Object} params - Request parameters
 * @param {Object} params.req - Express request object
 * @param {string} params.ip2locationApiKey - IP2Location API key
 * @returns {Object} Decision result
 */
export async function makeRedirectDecision({ req, ip2locationApiKey }) {
  const startTime = Date.now();
  
  const decision = {
    classification: 'HUMAN',
    trustLevel: 'high',
    shouldRedirectToBot: false,
    stage: null,
    reason: null,
    processingTimeMs: 0,
    clientInfo: {
      ip: null,
      userAgent: null,
      browser: null,
      browserVersion: null,
      os: null,
      device: null,
      deviceType: null,
      country: null,
      region: null,
      city: null,
      isp: null
    },
    validationDetails: {
      stage1: null,
      stage2: null
    }
  };

  // Extract client information
  const userAgent = req.headers['user-agent'] || req.get('User-Agent') || '';
  const clientIP = getClientIP(req);
  
  decision.clientInfo.ip = clientIP;
  decision.clientInfo.userAgent = userAgent;

  // ==========================================
  // STAGE 0: IP Range Blacklist (INSTANT!)
  // Check blacklist BEFORE any API calls
  // ==========================================
  const blacklistCheck = isIPBlacklisted(clientIP);
  if (blacklistCheck) {
    // IP is in blacklisted range - instant BOT classification!
    decision.classification = 'BOT';
    decision.shouldRedirectToBot = true;
    decision.stage = 0; // Stage 0 = Blacklist check
    decision.reason = `IP Range Blacklisted: ${blacklistCheck.cidr} - ${blacklistCheck.reason}`;
    decision.trustLevel = 'none';
    decision.processingTimeMs = Date.now() - startTime;
    decision.clientInfo.country = 'Blacklisted';
    decision.clientInfo.isp = 'Blacklisted';
    decision.validationDetails.blacklist = blacklistCheck;
    
    console.log(`[DECISION] ⚫ BLACKLIST HIT - IP ${clientIP} in range ${blacklistCheck.cidr} - INSTANT BOT (no API call!)`);
    return decision;
  }
  
  console.log(`[DECISION] Blacklist check passed for ${clientIP}`);

  // Parse User-Agent details
  const uaDetails = parseUserAgentDetails(userAgent);
  decision.clientInfo.browser = uaDetails.browser;
  decision.clientInfo.browserVersion = uaDetails.browserVersion;
  decision.clientInfo.os = uaDetails.os;
  decision.clientInfo.device = uaDetails.device;
  decision.clientInfo.deviceType = uaDetails.deviceType;

  // ==========================================
  // STAGE 1: Local Validation (No API Call)
  // ==========================================
  const stage1Result = validateUserAgent(userAgent);
  decision.validationDetails.stage1 = stage1Result;

  if (!stage1Result.isValid) {
    // Stage 1 failed - classify as BOT
    decision.classification = 'BOT';
    decision.shouldRedirectToBot = true;
    decision.stage = 1;
    decision.reason = stage1Result.reason;
    decision.processingTimeMs = Date.now() - startTime;
    
    console.log(`[DECISION] Stage 1 BOT - Reason: ${stage1Result.reason}, UA: ${userAgent.substring(0, 100)}`);
    
    // Auto-blacklist Stage 1 bots too (individual IP only, no range data yet)
    // We'll use /32 (single IP) since we don't have usage_type from IP2Location yet
    try {
      const blacklistEntry = addToBlacklist(clientIP, {
        ...decision,
        clientInfo: { ...decision.clientInfo, usageType: 'UNKNOWN' }
      });
      if (blacklistEntry) {
        console.log(`[DECISION] ✓ Auto-blacklisted IP ${clientIP} (Stage 1 bot)`);
      }
    } catch (error) {
      console.error('[DECISION] Error adding to blacklist:', error.message);
    }
    
    return decision;
  }

  console.log(`[DECISION] Stage 1 PASSED - Browser: ${uaDetails.browser}, Device: ${uaDetails.deviceType}`);

  // ==========================================
  // STAGE 2: IP2Location Rules
  // ==========================================
  const stage2Result = await validateIP(clientIP, ip2locationApiKey);
  decision.validationDetails.stage2 = stage2Result;

  // Update client info with IP data
  if (stage2Result.details) {
    decision.clientInfo.country = stage2Result.details.country;
    decision.clientInfo.region = stage2Result.details.region;
    decision.clientInfo.city = stage2Result.details.city;
    decision.clientInfo.isp = stage2Result.details.isp;
  }

  if (!stage2Result.isValid) {
    // Stage 2 failed - classify as BOT
    decision.classification = 'BOT';
    decision.shouldRedirectToBot = true;
    decision.stage = 2;
    decision.reason = stage2Result.reason;
    decision.trustLevel = 'none';
    decision.processingTimeMs = Date.now() - startTime;
    
    console.log(`[DECISION] Stage 2 BOT - Reason: ${stage2Result.reason}, IP: ${clientIP}`);
    
    // ==========================================
    // AUTO-BLACKLIST: Add bot IP range to blacklist
    // This will block future IPs from the same range WITHOUT API calls!
    // ==========================================
    try {
      const blacklistEntry = addToBlacklist(clientIP, decision);
      if (blacklistEntry) {
        console.log(`[DECISION] ✓ Auto-blacklisted range ${blacklistEntry.cidr} (${blacklistEntry.ip_count} IPs)`);
      }
    } catch (error) {
      console.error('[DECISION] Error adding to blacklist:', error.message);
    }
    
    return decision;
  }

  // All checks passed - HUMAN traffic
  decision.classification = 'HUMAN';
  decision.shouldRedirectToBot = false;
  decision.stage = 2;
  decision.trustLevel = stage2Result.trustLevel;
  decision.reason = stage2Result.reason;
  decision.processingTimeMs = Date.now() - startTime;

  console.log(`[DECISION] HUMAN - Trust: ${stage2Result.trustLevel}, IP: ${clientIP}`);
  return decision;
}

/**
 * Quick check for obvious bots (for lightweight validation)
 * @param {string} userAgent - User-Agent string
 * @returns {boolean} True if obviously a bot
 */
export function isObviousBot(userAgent) {
  if (!userAgent) return true;
  
  const ua = userAgent.toLowerCase();
  
  const obviouxBotSignatures = [
    'bot', 'crawler', 'spider', 'scraper', 'headless',
    'phantom', 'selenium', 'puppeteer', 'playwright',
    'curl', 'wget', 'python-requests', 'python-urllib',
    'java/', 'go-http', 'node-fetch', 'axios'
  ];
  
  return obviouxBotSignatures.some(sig => ua.includes(sig));
}

export default {
  makeRedirectDecision,
  isObviousBot
};

