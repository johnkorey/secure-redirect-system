/**
 * IP Range Blacklist System
 * Automatically blacklists entire IP ranges (CIDR blocks) when bots are detected
 * Massively reduces API calls by blocking 256-65K IPs with a single entry
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BLACKLIST_FILE = path.join(__dirname, '..', 'data', 'ip-range-blacklist.json');

// In-memory blacklist for fast lookups
let blacklist = {
  ranges: [], // Array of CIDR ranges
  stats: {
    totalRanges: 0,
    totalIPsBlocked: 0,
    hits: 0,
    apiCallsSaved: 0,
    lastUpdated: new Date().toISOString()
  }
};

/**
 * Convert IP string to 32-bit integer
 * @param {string} ip - IP address (e.g., "192.168.1.1")
 * @returns {number} 32-bit integer
 */
function ipToInt(ip) {
  return ip.split('.').reduce((int, octet) => (int << 8) + parseInt(octet, 10), 0) >>> 0;
}

/**
 * Convert 32-bit integer to IP string
 * @param {number} int - 32-bit integer
 * @returns {string} IP address
 */
function intToIp(int) {
  return [(int >>> 24) & 255, (int >>> 16) & 255, (int >>> 8) & 255, int & 255].join('.');
}

/**
 * Check if IP is in a CIDR range
 * @param {string} ip - IP address to check
 * @param {string} cidr - CIDR notation (e.g., "192.168.1.0/24")
 * @returns {boolean}
 */
function ipInRange(ip, cidr) {
  const [range, bits = 32] = cidr.split('/');
  const mask = ~(2 ** (32 - bits) - 1);
  return (ipToInt(ip) & mask) === (ipToInt(range) & mask);
}

/**
 * Get CIDR range from IP based on usage type
 * @param {string} ip - IP address
 * @param {string} usageType - Usage type from IP2Location (DCH, SES, ISP, MOB, etc.)
 * @returns {string} CIDR notation
 */
function getCIDRFromIP(ip, usageType) {
  // Data centers and hosting: Block /24 (256 IPs)
  if (['DCH', 'SES', 'RSV', 'CDN'].includes(usageType)) {
    const parts = ip.split('.');
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }
  
  // VPN/Proxy services: Block /24
  // (These are usually commercial VPN services)
  if (usageType === 'SES' || usageType === 'RSV') {
    const parts = ip.split('.');
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }
  
  // ISPs and Mobile: Only block individual IP (/32)
  // Real people use these!
  if (['ISP', 'MOB', 'COM', 'ORG', 'EDU', 'GOV', 'MIL', 'LIB'].includes(usageType)) {
    return `${ip}/32`;
  }
  
  // Unknown or empty: Be conservative, block individual IP
  return `${ip}/32`;
}

/**
 * Calculate number of IPs in a CIDR range
 * @param {string} cidr - CIDR notation
 * @returns {number}
 */
function getIPCountInRange(cidr) {
  const [, bits = 32] = cidr.split('/');
  return 2 ** (32 - parseInt(bits, 10));
}

/**
 * Load blacklist from disk
 */
function loadBlacklist() {
  try {
    if (fs.existsSync(BLACKLIST_FILE)) {
      const data = fs.readFileSync(BLACKLIST_FILE, 'utf8');
      blacklist = JSON.parse(data);
      console.log(`[IP-Range-Blacklist] Loaded ${blacklist.ranges.length} ranges blocking ${blacklist.stats.totalIPsBlocked.toLocaleString()} IPs`);
    } else {
      console.log('[IP-Range-Blacklist] No blacklist file found, starting fresh');
    }
  } catch (error) {
    console.error('[IP-Range-Blacklist] Error loading blacklist:', error.message);
    blacklist = {
      ranges: [],
      stats: {
        totalRanges: 0,
        totalIPsBlocked: 0,
        hits: 0,
        apiCallsSaved: 0,
        lastUpdated: new Date().toISOString()
      }
    };
  }
}

/**
 * Save blacklist to disk (debounced)
 */
let saveTimeout = null;
function saveBlacklist() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      const dir = path.dirname(BLACKLIST_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(blacklist, null, 2), 'utf8');
      console.log(`[IP-Range-Blacklist] Saved ${blacklist.ranges.length} ranges`);
    } catch (error) {
      console.error('[IP-Range-Blacklist] Error saving blacklist:', error.message);
    }
  }, 2000);
}

/**
 * Check if IP is in blacklist
 * Returns immediately without any API calls!
 * @param {string} ip - IP address to check
 * @returns {object|null} Blacklist entry or null
 */
export function isIPBlacklisted(ip) {
  if (!ip || ip === '127.0.0.1' || ip === '::1') {
    return null;
  }
  
  // Check against all ranges
  for (const entry of blacklist.ranges) {
    if (ipInRange(ip, entry.cidr)) {
      // Update stats
      blacklist.stats.hits++;
      blacklist.stats.apiCallsSaved++;
      entry.hit_count = (entry.hit_count || 0) + 1;
      entry.last_hit = new Date().toISOString();
      
      console.log(`[IP-Range-Blacklist] ⚫ BLOCKED: ${ip} matches range ${entry.cidr} (${entry.reason})`);
      
      // Debounced save (don't save on every hit)
      if (blacklist.stats.hits % 10 === 0) {
        saveBlacklist();
      }
      
      return {
        blocked: true,
        ip: ip,
        cidr: entry.cidr,
        reason: entry.reason,
        usage_type: entry.usage_type,
        first_seen: entry.added_at,
        hit_count: entry.hit_count
      };
    }
  }
  
  return null;
}

/**
 * Add IP range to blacklist
 * @param {string} ip - Original bot IP
 * @param {object} decision - Classification decision with clientInfo
 * @returns {object} Added entry
 */
export function addToBlacklist(ip, decision) {
  if (!ip || ip === '127.0.0.1' || ip === '::1') {
    return null;
  }
  
  const usageType = decision.clientInfo?.usageType || 'UNKNOWN';
  const cidr = getCIDRFromIP(ip, usageType);
  
  // Check if range already exists
  const existing = blacklist.ranges.find(r => r.cidr === cidr);
  if (existing) {
    console.log(`[IP-Range-Blacklist] Range ${cidr} already blacklisted`);
    return existing;
  }
  
  const ipCount = getIPCountInRange(cidr);
  
  const entry = {
    cidr: cidr,
    original_ip: ip,
    reason: decision.reason || 'Bot detected',
    usage_type: usageType,
    country: decision.clientInfo?.country || 'Unknown',
    isp: decision.clientInfo?.isp || 'Unknown',
    ip_count: ipCount,
    added_at: new Date().toISOString(),
    hit_count: 0,
    last_hit: null,
    added_by: 'auto' // or 'admin' for manual additions
  };
  
  blacklist.ranges.push(entry);
  blacklist.stats.totalRanges = blacklist.ranges.length;
  blacklist.stats.totalIPsBlocked += ipCount;
  blacklist.stats.lastUpdated = new Date().toISOString();
  
  console.log(`[IP-Range-Blacklist] ✓ ADDED: ${cidr} (${ipCount} IPs) - ${usageType} - ${entry.reason}`);
  
  saveBlacklist();
  
  return entry;
}

/**
 * Remove IP range from blacklist
 * @param {string} cidr - CIDR notation
 * @returns {boolean}
 */
export function removeFromBlacklist(cidr) {
  const index = blacklist.ranges.findIndex(r => r.cidr === cidr);
  
  if (index === -1) {
    return false;
  }
  
  const entry = blacklist.ranges[index];
  blacklist.stats.totalIPsBlocked -= entry.ip_count;
  blacklist.ranges.splice(index, 1);
  blacklist.stats.totalRanges = blacklist.ranges.length;
  blacklist.stats.lastUpdated = new Date().toISOString();
  
  console.log(`[IP-Range-Blacklist] ✗ REMOVED: ${cidr}`);
  
  saveBlacklist();
  
  return true;
}

/**
 * Get all blacklisted ranges
 * @returns {array}
 */
export function getAllBlacklistedRanges() {
  return blacklist.ranges.sort((a, b) => (b.hit_count || 0) - (a.hit_count || 0));
}

/**
 * Get blacklist statistics
 * @returns {object}
 */
export function getBlacklistStats() {
  return {
    totalRanges: blacklist.stats.totalRanges,
    totalIPsBlocked: blacklist.stats.totalIPsBlocked,
    hits: blacklist.stats.hits,
    apiCallsSaved: blacklist.stats.apiCallsSaved,
    lastUpdated: blacklist.stats.lastUpdated,
    efficiency: blacklist.ranges.length > 0 
      ? `${Math.round(blacklist.stats.totalIPsBlocked / blacklist.ranges.length)} IPs per range`
      : '0 IPs per range'
  };
}

/**
 * Clear entire blacklist
 */
export function clearBlacklist() {
  const count = blacklist.ranges.length;
  blacklist = {
    ranges: [],
    stats: {
      totalRanges: 0,
      totalIPsBlocked: 0,
      hits: 0,
      apiCallsSaved: 0,
      lastUpdated: new Date().toISOString()
    }
  };
  saveBlacklist();
  console.log(`[IP-Range-Blacklist] Cleared ${count} ranges`);
  return count;
}

/**
 * Import known bot ranges (e.g., AWS, Azure, Google Cloud)
 * @param {array} ranges - Array of {cidr, reason, usage_type}
 */
export function importBotRanges(ranges) {
  let imported = 0;
  
  for (const range of ranges) {
    const existing = blacklist.ranges.find(r => r.cidr === range.cidr);
    if (!existing) {
      const ipCount = getIPCountInRange(range.cidr);
      blacklist.ranges.push({
        cidr: range.cidr,
        original_ip: null,
        reason: range.reason || 'Known bot range',
        usage_type: range.usage_type || 'DCH',
        country: range.country || 'Unknown',
        isp: range.isp || 'Unknown',
        ip_count: ipCount,
        added_at: new Date().toISOString(),
        hit_count: 0,
        last_hit: null,
        added_by: 'import'
      });
      blacklist.stats.totalIPsBlocked += ipCount;
      imported++;
    }
  }
  
  blacklist.stats.totalRanges = blacklist.ranges.length;
  blacklist.stats.lastUpdated = new Date().toISOString();
  
  console.log(`[IP-Range-Blacklist] Imported ${imported} new ranges`);
  
  saveBlacklist();
  
  return imported;
}

// Initialize blacklist on module load
loadBlacklist();

export default {
  isIPBlacklisted,
  addToBlacklist,
  removeFromBlacklist,
  getAllBlacklistedRanges,
  getBlacklistStats,
  clearBlacklist,
  importBotRanges
};

