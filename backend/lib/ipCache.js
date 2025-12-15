/**
 * IP Classification Cache
 * Caches bot detection results to reduce external API calls
 * Only caches BOT classifications (forever/permanent)
 * HUMAN classifications are NOT cached (may change over time)
 * 
 * USES POSTGRESQL DATABASE FOR PERSISTENCE
 */

import { query } from './postgresDatabase.js';

// In-memory stats for quick access
let stats = {
  hits: 0,
  misses: 0,
  totalSaved: 0,
  lastReset: new Date().toISOString()
};

/**
 * Check if IP is cached as a bot
 * @param {string} ip - IP address to check
 * @returns {object|null} Cached result or null
 */
export async function getCachedBot(ip) {
  if (!ip || ip === '127.0.0.1' || ip === '::1') {
    return null; // Don't cache localhost
  }
  
  try {
    const result = await query('SELECT * FROM ip_cache WHERE ip = $1', [ip]);
    
    if (result.rows[0]) {
      // Update hit count and last_hit
      await query(
        'UPDATE ip_cache SET hit_count = hit_count + 1, last_hit = CURRENT_TIMESTAMP WHERE ip = $1',
        [ip]
      );
      
      stats.hits++;
      console.log(`[IP-Cache] ✓ HIT for ${ip} - Saved API call!`);
      
      const cached = result.rows[0];
      return {
        ip: cached.ip,
        classification: cached.classification,
        reason: cached.reason,
        trustLevel: cached.trust_level,
        clientInfo: {
          country: cached.country,
          region: cached.region,
          city: cached.city,
          isp: cached.isp,
          usageType: cached.usage_type
        },
        cached_at: cached.cached_at,
        hit_count: cached.hit_count
      };
    }
    
    stats.misses++;
    console.log(`[IP-Cache] ✗ MISS for ${ip} - Will call API`);
    return null;
  } catch (error) {
    console.error('[IP-Cache] Error checking cache:', error.message);
    return null;
  }
}

/**
 * Cache a BOT classification result (permanent)
 * Only caches BOTs, not HUMANs
 * @param {string} ip - IP address
 * @param {object} decision - Classification decision object
 */
export async function cacheBotResult(ip, decision) {
  if (!ip || ip === '127.0.0.1' || ip === '::1') {
    return; // Don't cache localhost
  }
  
  // Only cache BOT classifications
  if (decision.classification !== 'BOT') {
    console.log(`[IP-Cache] Not caching ${ip} - Classification is ${decision.classification} (only BOTs are cached)`);
    return;
  }
  
  try {
    // Use INSERT ... ON CONFLICT to handle duplicates
    await query(
      `INSERT INTO ip_cache (
        ip, classification, reason, trust_level, 
        country, region, city, isp, usage_type, 
        hit_count, cached_at, last_hit
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (ip) 
      DO UPDATE SET 
        hit_count = ip_cache.hit_count + 1,
        last_hit = CURRENT_TIMESTAMP`,
      [
        ip,
        decision.classification,
        decision.reason,
        decision.trustLevel,
        decision.clientInfo?.country || 'Unknown',
        decision.clientInfo?.region || 'Unknown',
        decision.clientInfo?.city || 'Unknown',
        decision.clientInfo?.isp || 'Unknown',
        decision.clientInfo?.usageType || 'Unknown'
      ]
    );
    
    stats.totalSaved++;
    console.log(`[IP-Cache] ✓ CACHED BOT: ${ip} - Reason: ${decision.reason}`);
  } catch (error) {
    console.error('[IP-Cache] Error caching bot:', error.message);
  }
}

/**
 * Update hit count for cached IP (for analytics)
 * @param {string} ip - IP address
 */
export async function incrementCacheHit(ip) {
  try {
    await query(
      'UPDATE ip_cache SET hit_count = hit_count + 1, last_hit = CURRENT_TIMESTAMP WHERE ip = $1',
      [ip]
    );
  } catch (error) {
    console.error('[IP-Cache] Error incrementing hit count:', error.message);
  }
}

/**
 * Get cache statistics
 * @returns {object} Cache stats
 */
export async function getCacheStats() {
  try {
    const result = await query('SELECT COUNT(*) as total, SUM(hit_count) as total_hits FROM ip_cache');
    const totalCached = parseInt(result.rows[0].total) || 0;
    const totalHits = parseInt(result.rows[0].total_hits) || 0;
    
    const hitRate = stats.hits + stats.misses > 0 
      ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(2)
      : 0;
    
    return {
      totalCachedIPs: totalCached,
      cacheHits: stats.hits,
      cacheMisses: stats.misses,
      hitRate: hitRate + '%',
      apiCallsSaved: stats.hits,
      totalSavedToCache: stats.totalSaved,
      totalHitsAllTime: totalHits,
      lastReset: stats.lastReset
    };
  } catch (error) {
    console.error('[IP-Cache] Error getting stats:', error.message);
    return {
      totalCachedIPs: 0,
      cacheHits: stats.hits,
      cacheMisses: stats.misses,
      hitRate: '0%',
      apiCallsSaved: stats.hits,
      totalSavedToCache: stats.totalSaved,
      lastReset: stats.lastReset
    };
  }
}

/**
 * Get all cached IPs
 * @returns {array} Array of cached entries
 */
export async function getAllCachedIPs() {
  try {
    const result = await query('SELECT * FROM ip_cache ORDER BY hit_count DESC, cached_at DESC');
    return result.rows.map(row => ({
      ip: row.ip,
      classification: row.classification,
      reason: row.reason,
      trustLevel: row.trust_level,
      clientInfo: {
        country: row.country,
        region: row.region,
        city: row.city,
        isp: row.isp,
        usageType: row.usage_type
      },
      cached_at: row.cached_at,
      last_hit: row.last_hit,
      hit_count: row.hit_count
    }));
  } catch (error) {
    console.error('[IP-Cache] Error getting all IPs:', error.message);
    return [];
  }
}

/**
 * Clear entire cache
 */
export async function clearCache() {
  try {
    const result = await query('SELECT COUNT(*) as count FROM ip_cache');
    const count = parseInt(result.rows[0].count) || 0;
    
    await query('DELETE FROM ip_cache');
    
    // Reset stats
    stats = {
      hits: 0,
      misses: 0,
      totalSaved: 0,
      lastReset: new Date().toISOString()
    };
    
    console.log(`[IP-Cache] Cleared ${count} cached IPs`);
    return count;
  } catch (error) {
    console.error('[IP-Cache] Error clearing cache:', error.message);
    return 0;
  }
}

/**
 * Remove a specific IP from cache
 * @param {string} ip - IP address to remove
 */
export async function removeCachedIP(ip) {
  try {
    const result = await query('DELETE FROM ip_cache WHERE ip = $1 RETURNING *', [ip]);
    if (result.rows.length > 0) {
      console.log(`[IP-Cache] Removed ${ip} from cache`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('[IP-Cache] Error removing IP:', error.message);
    return false;
  }
}

export default {
  getCachedBot,
  cacheBotResult,
  incrementCacheHit,
  getCacheStats,
  getAllCachedIPs,
  clearCache,
  removeCachedIP
};

