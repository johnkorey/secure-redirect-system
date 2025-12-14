/**
 * Simple in-memory cache with TTL (Time To Live)
 * Used to cache redirect configurations for 5 minutes
 */

const cache = new Map();

/**
 * Get value from cache
 * @param {string} key - Cache key
 * @returns {any|null} - Cached value or null if expired/not found
 */
export const cacheGet = (key) => {
  const item = cache.get(key);
  if (!item) return null;
  
  // Check if expired
  if (Date.now() > item.expiry) {
    cache.delete(key);
    return null;
  }
  
  return item.value;
};

/**
 * Set value in cache with TTL
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttlSeconds - Time to live in seconds (default: 300 = 5 minutes)
 */
export const cacheSet = (key, value, ttlSeconds = 300) => {
  cache.set(key, {
    value,
    expiry: Date.now() + (ttlSeconds * 1000)
  });
};

/**
 * Clear cache entry or entire cache
 * @param {string} key - Cache key to clear (optional, clears all if not provided)
 */
export const cacheClear = (key) => {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
};

/**
 * Get cache statistics
 * @returns {object} - Cache stats
 */
export const cacheStats = () => {
  const now = Date.now();
  let validCount = 0;
  let expiredCount = 0;
  
  cache.forEach((item) => {
    if (now > item.expiry) {
      expiredCount++;
    } else {
      validCount++;
    }
  });
  
  return {
    total: cache.size,
    valid: validCount,
    expired: expiredCount
  };
};

