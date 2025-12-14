/**
 * IP Classification Cache
 * Caches bot detection results to reduce external API calls
 * Only caches BOT classifications (forever/permanent)
 * HUMAN classifications are NOT cached (may change over time)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(__dirname, '..', 'data', 'ip-cache.json');

// In-memory cache for fast access
let cache = {
  bots: {}, // IP -> classification data
  stats: {
    hits: 0,
    misses: 0,
    totalSaved: 0,
    lastReset: new Date().toISOString()
  }
};

/**
 * Load cache from disk
 */
function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, 'utf8');
      cache = JSON.parse(data);
      console.log(`[IP-Cache] Loaded ${Object.keys(cache.bots || {}).length} cached bot IPs`);
    } else {
      console.log('[IP-Cache] No cache file found, starting fresh');
    }
  } catch (error) {
    console.error('[IP-Cache] Error loading cache:', error.message);
    cache = {
      bots: {},
      stats: {
        hits: 0,
        misses: 0,
        totalSaved: 0,
        lastReset: new Date().toISOString()
      }
    };
  }
}

/**
 * Save cache to disk (debounced)
 */
let saveTimeout = null;
function saveCache() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      const dir = path.dirname(CACHE_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
      console.log(`[IP-Cache] Saved ${Object.keys(cache.bots).length} cached IPs`);
    } catch (error) {
      console.error('[IP-Cache] Error saving cache:', error.message);
    }
  }, 2000); // Save after 2 seconds of inactivity
}

/**
 * Check if IP is cached as a bot
 * @param {string} ip - IP address to check
 * @returns {object|null} Cached result or null
 */
export function getCachedBot(ip) {
  if (!ip || ip === '127.0.0.1' || ip === '::1') {
    return null; // Don't cache localhost
  }
  
  const cached = cache.bots[ip];
  
  if (cached) {
    cache.stats.hits++;
    console.log(`[IP-Cache] ✓ HIT for ${ip} - Saved API call!`);
    return cached;
  }
  
  cache.stats.misses++;
  console.log(`[IP-Cache] ✗ MISS for ${ip} - Will call API`);
  return null;
}

/**
 * Cache a BOT classification result (permanent)
 * Only caches BOTs, not HUMANs
 * @param {string} ip - IP address
 * @param {object} decision - Classification decision object
 */
export function cacheBotResult(ip, decision) {
  if (!ip || ip === '127.0.0.1' || ip === '::1') {
    return; // Don't cache localhost
  }
  
  // Only cache BOT classifications
  if (decision.classification !== 'BOT') {
    console.log(`[IP-Cache] Not caching ${ip} - Classification is ${decision.classification} (only BOTs are cached)`);
    return;
  }
  
  const cacheEntry = {
    ip: ip,
    classification: decision.classification,
    reason: decision.reason,
    trustLevel: decision.trustLevel,
    clientInfo: {
      country: decision.clientInfo.country,
      region: decision.clientInfo.region,
      city: decision.clientInfo.city,
      isp: decision.clientInfo.isp,
      usageType: decision.clientInfo.usageType
    },
    cached_at: new Date().toISOString(),
    hit_count: 1
  };
  
  cache.bots[ip] = cacheEntry;
  cache.stats.totalSaved++;
  
  console.log(`[IP-Cache] ✓ CACHED BOT: ${ip} - Reason: ${decision.reason}`);
  saveCache();
}

/**
 * Update hit count for cached IP (for analytics)
 * @param {string} ip - IP address
 */
export function incrementCacheHit(ip) {
  if (cache.bots[ip]) {
    cache.bots[ip].hit_count = (cache.bots[ip].hit_count || 1) + 1;
    cache.bots[ip].last_hit = new Date().toISOString();
    saveCache();
  }
}

/**
 * Get cache statistics
 * @returns {object} Cache stats
 */
export function getCacheStats() {
  const totalCached = Object.keys(cache.bots).length;
  const hitRate = cache.stats.hits + cache.stats.misses > 0 
    ? ((cache.stats.hits / (cache.stats.hits + cache.stats.misses)) * 100).toFixed(2)
    : 0;
  
  return {
    totalCachedIPs: totalCached,
    cacheHits: cache.stats.hits,
    cacheMisses: cache.stats.misses,
    hitRate: hitRate + '%',
    apiCallsSaved: cache.stats.hits,
    totalSavedToCache: cache.stats.totalSaved,
    lastReset: cache.stats.lastReset
  };
}

/**
 * Get all cached IPs
 * @returns {array} Array of cached entries
 */
export function getAllCachedIPs() {
  return Object.values(cache.bots).sort((a, b) => 
    (b.hit_count || 0) - (a.hit_count || 0)
  );
}

/**
 * Clear entire cache
 */
export function clearCache() {
  const count = Object.keys(cache.bots).length;
  cache = {
    bots: {},
    stats: {
      hits: 0,
      misses: 0,
      totalSaved: 0,
      lastReset: new Date().toISOString()
    }
  };
  saveCache();
  console.log(`[IP-Cache] Cleared ${count} cached IPs`);
  return count;
}

/**
 * Remove a specific IP from cache
 * @param {string} ip - IP address to remove
 */
export function removeCachedIP(ip) {
  if (cache.bots[ip]) {
    delete cache.bots[ip];
    saveCache();
    console.log(`[IP-Cache] Removed ${ip} from cache`);
    return true;
  }
  return false;
}

// Initialize cache on module load
loadCache();

export default {
  getCachedBot,
  cacheBotResult,
  incrementCacheHit,
  getCacheStats,
  getAllCachedIPs,
  clearCache,
  removeCachedIP
};

